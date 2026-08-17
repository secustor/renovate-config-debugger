import { compareSimulations, type SimulationComparison } from "@renovate-config-debugger/engine";
import { outputFormat, stringOption } from "../args";
import type { Command } from "../command";
import { EXIT_OK, EXIT_REFUSED } from "../io";
import { emitJson, emitLines, writeNotes } from "../output";
import { INPUT_OPTIONS, refusalNote, runOne, takeInputFile, wouldRefuse } from "../run-input";
import { readDependency } from "../dep";
import { deltaLine, parseConfigScope, parseKeys } from "../projections/config-view";
import {
  comparisonPayload,
  parseCompareDetail,
  type ProjectedComparison,
} from "../projections/simulate";
import { evaluationErrorsNote, missingInputsNote } from "../rule-view";
import { simulateAgainst } from "./simulate";

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
  const noun = counts.signatureChanges === 1 ? "rule" : "rules";
  return [
    "",
    `Selector text changed on ${counts.signatureChanges} ${noun}, same effect (rule identity, ` +
      "not behavior) — `--detail rules` lists them.",
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
    "over the WHOLE delta, and `configView.withheld` names every requested key",
    "the answer does not carry, with why — `identical` (both sides carry it,",
    "nothing differs), `absent` (neither side's per-dependency config has it; a",
    "rule that did not match contributes nothing), or `global-only`.",
    "",
    "`--detail verdict` (the default) answers with the claim and its evidence,",
    "and states the identity axis as counts; `--detail rules` restores the rule",
    "and identity arrays (`matchedInBoth` included), `--detail full` the",
    "comparison exactly as the engine computes it, selector signatures and all.",
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
    const scope = parseConfigScope(stringOption(args, "config-scope"), "--config-scope");
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

    const simA = await simulateAgainst(a.result, depA);
    const simB = await simulateAgainst(b.result, depB);
    // What this invocation varied. Two files AND two dependencies is neither
    // axis alone, and a wrong guess is how the comparison came to claim a
    // pattern rewrite about one unchanged config file.
    const mode = fileB && twoDeps ? "unspecified" : twoDeps ? "dependency" : "config";
    const comparison = comparisonPayload(compareSimulations(simA, simB, { mode }), {
      scope: scope ?? "package-rules",
      detail,
      transport: "cli",
      sideKeys: [
        ...new Set([
          ...Object.keys(simA.finalDependencyConfig),
          ...Object.keys(simB.finalDependencyConfig),
        ]),
      ],
      ...(keys ? { keys } : {}),
    });

    const refusedA = wouldRefuse(a.result);
    const refusedB = wouldRefuse(b.result);
    const refusal = refusalNote([
      ...(refusedA ? ["config A"] : []),
      ...(refusedB && b.result !== a.result ? ["config B"] : []),
    ]);

    // Per SIDE, and reported even when the verdict is `identical:`. Two sides
    // that both failed to evaluate the same rule for lack of input agree
    // perfectly — and "the edit does nothing" is the wrong lesson to draw from
    // two blind runs.
    const missingA = missingInputsNote(simA.missingInputs, "cli");
    const missingB = missingInputsNote(simB.missingInputs, "cli");
    // Same reasoning, one step more serious: a side that could not EVALUATE a
    // rule is not a side that disagreed with the other one.
    const erroredA = evaluationErrorsNote(simA.evaluationErrors, "cli");
    const erroredB = evaluationErrorsNote(simB.evaluationErrors, "cli");
    const sideNotes = [
      ...(erroredA ? [`A — ${erroredA}`] : []),
      ...(erroredB ? [`B — ${erroredB}`] : []),
      ...(missingA ? [`A — ${missingA}`] : []),
      ...(missingB ? [`B — ${missingB}`] : []),
    ];

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
        ...(sideNotes.length + (comparison.notes?.length ?? 0) > 0
          ? { notes: [...sideNotes, ...(comparison.notes ?? [])] }
          : {}),
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
        ...identityLines(comparison),
        ...(refusal ? ["", refusal] : []),
      ]);
    }
    return refusedA || refusedB ? EXIT_REFUSED : EXIT_OK;
  },
};
