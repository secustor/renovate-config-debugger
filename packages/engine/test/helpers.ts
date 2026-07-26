/**
 * Shared assertion helper for the engine test suite.
 *
 * Roadmap 041: `typescript/no-non-null-assertion` is an error everywhere, so
 * the conventional test `!` is gone. `must` does the same narrowing but fails
 * with a sentence naming what was missing, instead of an unlabelled
 * "Cannot read properties of undefined" TypeError several lines later.
 */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what}, got ${value === null ? "null" : "undefined"}`);
  }
  return value;
}
