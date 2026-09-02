import type { SimulationComparison } from "@renovate-config-debugger/engine";
import { plural } from "@renovate-config-debugger/app/headless";
import { outputFormat, stringOption } from "../args";
import type { Command } from "../command";
import { EXIT_OK } from "../io";
import { emitJson, emitLines, writeNotes } from "../output";
import {
  INPUT_OPTIONS,
  refusalNote,
  rejectExtraPositionals,
  runOne,
  takeInputFile,
  wouldRefuse,
} from "../run-input";
import { readDependency } from "../dep";
import {
  deltaLine,
  parseConfigScope,
  parseKeys,
  type WithheldKey,
} from "../projections/config-view";
import { parseCompareDetail, type ProjectedComparison } from "../projections/simulate";
import { askCompare } from "../questions/compare";
import { askSimulation } from "../questions/simulate";

/**
 * Roadmap 018's A/B oracle, and the reason the debugger can stay read-only:
 * an agent edits a config with its own tools, then PROVES the edit changes
 * (or doesn't change) behavior before opening a PR.
 *
 * Two shapes, both "A versus B, one thing varied":
 * - two config files, one dependency — did my edit change the outcome?
 * - one config, two dependencies — does this config treat them differently?
 */

/**
 * The headline states the BEHAVIOR verdict, in the words a reader can cite —
 * `netEffect` is the comparison's own phrasing, so the CLI, the MCP answer and
 * the app all headline with one sentence instead of three re-derivations of
 * it. The identity fact (a selector's text moved) is reported underneath,
 * because for the commonest behavior-preserving edit — dropping an entry from
 * the very array a rule matches on — it is guaranteed true and means nothing
 * on its own.
 *
 * The headline reads the VERDICT fields only, which is what lets it take a
 * projected comparison (whose delta may be narrowed) unchanged.
 */
type HeadlineFields = Pick<SimulationComparison, "verdict" | "netEffect"> & {
  /** `changed` alone — the one identity field every detail level carries. */
  identity: { changed: boolean };
};

export function comparisonHeadline(comparison: HeadlineFields): string {
  switch (comparison.verdict) {
    case "differs":
      return `Behavior differs between A and B — ${comparison.netEffect}.`;
    case "documentation-only":
      return `✓ No behavioral change — ${comparison.netEffect}.`;
    default:
      return comparison.identity.changed
        ? `✓ No behavioral change — ${comparison.netEffect}, which is expected when the edit ` +
            "touched the very selectors that rule matches on."
        : `✓ No behavioral change: ${comparison.netEffect}.`;
  }
}

/**
 * Replay-04 (three sessions, one calling it "the sharpest citability problem"):
 * compare used to exit 2 whenever an INPUT config would be refused, so a
 * proven "No behavioral change" arrived with the exit code of a failure — the
 * one command whose exit code a script gates an edit on was the one whose exit
 * code did not state its own verdict. The comparison IS the answer here, so a
 * comparison that ran exits 0, and the refusal stays a named fact on the
 * output (`wouldRefuse` per side, this note in pretty and `exitNote` in JSON).
 * `validate` is the command whose exit code carries refusal.
 */
const COMPARE_REFUSAL_TAIL =
  "the comparison above still ran on its resolved output and the exit code reflects the " +
  "comparison, not the refusal. `rcd validate` lists the messages and exits 2 on them.";

/**
 * The identity axis, as the requested detail level carries it: the list of
 * selector rewrites at `--detail rules`/`full`, and at the default a single
 * line with the count and the flag that lists them. Never nothing when the
 * churn is non-zero — a fact that vanishes with a detail level reads as a bug.
 */
function identityLines(comparison: ProjectedComparison): string[] {
  const changes = comparison.identity.signatureChanges;
  if (changes) {
    return changes.length === 0
      ? []
      : [
          "",
          "Selector text changed, same effect (rule identity, not behavior):",
          // Zero-based, like `--rule`, `index` in JSON and the provenance
          // citations — one index scheme on the whole surface (replay-03).
          ...changes.map((c) => `  ${c.a.label}  #${c.a.index} → #${c.b.index}  (${c.kind})`),
        ];
  }
  const counts = comparison.identity.counts;
  if (!counts || counts.signatureChanges === 0) {
    return [];
  }
  return [
    "",
    `Selector text changed on ${plural(counts.signatureChanges, "rule")}, same effect (rule identity, ` +
      "not behavior) — `--detail rules` lists them.",
  ];
}

const WITHHELD_REASON: Record<WithheldKey["reason"], string> = {
  "global-only": "global-only (no packageRule can reach it; `--config-scope full` carries it)",
  identical: "identical (both sides carry it, nothing differed)",
  absent: "absent (neither side's per-dependency config has it)",
};

/** The `--keys` names the delta above does not carry, and why: a withheld key
 *  that prints nothing is indistinguishable from one that did not differ. */
function withheldLines(comparison: ProjectedComparison): string[] {
  const withheld = comparison.configView.withheld;
  if (!withheld || withheld.length === 0) {
    return [];
  }
  return [
    "",
    "Requested keys not in the delta above:",
    ...withheld.map((entry) => `  ${entry.key} — ${WITHHELD_REASON[entry.reason]}`),
  ];
}

export const compareCommand: Command = {
  name: "compare",
  summary: "A/B two simulations: prove an edit changed (or didn't change) behavior",
  usage: [
    `compare <before.json> <after.json> --dep '{"depName":"react"}'`,
    `compare <file> --dep '{…}' --dep-b '{…}'`,
  ],
  details: [
    "The verdict has two axes. BEHAVIOR (`verdict`, one of `identical`,",
    "`documentation-only` — only prose such as `description` moved — and",
    "`differs`) is the citable claim, with `netEffect` stating it in words and",
    "`stoppedMatching`/`startedMatching` naming the rules behind it. IDENTITY",
    "(`identity.*`) is NOT a behavior claim: it only says a selector's text",
    "moved, which is unavoidable when the edit is to the matched array itself.",
    "",
    "A delta side flagged `aInherited`/`bInherited` is a value that reached that",
    "run's final config without any merge step writing it — a Renovate default,",
    "not something the config set. Pretty output marks it `(default in A)`.",
    "",
    "The key delta is reported at `--config-scope package-rules` (the globalOnly",
    "options no rule can reach are dropped) and `--keys a,b` narrows it further.",
    "Neither touches the verdict: `summary` states what the comparison found",
    "over the WHOLE delta, and every requested key the answer does not carry is",
    "named with why — `identical` (both sides carry it, nothing differs),",
    "`absent` (neither side's per-dependency config has it; a rule that did not",
    "match contributes nothing), or `global-only`. In JSON that is",
    "`configView.withheld`; pretty output lists the same keys under the delta.",
    "",
    "`--detail verdict` (the default) answers with the claim and its evidence,",
    "and states the identity axis as counts; `--detail rules` restores the rule",
    "and identity arrays (`matchedInBoth` included), `--detail full` the",
    "comparison exactly as the engine computes it, selector signatures and all.",
    "",
    "Exit code 0 means the comparison ran — even when an input config would be",
    "refused by Renovate (a note names the side; `wouldRefuse` in JSON).",
    "`rcd validate` is the command whose exit code reports refusal.",
  ],
  options: [
    ...INPUT_OPTIONS,
    "dep",
    "dep-file",
    "dep-b",
    "dep-b-file",
    "detail",
    "keys",
    "config-scope",
    "format",
  ],
  async run(args, io) {
    const format = outputFormat(args);
    const detail = parseCompareDetail(stringOption(args, "detail")) ?? "verdict";
    const keys = parseKeys(stringOption(args, "keys"));
    const scope = parseConfigScope(stringOption(args, "config-scope"));
    rejectExtraPositionals(args, "compare", 1);
    const { file, rest } = takeInputFile(args);
    const fileB = rest[0];
    const depA = await readDependency(args, "dep", "dep-file");
    const twoDeps = Boolean(stringOption(args, "dep-b") ?? stringOption(args, "dep-b-file"));
    const depB = twoDeps ? await readDependency(args, "dep-b", "dep-b-file") : depA;

    const a = await runOne(args, io, file);
    writeNotes(io, a.notes);
    const b = fileB ? await runOne(args, io, fileB) : a;
    if (fileB) {
      writeNotes(io, b.notes);
    }

    const simA = await askSimulation({
      finalConfig: a.result.finalConfig,
      dep: depA,
      transport: "cli",
    });
    const simB = await askSimulation({
      finalConfig: b.result.finalConfig,
      dep: depB,
      transport: "cli",
    });
    const { comparison, sideNotes, notes } = askCompare({
      simA,
      simB,
      twoConfigs: Boolean(fileB),
      twoDeps,
      detail,
      scope: scope ?? "package-rules",
      transport: "cli",
      ...(keys ? { keys } : {}),
    });

    const refusedA = wouldRefuse(a.result);
    const refusedB = wouldRefuse(b.result);
    const refusal = refusalNote(
      [
        ...(refusedA ? ["config A"] : []),
        ...(refusedB && b.result !== a.result ? ["config B"] : []),
      ],
      COMPARE_REFUSAL_TAIL,
    );

    if (format === "json") {
      emitJson(io, {
        a: {
          config: file ?? "(stdin/repo)",
          dep: depA,
          wouldRefuse: refusedA,
          missingInputs: simA.missingInputs,
          evaluationErrors: simA.evaluationErrors,
        },
        b: {
          config: fileB ?? file ?? "(stdin/repo)",
          dep: depB,
          wouldRefuse: refusedB,
          missingInputs: simB.missingInputs,
          evaluationErrors: simB.evaluationErrors,
        },
        ...comparison,
        // ONE notes array (roadmap 073): the per-side pointers and the
        // detail-level pointer read the same way, so they live in one place.
        ...(notes.length > 0 ? { notes } : {}),
        ...(refusal ? { exitNote: refusal } : {}),
      });
    } else {
      emitLines(io, [
        comparisonHeadline(comparison),
        ...sideNotes.flatMap((note) => ["", note]),
        ...(comparison.stoppedMatching.length > 0
          ? ["", "Matched only in A:", ...comparison.stoppedMatching.map((r) => `  ${r.label}`)]
          : []),
        ...(comparison.startedMatching.length > 0
          ? ["", "Matched only in B:", ...comparison.startedMatching.map((r) => `  ${r.label}`)]
          : []),
        ...(comparison.configDelta.length > 0
          ? ["", "Config delta:", ...comparison.configDelta.map((d) => `  ${deltaLine(d)}`)]
          : []),
        ...withheldLines(comparison),
        ...identityLines(comparison),
        ...(refusal ? ["", refusal] : []),
      ]);
    }
    return EXIT_OK;
  },
};
