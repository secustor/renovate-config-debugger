/**
 * The repo's JSON text helpers — one place that knows what a value with no
 * JSON form should look like, for every package here.
 *
 * `JSON.stringify` is DECLARED to return `string` but returns `undefined` for
 * `undefined`, a function and a symbol; lib.es5's overload hides that from
 * `tsc`. The tree carried five different hand-maintained fallbacks for that one
 * lie (`?? "undefined"`, `?? String(v)`, `?? "null"`, `?? ""`, and a `??`
 * block) plus dozens of calls with none, which is how `cli/src/output.ts`
 * shipped a `rcd run --select tree` that printed a header and a blank line.
 * The fallback is a property of the SINK, not of the call site, so it is
 * decided once, here, by which function you pick.
 *
 * WHY THIS MODULE HAS NO IMPORTS — same constraint as `is.ts`,
 * `contracts.ts` and `text-scan.ts`, enforced for all four by
 * `test/import-free-subpaths.node.test.ts`: it is reachable from the app's
 * entry chunk through the `./json` subpath, which must never pull the Renovate
 * graph onto a static import path.
 *
 * `JSON.parse` is deliberately not wrapped: it throws rather than lying, and
 * every caller already has a `try` shaped around its own recovery.
 */

/** Compact JSON text for a HUMAN — a table cell, a preview, an identity key.
 *  A value with no JSON form reads as the literal `undefined`. */
export function jsonText(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

/** Compact JSON text that must PARSE BACK — a storage write, a request body, a
 *  share payload, text spliced into a config document, a byte budget measured
 *  on the wire. A value with no JSON form becomes `null`, which still parses. */
export function jsonLiteral(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

/** A 2-space JSON DOCUMENT, with `jsonLiteral`'s `null` rule for the same
 *  reason: a document that does not parse is worse than one saying `null`. */
export function jsonDocument(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

/** `jsonDocument` plus the trailing newline every "this is a file you can
 *  copy" sink wants. */
export function jsonFile(value: unknown): string {
  return `${jsonDocument(value)}\n`;
}

/**
 * Equality by JSON text. Cheap and exact for the JSON-shaped config values the
 * simulator compares, but ORDER-SENSITIVE: `{a:1,b:2}` and `{b:2,a:1}` compare
 * unequal. Callers that need structural equality use `deepEqual` in `lib.ts`.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
