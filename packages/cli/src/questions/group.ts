import type { DependencyDescriptor, SimulationResult } from "@renovate-config-debugger/engine";
import { blindTallyNote, type GroupTally, groupTally, inputGaps } from "../projections/group";
import type { RunTransport } from "../run-input";

/**
 * "Which groups form from these updates?" (roadmap 074) — behind `rcd group`
 * and the MCP server's `simulate_group` (see `./pipeline` for this layer).
 */

/** One simulated pending update: the union of the slices the answer needs —
 *  the tally's `finalDependencyConfig`, the gap notes' `missingInputs`, and the
 *  simulation's own input notes. */
export interface GroupUpdate {
  dep: DependencyDescriptor;
  sim: Pick<SimulationResult, "finalDependencyConfig" | "missingInputs" | "notes">;
}

export interface GroupAnswer {
  tally: GroupTally;
  /** Per-member input gaps, kept apart because pretty output prints them
   *  under the tally rather than in the notes block. */
  gaps: string[];
  /** Each member's own simulation notes (a defaulted field, a key no matcher
   *  reads), kept apart for the same reason as {@link GroupAnswer.gaps}. */
  inputNotes: string[];
  /** The blind-tally correction, the tally's own notes, the member notes and
   *  the gaps, as the ONE notes array roadmap 073 asked for. */
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
  // Named back to the update they came from, like the gap notes: over a batch,
  // "a key no matcher reads" is useless without the member it was typed on.
  const inputNotes = updates.flatMap(({ dep, sim }, index) =>
    sim.notes.map((note) => `${dep.depName ?? `update ${index + 1}`}: ${note}`),
  );
  return {
    tally,
    gaps,
    inputNotes,
    notes: [...(blind ? [blind] : []), ...tally.notes, ...inputNotes, ...gaps],
  };
}
