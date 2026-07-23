import { useEffect, useState } from "react";
import type { RuleAttribution, TraceResult } from "@renovate-config-visualizer/engine";

/**
 * Roadmap 013: loads + computes per-`packageRules`-entry provenance for a
 * result, once the engine chunk is present — shared by the effective config's
 * `packageRules` row, the simulator's rule rows, and the validation-message
 * cross-links (App). Mirrors EffectiveConfig's `useProvenance` hook shape:
 * `undefined` = loading/no result yet, `null` = unavailable (e.g. preset
 * resolution failed, or the replayed layer lengths didn't add up).
 */
export function useRuleProvenance(
  result: TraceResult | null | undefined,
): RuleAttribution[] | null | undefined {
  const [state, setState] = useState<RuleAttribution[] | null | undefined>(undefined);
  useEffect(() => {
    if (!result) {
      setState(undefined);
      return;
    }
    let live = true;
    setState(undefined);
    void import("@renovate-config-visualizer/engine").then((engine) => {
      if (live) {
        setState(engine.computeRuleProvenance(result) ?? null);
      }
    });
    return () => {
      live = false;
    };
  }, [result]);
  return state;
}
