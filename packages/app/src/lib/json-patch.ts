import { diffArrays, diffLines } from "diff";
import { jsonFile } from "@renovate-config-debugger/engine/json";

/**
 * Builds the unified diff between two JSON values without ever running a
 * line-level Myers diff over two large texts.
 *
 * The constraint: jsdiff's `createTwoFilesPatch` costs roughly (lines in the
 * old text) × (edit distance). The merge stage of a `config:recommended` run
 * diffs 1,170 lines against 11,580 — measured at ~1.6 s of blocked main
 * thread per computation, paid on first paint (every tab panel mounts) and
 * again on every stage re-selection. This builder instead splits both
 * pretty-printed texts into their top-level child blocks and aligns those
 * blocks by exact string equality, so unchanged children anchor the diff and
 * only genuinely-changed pairs are diffed line by line — near-linear for the
 * append-heavy shapes a Renovate config actually produces.
 *
 * The oracle this must satisfy, for every input:
 * `applyPatch(jsonFile(before), buildJsonPatch(a, b, before, after))` returns
 * exactly `jsonFile(after)`. It does NOT have to be byte-identical to jsdiff's
 * output — only a valid unified diff that reconstructs the target.
 *
 * Splitting by indentation is sound because `JSON.stringify` escapes newlines
 * inside strings: every line break in the output is structural.
 */

/** Lines of leading context around each change run, matching jsdiff's default. */
const CONTEXT = 3;

/**
 * Combined line count at or below which a real line-level Myers diff is the
 * better answer — small enough to be free, and it reads better than a
 * block-aligned approximation.
 */
const LEAF_LINES = 100;

type PatchLineType = "context" | "delete" | "insert";

interface PatchLine {
  type: PatchLineType;
  text: string;
}

interface HunkRange {
  start: number;
  end: number;
}

interface SplitBlock {
  open: string;
  container: "{" | "[";
  children: string[][];
  close: string;
}

/** `jsonFile()` always ends in a newline, so the trailing empty element is noise. */
function toLines(text: string): string[] {
  const parts = text.split("\n");
  if (parts.at(-1) === "") {
    parts.pop();
  }
  return parts;
}

function toText(lines: readonly string[]): string {
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function indentOf(line: string): number {
  let i = 0;
  while (line.charCodeAt(i) === 32) {
    i++;
  }
  return i;
}

function containerOf(openLine: string): "{" | "[" | null {
  const last = openLine.at(-1);
  return last === "{" || last === "[" ? last : null;
}

/**
 * True for a line that is nothing but a closing bracket, optionally with a
 * comma. Such a line always terminates the block it sits in — a JSON *value*
 * at that indent would be a `"key":` pair or a quoted element, never a bare
 * bracket — which is how a child block is told apart from the close line of
 * the child before it, both of which share one indent.
 */
function isCloserBody(body: string): boolean {
  return body === "}" || body === "]" || body === "}," || body === "],";
}

function push(out: PatchLine[], type: PatchLineType, lines: readonly string[]): void {
  for (const text of lines) {
    out.push({ type, text });
  }
}

/**
 * Splits one pretty-printed container into its open line, its top-level child
 * blocks and its close line. Returns null for anything that is not a
 * multi-line container — a one-line value, or a shape this parser does not
 * recognise — in which case the caller falls back to a line diff.
 */
function splitBlock(lines: readonly string[]): SplitBlock | null {
  const open = lines[0];
  const close = lines.at(-1);
  if (lines.length < 3 || open === undefined || close === undefined) {
    return null;
  }
  const container = containerOf(open);
  if (container === null) {
    return null;
  }
  const openIndent = indentOf(open);
  const closeBody = close.slice(openIndent);
  const closer = container === "{" ? "}" : "]";
  if (indentOf(close) !== openIndent || (closeBody !== closer && closeBody !== `${closer},`)) {
    return null;
  }

  const childIndent = openIndent + 2;
  const starts: number[] = [];
  for (let i = 1; i < lines.length - 1; i++) {
    const line = lines[i];
    if (line === undefined) {
      return null;
    }
    const indent = indentOf(line);
    if (indent < childIndent) {
      return null;
    }
    if (indent === childIndent && !isCloserBody(line.slice(childIndent))) {
      starts.push(i);
    }
  }
  if (starts[0] !== 1) {
    return null;
  }

  const children = starts.map((start, k) => lines.slice(start, starts[k + 1] ?? lines.length - 1));
  return { open, container, children, close };
}

function leafDiff(a: readonly string[], b: readonly string[]): PatchLine[] {
  const out: PatchLine[] = [];
  if (a.length === 0 || b.length === 0) {
    push(out, "delete", a);
    push(out, "insert", b);
    return out;
  }
  for (const change of diffLines(toText(a), toText(b))) {
    const type: PatchLineType = change.added ? "insert" : change.removed ? "delete" : "context";
    push(out, type, toLines(change.value));
  }
  return out;
}

function diffEdge(out: PatchLine[], a: string, b: string): void {
  if (a === b) {
    out.push({ type: "context", text: a });
    return;
  }
  out.push({ type: "delete", text: a });
  out.push({ type: "insert", text: b });
}

/**
 * Pairs a removed run against an adjacent added run index by index and
 * recurses into each pair. This is what keeps a 50-element vs 950-element
 * `packageRules` cheap: the unchanged elements never enter a pair at all.
 */
function diffPairedRuns(out: PatchLine[], aRun: string[][], bRun: string[][]): void {
  const paired = Math.min(aRun.length, bRun.length);
  for (let i = 0; i < paired; i++) {
    const left = aRun[i];
    const right = bRun[i];
    if (left === undefined || right === undefined) {
      continue;
    }
    for (const line of diffBlockLines(left, right)) {
      out.push(line);
    }
  }
  for (const block of aRun.slice(paired)) {
    push(out, "delete", block);
  }
  for (const block of bRun.slice(paired)) {
    push(out, "insert", block);
  }
}

/**
 * Aligns two child-block sequences with a Myers diff over the raw block texts
 * — cheap tokens, so the cost scales with the number of blocks, not lines.
 * Trailing commas need no special handling: a formerly-last element that
 * gained one simply becomes a changed pair whose recursion shows the one-line
 * change.
 */
function diffChildren(out: PatchLine[], a: string[][], b: string[][]): void {
  const parts = diffArrays(
    a.map((block) => block.join("\n")),
    b.map((block) => block.join("\n")),
  );
  let ia = 0;
  let ib = 0;
  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    if (part === undefined) {
      break;
    }
    const count = part.value.length;
    if (!part.added && !part.removed) {
      for (const block of a.slice(ia, ia + count)) {
        push(out, "context", block);
      }
      ia += count;
      ib += count;
      i++;
      continue;
    }
    const next = parts[i + 1];
    if (next !== undefined && (part.added ? next.removed : next.added)) {
      const removedCount = part.removed ? count : next.value.length;
      const addedCount = part.added ? count : next.value.length;
      diffPairedRuns(out, a.slice(ia, ia + removedCount), b.slice(ib, ib + addedCount));
      ia += removedCount;
      ib += addedCount;
      i += 2;
      continue;
    }
    if (part.removed) {
      for (const block of a.slice(ia, ia + count)) {
        push(out, "delete", block);
      }
      ia += count;
    } else {
      for (const block of b.slice(ib, ib + count)) {
        push(out, "insert", block);
      }
      ib += count;
    }
    i++;
  }
}

function diffBlockLines(a: readonly string[], b: readonly string[]): PatchLine[] {
  if (sameLines(a, b)) {
    const out: PatchLine[] = [];
    push(out, "context", a);
    return out;
  }
  if (a.length + b.length <= LEAF_LINES) {
    return leafDiff(a, b);
  }
  const sa = splitBlock(a);
  const sb = splitBlock(b);
  if (sa === null || sb === null || sa.container !== sb.container) {
    return leafDiff(a, b);
  }
  const out: PatchLine[] = [];
  diffEdge(out, sa.open, sb.open);
  diffChildren(out, sa.children, sb.children);
  diffEdge(out, sa.close, sb.close);
  return out;
}

/** Change runs grown by `CONTEXT` lines each side, merged where they touch. */
function hunkRanges(script: readonly PatchLine[]): HunkRange[] {
  const runs: HunkRange[] = [];
  let current: HunkRange | null = null;
  let index = 0;
  for (const line of script) {
    if (line.type === "context") {
      if (current !== null) {
        runs.push(current);
        current = null;
      }
    } else if (current === null) {
      current = { start: index, end: index };
    } else {
      current.end = index;
    }
    index++;
  }
  if (current !== null) {
    runs.push(current);
  }

  const ranges: HunkRange[] = [];
  for (const run of runs) {
    const start = Math.max(0, run.start - CONTEXT);
    const end = Math.min(script.length - 1, run.end + CONTEXT);
    const previous = ranges.at(-1);
    if (previous !== undefined && start <= previous.end + 1) {
      previous.end = end;
    } else {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

function renderPatch(nameBefore: string, nameAfter: string, script: readonly PatchLine[]): string {
  const out = [`--- ${nameBefore}`, `+++ ${nameAfter}`];
  const ranges = hunkRanges(script);
  let rangeIndex = 0;
  let index = 0;
  let oldSeen = 0;
  let newSeen = 0;
  let body: string[] = [];
  let oldStart = 0;
  let newStart = 0;
  let oldLines = 0;
  let newLines = 0;

  for (const line of script) {
    const range = ranges[rangeIndex];
    const inRange = range !== undefined && index >= range.start && index <= range.end;
    if (inRange && body.length === 0) {
      oldStart = oldSeen;
      newStart = newSeen;
      oldLines = 0;
      newLines = 0;
    }
    if (line.type !== "insert") {
      oldSeen++;
      if (inRange) {
        oldLines++;
      }
    }
    if (line.type !== "delete") {
      newSeen++;
      if (inRange) {
        newLines++;
      }
    }
    if (inRange) {
      const marker = line.type === "insert" ? "+" : line.type === "delete" ? "-" : " ";
      body.push(`${marker}${line.text}`);
    }
    if (range !== undefined && index === range.end) {
      // The unified-diff quirk: a zero-length side numbers from the line
      // BEFORE the insertion point, so the 1-based +1 is dropped.
      out.push(
        `@@ -${oldLines === 0 ? oldStart : oldStart + 1},${oldLines}` +
          ` +${newLines === 0 ? newStart : newStart + 1},${newLines} @@`,
      );
      for (const text of body) {
        out.push(text);
      }
      body = [];
      rangeIndex++;
    }
    index++;
  }
  return `${out.join("\n")}\n`;
}

/**
 * The unified diff between two JSON values, formatted the way
 * `createTwoFilesPatch` formats one minus its `===` preamble: `--- name` /
 * `+++ name` headers followed by `@@` hunks with three context lines. Equal
 * values produce the headers and no hunks at all.
 */
export function buildJsonPatch(
  nameBefore: string,
  nameAfter: string,
  before: unknown,
  after: unknown,
): string {
  const script = diffBlockLines(toLines(jsonFile(before)), toLines(jsonFile(after)));
  return renderPatch(nameBefore, nameAfter, script);
}
