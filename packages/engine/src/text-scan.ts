/**
 * The primitives every JSON5-text scanner in this repo is built out of: skip a
 * double-quoted string, skip a comment, recognize whitespace, recognize line
 * indentation.
 *
 * Two scanners exist and neither wants to be the other — `error-fix-text.ts`
 * (roadmap 014) walks a path and patches a value; the app's `rule-locate.ts`
 * (roadmap 013) finds the offsets of the top-level `packageRules` entries — but
 * they agreed character for character on these four, which is the part where a
 * silent divergence would be a bug rather than a difference of purpose. So the
 * four live here, once, and both scanners import them.
 *
 * WHY THIS MODULE HAS NO IMPORTS — `test/import-free-subpaths.node.test.ts`
 * holds it to that. The `@renovate-config-debugger/engine/text-scan` subpath is
 * reachable without dragging the barrel's Renovate graph along, so the app can
 * use it from a module on the first-paint critical path (see
 * `packages/app/src/lib/rule-locate.ts`).
 *
 * Lightweight by design, not a JSON5 parser: standard double-quoted strings and
 * `//` / `/* *\/` comments, which covers the overwhelming convention even in
 * `.json5` files (which mainly use JSON5 for comments and trailing commas, not
 * unquoted or single-quoted keys). Callers bail conservatively on the rest.
 */

/** Skips a double-quoted JSON string starting at `start`; returns the index just past it. */
export function skipString(text: string, start: number): number {
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
export function skipComment(text: string, start: number): number | null {
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
export function isSpaceAt(text: string, i: number): boolean {
  const c = text[i];
  return c !== undefined && /\s/.test(c);
}

/** Space or tab at `i`? (Line indentation, so newlines deliberately don't count.) */
export function isIndentAt(text: string, i: number): boolean {
  const c = text[i];
  return c === " " || c === "\t";
}
