/**
 * The engine chunk's one seam.
 *
 * The renovate engine is the app's heavy chunk (~437 kB gz), kept off the
 * critical path by never being imported statically. That rule used to be
 * carried by nine hand-written `import("@renovate-config-debugger/engine")`
 * call sites spread across `platform/`, `hooks/` and two features — which meant
 * nine places to get the specifier right, and nine places a future preload or
 * error-reporting decision would have to be repeated. It is one function now;
 * the specifier is still a literal dynamic `import()`, so Vite splits exactly
 * the same chunk it always did.
 *
 * One `import()` call for the whole app, not one per mounted consumer. A
 * browser dedupes concurrent dynamic imports of the same specifier for free,
 * but vitest's module runner does NOT: with the engine mocked, a second
 * `import()` issued while the first is still in flight never settles, and the
 * consumer awaiting it hangs on `undefined` forever. Single-flighting the
 * promise here is what the per-result caches downstream already assume anyway —
 * the chunk is fetched once and everyone waits on the same fetch.
 * `engine-chunk.test.ts` pins it, from a cold module registry.
 *
 * A rejection is deliberately NOT cached: an import that failed because the
 * network was down must be retryable by the next run, so the slot is cleared
 * on the way out and the caller still sees the rejection.
 */
import type * as EngineModule from "@renovate-config-debugger/engine";

/** The engine module's shape, named without pulling it into the entry bundle —
 *  a type-only import declaration rather than an inline `typeof import(…)`. */
export type Engine = typeof EngineModule;

let enginePromise: Promise<Engine> | undefined;

export function loadEngine(): Promise<Engine> {
  enginePromise ??= import("@renovate-config-debugger/engine").catch((error: unknown) => {
    enginePromise = undefined;
    throw error;
  });
  return enginePromise;
}

/**
 * Roadmap 031: warms the engine chunk so the download overlaps idle time or
 * hover intent instead of serializing behind the Run click. Idempotent — the
 * import is single-flighted above, so a Run that beats the preload simply
 * awaits the same in-flight promise. Best-effort: a network failure here is
 * swallowed, the real load on Run will surface it.
 */
export function preloadEngine(): void {
  void loadEngine().catch(() => {});
}
