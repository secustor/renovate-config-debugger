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
 *
 * The character-level primitives (`skipString`, `skipComment`, `isSpaceAt`) are
 * the engine's, shared with its own JSON5 scanner in `error-fix-text.ts` (014)
 * — they were duplicated byte for byte here until the two copies were merged.
 * They come from the `/text-scan` SUBPATH, not the engine barrel: this module is
 * reached statically from `App.tsx`, and the barrel would drag the lazy
 * Renovate chunk onto the first-paint critical path.
 */

import { isSpaceAt, skipComment, skipString } from "@renovate-config-debugger/engine/text-scan";

/** Returns the offset of each top-level `packageRules[i]` object's `{`, or `null`. */
export function findPackageRuleOffsets(text: string): number[] | null {
  const arrayStart = findTopLevelArrayStart(text, "packageRules");
  if (arrayStart === null) {
    return null;
  }
  return collectObjectStarts(text, arrayStart);
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
