/**
 * Engine-internal value helpers — the clones and structural comparisons that
 * more than one engine module needs, so a `description` walk and a
 * packageRules replay agree on what "the same value" means.
 *
 * Deliberately NOT on the public barrel (`index.ts`), for the same reason
 * `text.ts` is not: these are implementation details of the engine's own
 * modules. What the app and the CLI DO share now lives one level down, in the
 * import-free `./is` and `./json` modules this file builds on — they have
 * their own `exports` subpaths, so there is one copy of `isPlainObject` and
 * one `jsonEqual` for the whole repo rather than one per package.
 */

import { isPlainObject, isString } from "./is";

/**
 * The members of an `allowString` array option, in the form Renovate holds
 * them: `massageConfig` coerces `"x"` to `["x"]`, but a raw `fetched` preset
 * body has not been through it. Members are returned untouched, non-strings
 * included — Renovate only warns about those and keeps them.
 */
export function allowStringMembers(value: unknown): unknown[] {
  if (isString(value)) {
    return [value];
  }
  return Array.isArray(value) ? value : [];
}

/**
 * Structural equality over JSON-shaped config values — order-INSENSITIVE, the
 * counterpart callers reach for when `jsonEqual`'s key order would lie.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    return (
      ak.length === bk.length &&
      ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
    );
  }
  return false;
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
    // oxlint-disable-next-line rcd/use-json-helpers -- a clone round-trip, not text: the string is consumed by JSON.parse on the same line
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
