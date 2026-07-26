/**
 * Roadmap 013: locates the character offset of each entry of the TOP-LEVEL
 * `packageRules` array in the raw config text, so a validator message naming
 * a repo-config index (`packageRules[1]`, produced by the validate stage
 * against the repo's own directly-authored array, before any preset merge)
 * can jump to the right editor line.
 *
 * This is a lightweight bracket-depth scanner, not a full JSON5 parser: it
 * only recognizes a top-level key written as a double-quoted string (the
 * overwhelming convention even in `.json5` files, which mainly use JSON5 for
 * comments/trailing commas) followed by `:` and an array. An unquoted or
 * single-quoted `packageRules` key — valid JSON5, rare in practice — is not
 * recognized and the function returns `null`, same as "no packageRules key
 * found" (the caller then just skips the editor cross-link).
 */

/** Returns the offset of each top-level `packageRules[i]` object's `{`, or `null`. */
export function findPackageRuleOffsets(text: string): number[] | null {
  const arrayStart = findTopLevelArrayStart(text, "packageRules");
  if (arrayStart === null) {
    return null;
  }
  return collectObjectStarts(text, arrayStart);
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

/** Skips a `//` or `/* *\/` comment (JSON5) starting at `start`; returns the index just past it. */
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

/** Whitespace at `i`? Past the end counts as "no" — the scanners below only
 *  ever walk forward and stop at the end of the text anyway. */
function isSpaceAt(text: string, i: number): boolean {
  const c = text[i];
  return c !== undefined && /\s/.test(c);
}

/** Finds the `[` of the top-level `key`'s array value (directly inside the root `{}`), or `null`. */
function findTopLevelArrayStart(text: string, key: string): number | null {
  const n = text.length;
  const stack: string[] = [];
  let i = 0;
  while (i < n) {
    const c = text[i];
    const afterComment = skipComment(text, i);
    if (afterComment !== null) {
      i = afterComment;
      continue;
    }
    if (c === '"') {
      const strEnd = skipString(text, i);
      const str = text.slice(i + 1, strEnd - 1);
      let j = strEnd;
      while (j < n && isSpaceAt(text, j)) {
        j++;
      }
      if (text[j] === ":" && stack.length === 1 && stack[0] === "{" && str === key) {
        let k = j + 1;
        while (k < n && isSpaceAt(text, k)) {
          k++;
        }
        return text[k] === "[" ? k : null;
      }
      i = strEnd;
      continue;
    }
    if (c === "{" || c === "[") {
      stack.push(c);
      i++;
      continue;
    }
    if (c === "}" || c === "]") {
      stack.pop();
      i++;
      continue;
    }
    i++;
  }
  return null;
}

/** Enumerates the `{` offsets of every object directly inside the array starting at `arrayStart`. */
function collectObjectStarts(text: string, arrayStart: number): number[] {
  const n = text.length;
  const offsets: number[] = [];
  let i = arrayStart + 1;
  let depth = 1;
  while (i < n && depth > 0) {
    const c = text[i];
    const afterComment = skipComment(text, i);
    if (afterComment !== null) {
      i = afterComment;
      continue;
    }
    if (c === '"') {
      i = skipString(text, i);
      continue;
    }
    if (c === "{") {
      if (depth === 1) {
        offsets.push(i);
      }
      depth++;
      i++;
      continue;
    }
    if (c === "[") {
      depth++;
      i++;
      continue;
    }
    if (c === "}" || c === "]") {
      depth--;
      i++;
      continue;
    }
    i++;
  }
  return offsets;
}
