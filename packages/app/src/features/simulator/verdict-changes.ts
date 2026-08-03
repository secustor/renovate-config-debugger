import type { ProvenanceLayer, SimulationResult } from "@renovate-config-visualizer/engine";
import type { MergeStop } from "./merge-stops";
import { buildVerdictThreads } from "./verdict-threads";

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
 * Roadmap 046/053: the collapsed row of a key's thread. Later merges win, so
 * the ledger names the thread's WINNER — the last stop that set the key. The
 * walk itself lives in `verdict-threads.ts` (053) and this is a projection of
 * it, so the row and the expanded thread can never disagree about who wrote
 * what.
 */
export function buildVerdictChanges(
  changedKeys: string[],
  mergeStops: MergeStop[],
  layerByIndex: Map<number, ProvenanceLayer>,
  sim: SimulationResult | null,
): VerdictChange[] {
  return buildVerdictThreads(changedKeys, mergeStops, layerByIndex, sim).map((thread) => ({
    key: thread.key,
    value: thread.finalValue,
    present: thread.present,
    layer: thread.winner?.layer,
    stopIndex: thread.winner?.stopIndex,
    stopLabel: thread.winner?.stopLabel,
  }));
}
