import { compareSimulations, type SimulationResult } from "@renovate-config-debugger/engine";
import type { ConfigScope } from "../projections/config-view";
import {
  type CompareDetail,
  comparisonMode,
  comparisonPayload,
  type ProjectedComparison,
} from "../projections/simulate";
import { evaluationErrorsNote, missingInputsNote } from "../rule-view";
import type { RunTransport } from "../run-input";

/**
 * The A/B oracle (roadmap 018) behind `rcd compare` and the MCP server's
 * `compare_simulations` (see `./pipeline` for what this layer is).
 *
 * Two simulations in, one comparison plus its per-side caveats out. What the
 * CALLER varied is an input, not a guess: `comparisonMode` derives it from the
 * two facts both transports hold, and getting it wrong is how a comparison
 * came to claim "a rule's pattern text changed" about two runs of one
 * identical config.
 */

export interface CompareQuestion {
  simA: SimulationResult;
  simB: SimulationResult;
  /** The B side is a second CONFIG. */
  twoConfigs: boolean;
  /** The B side is a second DEPENDENCY. */
  twoDeps: boolean;
  detail: CompareDetail;
  scope: ConfigScope;
  keys?: readonly string[] | undefined;
  transport: RunTransport;
}

export interface CompareAnswer {
  comparison: ProjectedComparison;
  /**
   * Per SIDE, and reported even when the verdict is `identical`: two sides
   * that both failed to evaluate the same rule agree perfectly, and "the edit
   * does nothing" is the wrong lesson to draw from two blind runs.
   */
  sideNotes: string[];
  /** The side notes and the comparison's own, as the ONE notes array roadmap
   *  073 asked for. Empty when the answer withheld nothing. */
  notes: string[];
}

export function askCompare(question: CompareQuestion): CompareAnswer {
  const { simA, simB, transport } = question;
  const sides = [
    { label: "A", sim: simA },
    { label: "B", sim: simB },
  ];
  const sideNotes = [
    // A side that could not EVALUATE a rule leads: it is one step more serious
    // than a side that merely lacked an input for it.
    ...sides.flatMap(({ label, sim }) => {
      const note = evaluationErrorsNote(sim.evaluationErrors, transport);
      return note ? [`${label} — ${note}`] : [];
    }),
    ...sides.flatMap(({ label, sim }) => {
      const note = missingInputsNote(sim.missingInputs, transport);
      return note ? [`${label} — ${note}`] : [];
    }),
    // The simulation's own input notes (a defaulted field, a key no matcher
    // reads) — a typo'd descriptor is exactly what makes two sides agree.
    ...sides.flatMap(({ label, sim }) => sim.notes.map((note) => `${label} — ${note}`)),
  ];
  const comparison = comparisonPayload(
    compareSimulations(simA, simB, {
      mode: comparisonMode(question.twoConfigs, question.twoDeps),
    }),
    {
      scope: question.scope,
      detail: question.detail,
      transport,
      sideKeys: [
        ...new Set([
          ...Object.keys(simA.finalDependencyConfig),
          ...Object.keys(simB.finalDependencyConfig),
        ]),
      ],
      ...(question.keys ? { keys: question.keys } : {}),
    },
  );
  return { comparison, sideNotes, notes: [...sideNotes, ...(comparison.notes ?? [])] };
}
