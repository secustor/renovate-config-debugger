import type * as EngineModule from "@renovate-config-debugger/engine";
import type { DescriptionProvenance, TraceResult } from "@renovate-config-debugger/engine";
import { makeResultCache } from "./result-cache";
import { useEngineDerivation } from "./use-engine-derivation";

/**
 * Roadmap 069: per-string `description` provenance, loaded the way every other
 * post-hoc trace derivation is — through `useEngineDerivation`, whose dynamic
 * engine import keeps the renovate chunk off the critical path, with the
 * per-result promise cached on the immutable result object so the walk runs
 * ONCE per run however many consumers ask. Shaped like `rule-provenance.ts`,
 * and now literally the same cache: `makeResultCache` owns the identity
 * guarantee and the argument for folding the failure path into the cached
 * value. PR 3's blame ledger and PR 4's tree annotations are the further
 * consumers this cache is for.
 */
const descriptionProvenanceFor = makeResultCache(
  (engine: typeof EngineModule, result: TraceResult) => engine.computeDescriptionProvenance(result),
);

/**
 * `undefined` = loading / no result yet, `null` = unavailable (the run has no
 * final config, or preset resolution never finished). The frame between two
 * runs is empty rather than mispaired — see `useEngineDerivation`, which owns
 * that guarantee and the reason preset node ids make it a correctness bug
 * rather than a cosmetic one.
 */
export function useDescriptionProvenance(
  result: TraceResult | null | undefined,
): DescriptionProvenance | null | undefined {
  return useEngineDerivation(
    [result],
    result ? (engine) => descriptionProvenanceFor(engine, result) : null,
  );
}
