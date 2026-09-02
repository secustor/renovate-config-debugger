import { jsonEqual, jsonText } from "@renovate-config-debugger/engine/json";
import { truncate } from "./truncate";
import { plural } from "./format";

/**
 * One line standing in for a config value: the effective config's value cells
 * have printed it since roadmap 005, and the Presets ledger (075, iteration 5b)
 * prints the same thing for the value a preset SET — so it is hoisted here
 * rather than spelled twice. Containers report their size instead of their
 * contents, because a `packageRules` array or a `hostRules` object cannot be
 * read in a table cell and a truncated JSON dump of one reads as noise.
 */
export function valuePreview(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return value.length ? `[ ${plural(value.length, "item")} ]` : "[]";
  }
  if (typeof value === "object") {
    const n = Object.keys(value).length;
    return n ? `{ ${plural(n, "key")} }` : "{}";
  }
  return truncate(jsonText(value), 80);
}

/**
 * The other half of the same job, for the two fix diffs — `ProblemCard`'s
 * unified −/+ strip and `ErrorTranslationView`'s before/after pair. Unlike
 * `valuePreview` a diff line must show the value's SHAPE (that is the whole
 * point of the diff), so containers are dumped rather than counted, and the
 * budget is a line's worth rather than a cell's.
 *
 * Both callers had spelled this inline with a bare `slice(0, 140)`, which is
 * exactly the surrogate split `truncate` exists to prevent: a config value
 * carrying an emoji rendered a replacement glyph in the diff.
 */
export function fixSnippet(value: unknown): string {
  return truncate(jsonText(value), 140);
}

/**
 * Whether a fix actually changes the value, i.e. whether there is a diff to
 * draw at all. Compared as JSON because `before`/`after` are arbitrary config
 * values, so reference equality says nothing and the two objects are usually
 * distinct instances of the same shape.
 */
export function fixChangesValue(before: unknown, after: unknown): boolean {
  return !jsonEqual(before, after);
}
