/**
 * A resolved `TraceResult` for the suites that need a run's IDENTITY (the
 * share-link hook, the simulator request it feeds) or a clean baseline to vary
 * one field of (`lib/run-facts.test.ts`). The first two each spelled the same
 * 23-line literal out, in layers that may not import each other, so a field
 * added to the engine's type meant editing both.
 *
 * A fresh object per call: which run an assertion is looking at is the whole
 * point of the suites that use it.
 *
 * Under `tools/test` like the other harnesses: test scaffolding can never ride
 * into the production build.
 */
import type { TraceResult } from "@renovate-config-debugger/engine";

/** A clean run: every stage ok, no messages, no presets visited. */
export function traceResult(overrides: Partial<TraceResult> = {}): TraceResult {
  return {
    events: [],
    finalConfig: { packageRules: [] },
    errors: [],
    warnings: [],
    renovateVersion: "0.0.0",
    stageStatus: {
      global: "ok",
      inherit: "ok",
      parse: "ok",
      migrate: "ok",
      massage: "ok",
      validate: "ok",
      preset: "ok",
      merge: "ok",
    },
    visitedPresets: { merged: [], unmerged: [] },
    platformContext: { platform: "github", endpoint: "https://api.github.com" },
    usedInjections: [],
    ...overrides,
  };
}
