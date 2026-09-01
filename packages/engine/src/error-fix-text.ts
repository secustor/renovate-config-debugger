/**
 * Roadmap 014 — turns an `ErrorFixResult` (see `error-translations.ts`) into
 * an edit of the RAW config text the editor holds, so "Apply fix" preserves
 * everything about the document that isn't the fixed value: comments,
 * unrelated formatting, key order.
 *
 * This is a lightweight bracket-depth scanner in the same spirit as
 * `packages/app/src/lib/rule-locate.ts` (013) — and built on the same
 * primitives, which both now take from `./text-scan` — not a full JSON5 parser:
 * it recognizes standard double-quoted JSON/JSON5 object keys and `//`/`/* *\/`
 * comments, which covers the overwhelming convention (including generated
 * `.json5` files, which mainly use JSON5 for comments/trailing commas, not
 * unquoted or single-quoted keys). A path may end on an ARRAY INDEX — the
 * `group:`-preset rule rewrite does — and that element is patched in place
 * like any other value; only a `renameTo` is impossible there, an index having
 * no key. When a path segment can't be located —
 * most commonly because the config uses that rare unquoted/single-quoted key
 * style, or the path doesn't exist in this exact text — `applyFixToText`
 * falls back to re-serializing the ENTIRE document from `fix.fixedConfig`
 * (`jsonDocument(fixedConfig)`), which is always correct but loses
 * comments and original formatting; the returned `surgical: false` flag lets
 * a caller warn about that tradeoff.
 */

import type { ConfigPathSegment, ErrorFixResult } from "./error-translations";
import { isString } from "./is";
import { jsonDocument, jsonLiteral } from "./json";
import { isIndentAt, isSpaceAt, skipComment, skipString } from "./text-scan";

export interface AppliedTextFix {
  text: string;
  /** False when the path couldn't be located and the whole document was
   *  re-serialized from `fixedConfig` instead (comments/formatting lost). */
  surgical: boolean;
}

/** Applies `fix` to `text` (the editor's raw config content). */
export function applyFixToText(text: string, fix: ErrorFixResult): AppliedTextFix | null {
  const located = locateEntry(text, fix.path);
  if (!located) {
    return rewriteDocument(fix);
  }
  if (fix.remove) {
    return { text: spliceRemove(text, located), surgical: true };
  }
  if (fix.renameTo) {
    // An ARRAY ELEMENT has no key to rename. Splicing anything here would
    // corrupt the document, so this is the one surgical path that declines:
    // losing the formatting beats emitting invalid JSON. No curated fix is
    // shaped this way today, but the function is engine-public.
    if (!located.key) {
      return rewriteDocument(fix);
    }
    return {
      text:
        text.slice(0, located.key.start) + jsonLiteral(fix.renameTo) + text.slice(located.key.end),
      surgical: true,
    };
  }
  return {
    text:
      text.slice(0, located.valueStart) +
      serializeValue(text, located, fix.value) +
      text.slice(located.valueEnd),
    surgical: true,
  };
}

/** The last resort: the whole document from `fixedConfig`. Always correct,
 *  always at the cost of every comment and every formatting choice. */
function rewriteDocument(fix: ErrorFixResult): AppliedTextFix | null {
  try {
    return { text: jsonDocument(fix.fixedConfig), surgical: false };
  } catch {
    return null;
  }
}

interface EntryLocation {
  /** The `"key"` span. Absent when the entry is an ARRAY ELEMENT: an index has
   *  no key to rename, and none to eat when removing. */
  key?: { start: number; end: number };
  valueStart: number;
  valueEnd: number;
}

/** The line indentation the value at `valueStart` hangs off — the whitespace
 *  before it when nothing else shares its line, otherwise none. */
function columnIndentAt(text: string, valueStart: number): string {
  let i = valueStart;
  while (i > 0 && isIndentAt(text, i - 1)) {
    i--;
  }
  return i === 0 || text[i - 1] === "\n" ? text.slice(i, valueStart) : "";
}

/**
 * The replacement text for a value.
 *
 * Compact JSON text is right for what the curated fixes mostly replace
 * — `["!gradle"]` belongs on one line, and every span that was one line to
 * begin with keeps its shape byte for byte. A span that spans LINES in the
 * source is a formatted block (a whole `packageRules` entry, say), and
 * collapsing it into one long line would be a worse diff than the one the
 * caller asked for; that case is pretty-printed and re-indented to the value's
 * own column.
 */
function serializeValue(text: string, loc: EntryLocation, value: unknown): string {
  // `jsonLiteral`/`jsonDocument`, not raw stringify: this text is spliced into
  // a config DOCUMENT, where a bare `undefined` would not parse back.
  const compact = jsonLiteral(value);
  if (!text.slice(loc.valueStart, loc.valueEnd).includes("\n")) {
    return compact;
  }
  const pretty = jsonDocument(value);
  const indent = columnIndentAt(text, loc.valueStart);
  return indent === "" ? pretty : pretty.split("\n").join(`\n${indent}`);
}

/** End of a scalar token at `i` — `,`, a closing bracket, or whitespace. */
function isDelimiterAt(text: string, i: number): boolean {
  const c = text[i];
  return c !== undefined && /[,}\]\s]/.test(c);
}

/** Advances past whitespace and comments starting at `i`. */
function skipTrivia(text: string, i: number): number {
  let pos = i;
  while (pos < text.length) {
    if (isSpaceAt(text, pos)) {
      pos++;
      continue;
    }
    const after = skipComment(text, pos);
    if (after !== null) {
      pos = after;
      continue;
    }
    break;
  }
  return pos;
}

/** Scans one JSON value starting at `start` (first non-trivia char); returns the index just past it, or null. */
function scanValue(text: string, start: number): number | null {
  const c = text[start];
  if (c === undefined) {
    return null;
  }
  if (c === '"') {
    return skipString(text, start);
  }
  if (c === "{" || c === "[") {
    const open = c;
    const close = c === "{" ? "}" : "]";
    let depth = 1;
    let i = start + 1;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      const after = skipComment(text, i);
      if (after !== null) {
        i = after;
        continue;
      }
      if (ch === '"') {
        i = skipString(text, i);
        continue;
      }
      if (ch === open) {
        depth++;
        i++;
        continue;
      }
      if (ch === close) {
        depth--;
        i++;
        continue;
      }
      // A differing bracket type inside (object containing an array, etc.)
      // also needs depth tracking so its own close doesn't unbalance ours.
      if (ch === "{" || ch === "[") {
        depth++;
        i++;
        continue;
      }
      if (ch === "}" || ch === "]") {
        depth--;
        i++;
        continue;
      }
      i++;
    }
    return depth === 0 ? i : null;
  }
  // Scalar: number / true / false / null — scan up to a delimiter.
  let i = start;
  while (i < text.length && !isDelimiterAt(text, i) && skipComment(text, i) === null) {
    i++;
  }
  return i > start ? i : null;
}

/** Finds `"key"` as a direct member of the object starting at `objStart` (its `{`). */
function findKeyInObject(text: string, objStart: number, key: string): EntryLocation | null {
  if (text[objStart] !== "{") {
    return null;
  }
  let i = skipTrivia(text, objStart + 1);
  while (i < text.length) {
    if (text[i] === "}") {
      return null;
    }
    if (text[i] !== '"') {
      return null; // malformed / unsupported (e.g. unquoted key) — bail conservatively
    }
    const keyStart = i;
    const keyEnd = skipString(text, i);
    const keyText = text.slice(keyStart + 1, keyEnd - 1);
    let j = skipTrivia(text, keyEnd);
    if (text[j] !== ":") {
      return null;
    }
    j = skipTrivia(text, j + 1);
    const valueStart = j;
    const valueEnd = scanValue(text, valueStart);
    if (valueEnd === null) {
      return null;
    }
    if (keyText === key) {
      return { key: { start: keyStart, end: keyEnd }, valueStart, valueEnd };
    }
    i = skipTrivia(text, valueEnd);
    if (text[i] === ",") {
      i = skipTrivia(text, i + 1);
      continue;
    }
    return null; // end of the object, or malformed
  }
  return null;
}

/** Finds the `index`-th top-level element of the array starting at `arrStart` (its `[`). */
function findArrayElement(
  text: string,
  arrStart: number,
  index: number,
): { valueStart: number; valueEnd: number } | null {
  if (text[arrStart] !== "[") {
    return null;
  }
  let i = skipTrivia(text, arrStart + 1);
  let count = 0;
  while (i < text.length) {
    if (text[i] === "]") {
      return null;
    }
    const valueStart = i;
    const valueEnd = scanValue(text, valueStart);
    if (valueEnd === null) {
      return null;
    }
    if (count === index) {
      return { valueStart, valueEnd };
    }
    count++;
    i = skipTrivia(text, valueEnd);
    if (text[i] === ",") {
      i = skipTrivia(text, i + 1);
      continue;
    }
    return null; // end of the array, or malformed
  }
  return null;
}

/** Walks `path` from the document root, returning the final key's location. */
function locateEntry(text: string, path: ConfigPathSegment[]): EntryLocation | null {
  if (path.length === 0) {
    return null;
  }
  const rootStart = skipTrivia(text, 0);
  if (text[rootStart] !== "{") {
    return null;
  }
  let containerStart = rootStart;
  for (const [i, seg] of path.entries()) {
    const isLast = i === path.length - 1;
    if (isString(seg)) {
      const found = findKeyInObject(text, containerStart, seg);
      if (!found) {
        return null;
      }
      if (isLast) {
        return found;
      }
      containerStart = found.valueStart;
    } else {
      const found = findArrayElement(text, containerStart, seg);
      if (!found) {
        return null;
      }
      if (isLast) {
        // An array element is a located entry with no key span — the whole
        // element is the value, which is exactly what a replace or a remove
        // needs. (The `group:`-preset rule rewrite is shaped this way.)
        return { valueStart: found.valueStart, valueEnd: found.valueEnd };
      }
      containerStart = found.valueStart;
    }
  }
  return null;
}

/**
 * Removes a `"key": value` member — or, when the entry has no key span, an
 * array ELEMENT — cleaning up the adjacent comma so the result stays valid
 * JSON. The two cases differ only in where the removal starts: the key, or the
 * value itself.
 */
function spliceRemove(text: string, loc: EntryLocation): string {
  const start = loc.key?.start ?? loc.valueStart;
  // Eat back to the start of the line if only indentation precedes the entry,
  // so removal doesn't leave a blank indented line behind.
  let lineStart = start;
  while (lineStart > 0 && text[lineStart - 1] !== "\n" && isIndentAt(text, lineStart - 1)) {
    lineStart--;
  }
  const cutStart = /^[ \t]*$/.test(text.slice(lineStart, start)) ? lineStart : start;

  let before = lineStart;
  while (before > 0 && isSpaceAt(text, before - 1)) {
    before--;
  }
  const precedingComma = text[before - 1] === ",";

  let after = loc.valueEnd;
  while (after < text.length && isSpaceAt(text, after)) {
    after++;
  }
  const followingComma = text[after] === ",";

  if (followingComma) {
    let cutEnd = after + 1;
    while (text[cutEnd] === " " || text[cutEnd] === "\t") {
      cutEnd++;
    }
    if (text[cutEnd] === "\n") {
      cutEnd++;
    } else if (text[cutEnd] === "\r" && text[cutEnd + 1] === "\n") {
      cutEnd += 2;
    }
    return text.slice(0, cutStart) + text.slice(cutEnd);
  }
  if (precedingComma) {
    return text.slice(0, before - 1) + text.slice(loc.valueEnd);
  }
  return text.slice(0, cutStart) + text.slice(loc.valueEnd);
}
