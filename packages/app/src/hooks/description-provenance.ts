import { useEffect, useState } from "react";
import type { DescriptionProvenance, TraceResult } from "@renovate-config-debugger/engine";

/**
 * Roadmap 069: per-string `description` provenance, loaded the way every other
 * post-hoc trace derivation is — through the same dynamic engine import that
 * keeps the renovate chunk off the critical path, with the per-result promise
 * cached on the immutable result object so the walk runs ONCE per run however
 * many consumers ask. Mirrors `rule-provenance.ts` exactly; PR 3's blame ledger
 * and PR 4's tree annotations are the further consumers this cache is for.
 */
const descriptionProvenanceCache = new WeakMap<
  TraceResult,
  Promise<DescriptionProvenance | null>
>();

function descriptionProvenanceFor(result: TraceResult): Promise<DescriptionProvenance | null> {
  let promise = descriptionProvenanceCache.get(result);
  if (!promise) {
    promise = import("@renovate-config-debugger/engine").then(
      (engine) => engine.computeDescriptionProvenance(result) ?? null,
    );
    descriptionProvenanceCache.set(result, promise);
  }
  return promise;
}

/**
 * `undefined` = loading / no result yet, `null` = unavailable (the run has no
 * final config, or preset resolution never finished).
 */
export function useDescriptionProvenance(
  result: TraceResult | null | undefined,
): DescriptionProvenance | null | undefined {
  const [state, setState] = useState<DescriptionProvenance | null | undefined>(undefined);
  useEffect(() => {
    if (!result) {
      setState(undefined);
      return;
    }
    let live = true;
    setState(undefined);
    void (async () => {
      const provenance = await descriptionProvenanceFor(result);
      if (live) {
        setState(provenance);
      }
    })();
    return () => {
      live = false;
    };
  }, [result]);
  return state;
}
