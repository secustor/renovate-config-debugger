import type * as EngineModule from "@renovate-config-debugger/engine";
import type { DescriptionProvenance, TraceResult } from "@renovate-config-debugger/engine";
import { useEngineDerivation } from "./use-engine-derivation";

/**
 * Roadmap 069: per-string `description` provenance, loaded the way every other
 * post-hoc trace derivation is — through `useEngineDerivation`, whose dynamic
 * engine import keeps the renovate chunk off the critical path, with the
 * per-result promise cached on the immutable result object so the walk runs
 * ONCE per run however many consumers ask. Shaped like `rule-provenance.ts`,
 * with the failure path folded into the cached value (see below); PR 3's blame
 * ledger and PR 4's tree annotations are the further consumers this cache is
 * for.
 */
const descriptionProvenanceCache = new WeakMap<
  TraceResult,
  Promise<DescriptionProvenance | null>
>();

function descriptionProvenanceFor(
  engine: typeof EngineModule,
  result: TraceResult,
): Promise<DescriptionProvenance | null> {
  let promise = descriptionProvenanceCache.get(result);
  if (!promise) {
    promise = Promise.resolve()
      .then(() => engine.computeDescriptionProvenance(result) ?? null)
      // A throw inside the walk is "unavailable", exactly like a run that lacks
      // the data: the card renders nothing either way. Caught INSIDE the cached
      // chain so the cache never holds a rejected promise — every later
      // consumer of this result would otherwise get its own rejection to
      // handle, and the one that arrives after the hook has already settled
      // would have nowhere to report it.
      .catch(() => null);
    descriptionProvenanceCache.set(result, promise);
  }
  return promise;
}

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
