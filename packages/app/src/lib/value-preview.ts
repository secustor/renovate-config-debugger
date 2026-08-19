import { truncate } from "./truncate";

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
    return value.length ? `[ ${value.length} item${value.length === 1 ? "" : "s"} ]` : "[]";
  }
  if (typeof value === "object") {
    const n = Object.keys(value).length;
    return n ? `{ ${n} key${n === 1 ? "" : "s"} }` : "{}";
  }
  return truncate(JSON.stringify(value) ?? String(value), 80);
}
