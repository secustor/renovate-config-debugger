import type { DependencyDescriptor, SimulationResult } from "@renovate-config-debugger/engine";
import { outputFormat } from "../args";
import type { Command } from "../command";
import { EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, writeNotes } from "../output";
import { INPUT_OPTIONS, refusalNote, runFromArgs, wouldRefuse } from "../run-input";
import { readDependencies } from "../dep";
import { groupTally, groupTallyLines } from "../projections/group";
import { simulateAgainst } from "./simulate";

/**
 * Roadmap 074: "given these pending updates, which groups form, and would each
 * meet its `minimumGroupSize`?" — the batch-level question `simulate` cannot
 * answer one dependency at a time.
 */

/** A side's input gap, stated per update: a rule that could not be evaluated
 *  for one member is a fact about that member's descriptor, and a group tally
 *  over blind simulations reads as "these updates just don't group". */
function inputGapNotes(
  simulated: readonly { dep: DependencyDescriptor; sim: SimulationResult }[],
): string[] {
  return simulated.flatMap(({ dep, sim }, index) => {
    const count = sim.missingInputs.rules;
    if (count === 0) {
      return [];
    }
    const name = dep.depName ?? `update ${index + 1}`;
    return [
      `${name}: ${count} rule${count === 1 ? "" : "s"} could not match because this update ` +
        "leaves a field they read unset — `rcd simulate` that update to see which.",
    ];
  });
}

export const groupCommand: Command = {
  name: "group",
  summary: "which groups form from several updates, and does each meet its minimumGroupSize",
  usage: [
    `group [file] --dep '{"depName":"a","updateType":"minor"}' --dep '{"depName":"b","updateType":"minor"}'`,
    "group [file] --deps-file updates.json",
  ],
  details: [
    "Simulates every update you supply (the same evaluation `simulate` runs),",
    "reads each one's per-dependency `groupName` and `minimumGroupSize`, and",
    "tallies the groups: which updates land together, and whether the members",
    "you supplied alone reach the gate. `--dep` repeats, one per update, or",
    "`--deps-file` names a JSON array of the same objects.",
    "",
    "The tally is over YOUR list — Renovate evaluates minimumGroupSize against",
    "the repository's real pending updates, so `wouldForm: false` here means",
    '"these updates alone don\'t reach it", not "this group can never form".',
    "Branch splitting (separateMajorMinor, custom branchName templates) is not",
    "modeled; membership is by groupName as the rules resolved it.",
  ],
  options: [...INPUT_OPTIONS, "dep", "deps-file", "format"],
  async run(args, io) {
    const format = outputFormat(args);
    const deps = await readDependencies(args);
    const { result, notes } = await runFromArgs(args, io);
    writeNotes(io, notes);
    const simulated: { dep: DependencyDescriptor; sim: SimulationResult }[] = [];
    for (const dep of deps) {
      simulated.push({ dep, sim: await simulateAgainst(result, dep) });
    }
    const tally = groupTally(simulated);
    const gaps = inputGapNotes(simulated);
    const refused = wouldRefuse(result);
    const refusal = refusalNote(refused ? ["the config"] : []);
    if (format === "json") {
      emitJson(io, {
        ...tally,
        notes: [...tally.notes, ...gaps],
        wouldRefuse: refused,
        ...(refusal ? { exitNote: refusal } : {}),
      });
    } else {
      emitLines(io, [
        ...groupTallyLines(tally),
        ...gaps.map((gap) => `note: ${gap}`),
        ...(refusal ? ["", refusal] : []),
      ]);
    }
    return refused ? EXIT_REFUSED : EXIT_OK;
  },
};
