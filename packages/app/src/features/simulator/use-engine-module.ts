import type * as EngineModule from "@renovate-config-debugger/engine";
import { useEngineDerivation } from "@/hooks/use-engine-derivation";

/** Keyed on nothing — the module is the same module for the life of the page,
 *  so the shared hook's per-input reset never fires. Frozen at module scope so
 *  the dependency identity is stable without a `useMemo`. */
const NO_INPUTS: readonly unknown[] = [];

/**
 * Roadmap 015: the engine module, loaded once up front — by the time the
 * simulator can render, a run has already pulled the engine chunk in (see
 * `useSimulationRun`), so this is a cache hit, not a second network fetch.
 *
 * Typed off a type-only import declaration (erased at build time, so the engine
 * still arrives only via the dynamic `import()` inside `useEngineDerivation`).
 *
 * `null` is "not usable yet" — still loading, or a chunk that never arrived.
 * Every caller guards on it identically, so the two are not worth telling
 * apart here the way a derivation's `undefined`/`null` pair is.
 */
export function useEngineModule(): typeof EngineModule | null {
  return useEngineDerivation(NO_INPUTS, (engine) => engine) ?? null;
}
