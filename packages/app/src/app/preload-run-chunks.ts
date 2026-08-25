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
 * The specifier below MUST stay the one `ResultsPane` passes to `lazy()`. A
 * preloader that warms a different string than the boundary loads is a bug
 * whose only symptom is a slow first Run.
 */
export function preloadRunChunks(): void {
  preloadEngine();
  void import("@/app/ResultsColumn").catch(() => {});
}
