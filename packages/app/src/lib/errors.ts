/**
 * Turning a caught `unknown` into something a person can read.
 *
 * `catch (err)` gives `unknown`, so every call site has to narrow it, and nine
 * of them had spelled the same narrowing by hand. Three of those carried the
 * same second step too — unwrapping a nested `err.err.message` — and
 * `use-repo-deps`'s comment ("unwrapped here exactly as the load path does")
 * shows the author knew where the other copy lived and retyped it anyway. That
 * is the tell that it wanted to be a function.
 */

/**
 * The message a caught value carries. `String(err)` is the honest fallback for
 * a thrown non-Error (a string, an object, `undefined` from a rejected promise
 * with no reason) — better a useless-looking message than a crash inside the
 * error path itself.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The same, but preferring a nested cause when there is one.
 *
 * Renovate's fetchers reject with a wrapper whose real detail sits at
 * `err.err.message`; the wrapper's own message is a generic one that tells the
 * reader nothing ("Request failed"). The repo load, the inherited-config probe
 * and the dependency discovery all read the inner one, and all three
 * previously spelled the `?.` chain themselves.
 *
 * Falls back to {@link errorMessage}, so a plain Error still reports normally.
 */
export function causedErrorMessage(err: unknown): string {
  const cause = (err as { err?: { message?: string } } | null)?.err?.message;
  return cause ?? errorMessage(err);
}
