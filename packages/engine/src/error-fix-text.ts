/**
 * Roadmap 014 — turns an `ErrorFixResult` (see `error-translations.ts`) into
 * an edit of the RAW config text the editor holds, so "Apply fix" preserves
 * everything about the document that isn't the fixed value: comments,
 * unrelated formatting, key order.
 *
 * This is a lightweight bracket-depth scanner in the same spirit as
 * `packages/app/src/rule-locate.ts` (013), not a full JSON5 parser: it
 * recognizes standard double-quoted JSON/JSON5 object keys and `//`/`/* *\/`
 * comments, which covers the overwhelming convention (including generated
 * `.json5` files, which mainly use JSON5 for comments/trailing commas, not
 * unquoted or single-quoted keys). When a path segment can't be located —
 * most commonly because the config uses that rare unquoted/single-quoted key
 * style, or the path doesn't exist in this exact text — `applyFixToText`
 * falls back to re-serializing the ENTIRE document from `fix.fixedConfig`
 * (`JSON.stringify(fixedConfig, null, 2)`), which is always correct but loses
 * comments and original formatting; the returned `surgical: false` flag lets
 * a caller warn about that tradeoff.
 */

import type { ConfigPathSegment, ErrorFixResult } from "./error-translations";

export interface AppliedTextFix {
  text: string;
  /** False when the path couldn't be located and the whole document was
   *  re-serialized from `fixedConfig` instead (comments/formatting lost). */
  surgical: boolean;
}

/** Applies `fix` to `text` (the editor's raw config content). */
export function applyFixToText(text: string, fix: ErrorFixResult): AppliedTextFix | null {
  const located = locateEntry(text, fix.path);
  if (located) {
    if (fix.remove) {
      return { text: spliceRemove(text, located), surgical: true };
    }
    if (fix.renameTo) {
      return {
        text:
          text.slice(0, located.keyStart) +
          JSON.stringify(fix.renameTo) +
          text.slice(located.keyEnd),
        surgical: true,
      };
    }
    return {
      text:
        text.slice(0, located.valueStart) +
        JSON.stringify(fix.value) +
        text.slice(located.valueEnd),
      surgical: true,
    };
  }
  try {
    return { text: JSON.stringify(fix.fixedConfig, null, 2), surgical: false };
  } catch {
    return null;
  }
}

interface EntryLocation {
  keyStart: number;
  keyEnd: number;
  valueStart: number;
  valueEnd: number;
}

/** Skips a double-quoted JSON string starting at `start`; returns the index just past it. */
function skipString(text: string, start: number): number {
  let i = start + 1;
  const n = text.length;
  while (i < n && text[i] !== '"') {
    if (text[i] === "\\") {
      i++;
    }
    i++;
  }
  return i + 1;
}

/** Skips a `//` or `/* *\/` comment (JSON5) starting at `start`; returns the index just past it, or null. */
function skipComment(text: string, start: number): number | null {
  if (text[start] !== "/") {
    return null;
  }
  if (text[start + 1] === "/") {
    let i = start + 2;
    while (i < text.length && text[i] !== "\n") {
      i++;
    }
    return i;
  }
  if (text[start + 1] === "*") {
    let i = start + 2;
    while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
      i++;
    }
    return Math.min(i + 2, text.length);
  }
  return null;
}

/** Whitespace at `i`? Past the end counts as "no" — every caller is scanning
 *  forward and stops at the end of the text anyway. */
function isSpaceAt(text: string, i: number): boolean {
  const c = text[i];
  return c !== undefined && /\s/.test(c);
}

/** Space or tab at `i`? (Line indentation, so newlines deliberately don't count.) */
function isIndentAt(text: string, i: number): boolean {
  const c = text[i];
  return c === " " || c === "\t";
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
      return { keyStart, keyEnd, valueStart, valueEnd };
    }
    i = skipTrivia(text, valueEnd);
    if (text[i] === ",") {
      i = skipTrivia(text, i + 1);
      continue;
    }
    if (text[i] === "}") {
      return null;
    }
    return null; // malformed
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
    if (text[i] === "]") {
      return null;
    }
    return null;
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
    if (typeof seg === "string") {
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
      if (!found || isLast) {
        // A path ending on an array index has no surgical patch here — the
        // one curated fix shaped that way (the `group:`-preset rule rewrite)
        // deliberately falls back to re-serializing the document, and says so
        // via `fixedTextRewritesDocument`.
        return null;
      }
      containerStart = found.valueStart;
    }
  }
  return null;
}

/** Removes a `"key": value` member, cleaning up the adjacent comma so the result stays valid JSON. */
function spliceRemove(text: string, loc: EntryLocation): string {
  // Eat back to the start of the line if only indentation precedes the key,
  // so removal doesn't leave a blank indented line behind.
  let lineStart = loc.keyStart;
  while (lineStart > 0 && text[lineStart - 1] !== "\n" && isIndentAt(text, lineStart - 1)) {
    lineStart--;
  }
  const cutStart = /^[ \t]*$/.test(text.slice(lineStart, loc.keyStart)) ? lineStart : loc.keyStart;

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
