import type { DependencyDescriptor } from "@renovate-config-debugger/engine";
import { emitJson, emitLines } from "../output";
import { INPUT_OPTIONS, refusalNote, wouldRefuse } from "../run-input";
import { readDependencies } from "../dep";
import { groupTallyLines } from "../projections/group";
import { askGroup, type GroupQuestion } from "../questions/group";
import { askSimulation } from "../questions/simulate";
import { defineRunCommand } from "../run-command";

/**
 * Roadmap 074: "given these pending updates, which groups form, and would each
 * meet its `minimumGroupSize`?" — the batch-level question `simulate` cannot
 * answer one dependency at a time. The per-member gap notes and the
 * blind-tally correction live in the projection, shared with `simulate_group`.
 */

export const groupCommand = defineRunCommand<DependencyDescriptor[]>({
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
    "`--deps-file` names a JSON array of the same objects — strict JSON, where",
    "an inline `--dep` also takes JSON5.",
    "",
    "The tally is over YOUR list — Renovate evaluates minimumGroupSize against",
    "the repository's real pending updates, so `wouldForm: false` here means",
    '"these updates alone don\'t reach it", not "this group can never form".',
    "Branch splitting (separateMajorMinor, custom branchName templates) is not",
    "modeled; membership is by groupName as the rules resolved it.",
  ],
  options: [...INPUT_OPTIONS, "dep", "deps-file", "format"],
  prepare: (args) => readDependencies(args),
  async answer({ io, format, prepared: deps, result }) {
    const simulated: GroupQuestion[] = [];
    for (const dep of deps) {
      simulated.push({
        dep,
        sim: await askSimulation({ finalConfig: result.finalConfig, dep, transport: "cli" }),
      });
    }
    const { tally, gaps, notes } = askGroup(simulated, "cli");
    const refused = wouldRefuse(result);
    const refusal = refusalNote(refused ? ["the config"] : []);
    if (format === "json") {
      emitJson(io, {
        ...tally,
        notes,
        wouldRefuse: refused,
        ...(refusal ? { exitNote: refusal } : {}),
      });
    } else {
      emitLines(io, [
        ...groupTallyLines(tally, gaps),
        ...gaps.map((gap) => `note: ${gap}`),
        ...(refusal ? ["", refusal] : []),
      ]);
    }
  },
});
