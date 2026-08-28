/**
 * Engine-internal value helpers — the two-to-four-line predicates and clones
 * that more than one engine module needs, so a `description` walk and a
 * packageRules replay agree on what "a plain object" and "the same value" mean.
 *
 * Deliberately NOT on the public barrel (`index.ts`), for the same reason
 * `text.ts` is not: these are implementation details of the engine's own
 * modules, and the app/CLI have (and keep) their own equivalents rather than
 * taking a dependency edge across the package boundary for a one-liner.
 */

/** A JSON object — not null, not an array. The narrowing every config walk in
 *  here needs before it may index a value. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The members of an `allowString` array option, in the form Renovate holds
 * them: `massageConfig` coerces `"x"` to `["x"]`, but a raw `fetched` preset
 * body has not been through it. Members are returned untouched, non-strings
 * included — Renovate only warns about those and keeps them.
 */
export function allowStringMembers(value: unknown): unknown[] {
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value) ? value : [];
}

/**
 * Equality by JSON text. Cheap and exact for the JSON-shaped config values the
 * simulator compares, but ORDER-SENSITIVE: `{a:1,b:2}` and `{b:2,a:1}` compare
 * unequal. Callers that need structural equality use `deepEqual` in
 * `trace/provenance.ts` instead.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * A detached copy of a config value — at a pipeline stage boundary, or of a
 * cumulative config for a merge step (roadmap 044). The values here are JSON (a
 * resolved Renovate config, plus a simulated dependency's fields), so
 * `structuredClone` is exact; the JSON round-trip fallback covers the
 * theoretical value it would refuse (a function reaching the config would make
 * the whole run unserializable anyway) rather than letting a snapshot throw and
 * take the run down with it.
 */
export function snapshot<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
