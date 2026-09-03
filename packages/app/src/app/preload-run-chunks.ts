import { preloadEngine } from "@/platform/engine-chunk";

/**
 * Roadmap 031: warms the two chunks a Run needs — the engine, and the results
 * column that renders its output — so neither download serializes behind the
 * click. Both dynamic imports are module-cached (idempotent).
 *
 * Its own module rather than sitting beside `ResultsPane`'s `lazy()`, which is
 * where it belongs conceptually: `react/only-export-components` refuses a file
 * that exports both a component and a plain function, because Fast Refresh then
 * stops replacing the module and starts full-reloading it. Same reason the
 * repo's `*-hooks.ts` files exist.
 *
 * Both this preload and `ResultsPane`'s `lazy()` go through
 * `loadResultsColumn`, mirroring `engine-chunk.ts`'s header: one specifier, so
 * the boundary cannot end up loading a different string than the preload warms.
 */

/** The results chunk's one seam — the specifier lives here, not at each call
 *  site. Deliberately NOT single-flighted like `loadEngine`: that cache exists
 *  for vitest's module runner with a mocked engine, and there is no such mock
 *  for `ResultsColumn`. */
export function loadResultsColumn() {
  return import("@/app/ResultsColumn");
}

export function preloadRunChunks(): void {
  preloadEngine();
  // Best-effort: the rejection is swallowed HERE only — `lazy()` must still see
  // a chunk-load failure, or its Suspense boundary crashes on `undefined`.
  void loadResultsColumn().catch(() => {});
}
