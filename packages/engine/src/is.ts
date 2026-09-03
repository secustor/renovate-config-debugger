/**
 * The repo's type-check library — the predicates every package here needs, in
 * one place, so `packages/app`, `packages/cli` and the engine itself stop
 * keeping byte-identical private copies (`isPlainObject` had three,
 * `isStringArray` two) and stop spelling `typeof x === "string"` by hand.
 * `rcd/prefer-is-helpers` (tools/lint) is what keeps the tree pointed here.
 *
 * WHY THIS MODULE HAS NO IMPORTS, and must not gain any. It is reachable from
 * the app through the `./is` subpath and therefore from the entry chunk, which
 * must never pull the Renovate graph onto a static import path (see
 * `contracts.ts`, `.oxlintrc.json`'s engine-root ban). Predicates only, so the
 * subpath's whole runtime cost is this file.
 *
 * Not a separate workspace package, deliberately — the same reasoning
 * `contracts.ts` states: the app already depends on the engine and the CLI
 * dev-depends on both, so the helpers flow the way the dependency does.
 *
 * WHAT IS DELIBERATELY NOT HERE, each measured across the three source trees:
 * - `isObject` — every remaining `typeof x === "object"` site deliberately
 *   ACCEPTS arrays, which `isPlainObject` does not; and the name is taken in
 *   `shims/renovate-deps.ts` by upstream's predicate, which includes functions.
 * - `isUndefined` — all three sites are bare-identifier global probes
 *   (`typeof BroadcastChannel === "undefined"`), where a helper call would
 *   throw `ReferenceError`. `typeof` is the only safe spelling.
 * - `isFunction` — one real discriminator; the rest are capability probes on
 *   globals, which have the same `ReferenceError` problem.
 * - `isArray` / `isNonEmptyArray` — `Array.isArray` is already a global type
 *   guard, and `isNonEmptyArray` is exported from `shims/renovate-deps.ts` in
 *   this same package with a deliberately different (`any[]`) return type.
 * - `isFiniteNumber`, `isNonEmptyStringAndNotWhitespace` — two sites each,
 *   both of which need the un-hidden second half in the same expression.
 */

/** `typeof value === "string"`. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A string with at least one character. NOT whitespace-aware: the two
 *  `.trim()` sites in the app need the trimmed value and keep their spelling. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** EXACTLY `typeof value === "number"`, `NaN` included — the deliberate
 *  divergence from `@sindresorhus/is`, and what lets the lint rule map the
 *  `typeof` form onto this helper without changing any site's meaning. */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/** `typeof value === "boolean"`. */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** A JSON object — not null, not an array. The narrowing every config walk in
 *  this repo needs before it may index a value. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An array whose every member is a string. */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

/** Either nullish value, named — `x === null || x === undefined`. */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/** Every falsy value JS has, so `isTruthy` can narrow one away. */
type Falsy = false | 0 | 0n | "" | null | undefined;

/** `.filter(isTruthy)` instead of `.filter(Boolean)`, which TypeScript cannot
 *  narrow — `Boolean` leaves the result `(T | undefined)[]`. */
export function isTruthy<T>(value: T | Falsy): value is T {
  return Boolean(value);
}
