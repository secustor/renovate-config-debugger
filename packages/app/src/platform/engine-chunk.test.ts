import { expect, it, vi } from "vitest";
import { loadEngine } from "./engine-chunk";

/**
 * The single-flight itself, pinned where it can actually fail: vitest gives
 * every test file its own module registry, so `enginePromise` is cold here —
 * in `use-engine-derivation.test.tsx` it is already settled by the time the
 * two-consumer case mounts.
 *
 * The barrel is mocked so no real module graph loads (the project-coverage
 * guard exempts files that mock it, cf. `github-repos.test.ts`).
 */
vi.mock("@renovate-config-debugger/engine", () => ({}));

it("hands concurrent callers the same promise", async () => {
  // Fails the moment `??=` becomes `=`, in any environment — unlike a test
  // that can only observe the runner's never-settling second `import()`.
  const first = loadEngine();
  expect(loadEngine()).toBe(first);
  await expect(first).resolves.toBeDefined();
});
