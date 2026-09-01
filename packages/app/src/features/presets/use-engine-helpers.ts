import { useEngineDerivation } from "@/hooks/use-engine-derivation";
import type { InjectionKeyFn, MergeFn, ParseFn } from "./tree-shared";

/** Keyed on nothing — the helpers are the same functions for the life of the
 *  page. Frozen at module scope so the dependency identity is stable. */
const NO_INPUTS: readonly unknown[] = [];

/**
 * The engine helpers the tree needs (merge + injection key/parse), loaded
 * through the shared derivation seam: `undefined` while the chunk is in flight,
 * `null` if it never arrives, rather than an unhandled rejection.
 */
export function useEngineHelpers() {
  return useEngineDerivation(NO_INPUTS, (engine) => ({
    merge: engine.mergeChildConfig as MergeFn,
    injectionKey: engine.presetInjectionKey as InjectionKeyFn,
    parse: engine.parseInjectedPreset as ParseFn,
  }));
}
