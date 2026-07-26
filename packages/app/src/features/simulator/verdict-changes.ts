import type { ProvenanceLayer, SimulationResult } from "@renovate-config-visualizer/engine";
import type { MergeStop } from "./merge-stops";

/** Roadmap 046: one ledger entry of the verdict card — a setting the rules
 *  genuinely changed, plus where it came from and the merge stop that set it. */
export interface VerdictChange {
  key: string;
  value: unknown;
  present: boolean;
  /** The layer that owns the rule that last set this key. */
  layer?: ProvenanceLayer;
  /** The merge-timeline stop that last set this key, and its human name. */
  stopIndex?: number;
  stopLabel?: string;
}

/**
 * Roadmap 046: each ledger entry carries the merge stop that last set its
 * key — later merges win, so the LAST stop naming the key is authoritative.
 */
export function buildVerdictChanges(
  changedKeys: string[],
  mergeStops: MergeStop[],
  layerByIndex: Map<number, ProvenanceLayer>,
  sim: SimulationResult | null,
): VerdictChange[] {
  const nRuleStops = mergeStops.filter((s) => s.kind === "rule").length;
  return changedKeys.map((key) => {
    let layer: ProvenanceLayer | undefined;
    let stopIndex: number | undefined;
    let stopLabel: string | undefined;
    for (let i = mergeStops.length - 1; i >= 0; i--) {
      const stop = mergeStops[i];
      if (!stop?.merged?.some((m) => m.key === key)) {
        continue;
      }
      stopIndex = i;
      if (stop.kind === "rule") {
        layer = stop.ruleIndex === undefined ? undefined : layerByIndex.get(stop.ruleIndex);
        const ordinal = mergeStops.slice(0, i + 1).filter((s) => s.kind === "rule").length;
        stopLabel = `step ${ordinal} of ${nRuleStops}`;
      } else {
        stopLabel = "flatten step";
      }
      break;
    }
    return {
      key,
      value: sim?.finalDependencyConfig[key],
      present: sim ? key in sim.finalDependencyConfig : false,
      layer,
      stopIndex,
      stopLabel,
    };
  });
}
