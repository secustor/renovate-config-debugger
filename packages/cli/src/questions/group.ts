import type { DependencyDescriptor, SimulationResult } from "@renovate-config-debugger/engine";
import { blindTallyNote, type GroupTally, groupTally, inputGaps } from "../projections/group";
import type { RunTransport } from "../run-input";

/**
 * "Which groups form from these updates?" (roadmap 074) — behind `rcd group`
 * and the MCP server's `simulate_group` (see `./pipeline` for this layer).
 */

/** One simulated pending update: the union of the two slices the answer needs
 *  — the tally's `finalDependencyConfig` and the gap notes' `missingInputs`. */
export interface GroupUpdate {
  dep: DependencyDescriptor;
  sim: Pick<SimulationResult, "finalDependencyConfig" | "missingInputs">;
}

export interface GroupAnswer {
  tally: GroupTally;
  /** Per-member input gaps, kept apart because pretty output prints them
   *  under the tally rather than in the notes block. */
  gaps: string[];
  /** The blind-tally correction, the tally's own notes and the gaps, as the
   *  ONE notes array roadmap 073 asked for. */
  notes: string[];
}

/**
 * A member whose descriptor left rule inputs unset can be mis-tallied — a rule
 * that would group it reported a plain `no-match` — so when the tally came out
 * empty over blind members the correction LEADS the notes.
 */
export function askGroup(question: {
  updates: readonly GroupUpdate[];
  transport: RunTransport;
}): GroupAnswer {
  const { updates, transport } = question;
  const tally = groupTally(updates);
  const gaps = inputGaps(updates, transport);
  const blind = blindTallyNote(tally, gaps.length);
  return { tally, gaps, notes: [...(blind ? [blind] : []), ...tally.notes, ...gaps] };
}
