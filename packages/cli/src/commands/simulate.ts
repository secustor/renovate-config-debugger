import type { DependencyDescriptor, RuleEvaluation } from "@renovate-config-debugger/engine";
import { stringOption } from "../args";
import { emitJson, emitLines, writeNotes } from "../output";
import { INPUT_OPTIONS, refusalNote, wouldRefuse } from "../run-input";
import { readDependency } from "../dep";
import {
  buildRuleView,
  evaluationErrorsNote,
  hiddenRulesNote,
  missingInputsNote,
  type RuleFilterSelection,
  ruleFilterSelection,
} from "../rule-view";
import {
  collapseDiffs,
  type ConfigScope,
  mergedLine,
  parseConfigScope,
  parseKeys,
} from "../projections/config-view";
import { parseDetail, type SimulateDetail, simulationPayload } from "../projections/simulate";
import { flattenedView, verdictPayload } from "../projections/verdict";
import { askSimulation } from "../questions/simulate";
import { defineRunCommand } from "../run-command";

/**
 * "Would this PR be grouped/labeled/blocked here?" — every packageRule
 * evaluated against a hypothetical update, with clause-level evidence for why
 * each one did or didn't fire.
 */

/**
 * The rule list, one line each. A MATCHED line names the layer that wrote the
 * rule and its index there (`[repo packageRules[0]]`) — the answer to "which
 * of my rules is this", which the merged index alone never gave. Only the
 * matched ones: the suffix on all ~727 rows would bury the handful that fired,
 * and `--format json` carries `ruleSources` for the rest.
 *
 * `#N` is the merged `packageRules[N]` index — the same number `--rule`,
 * `--format json`'s `index` and the provenance citations use. Replay-03: the
 * old one-based `#N+1` cost two expert sessions a wasted `--rule` call each,
 * because every OTHER spelling of a rule index here is zero-based.
 */
export function verdictLines(
  rules: readonly RuleEvaluation[],
  originOf?: (index: number) => { layer: string; sourceIndex: number } | undefined,
): string[] {
  const lines: string[] = [];
  for (const rule of rules) {
    const clauses = rule.clauses.map((c) => `${c.key}=${c.state}`).join(", ");
    const origin = rule.verdict === "matched" ? originOf?.(rule.index) : undefined;
    const from = origin ? ` [${origin.layer} packageRules[${origin.sourceIndex}]]` : "";
    lines.push(`  #${rule.index} ${rule.verdict}${clauses ? ` (${clauses})` : ""}${from}`);
    for (const merged of collapseDiffs(rule.merged ?? [])) {
      lines.push(`      sets ${mergedLine(merged)}`);
    }
    for (const note of rule.notes) {
      lines.push(`      note: ${note}`);
    }
  }
  return lines;
}

interface SimulateFlags {
  selection: RuleFilterSelection;
  detail: SimulateDetail;
  keys: string[] | undefined;
  scope: ConfigScope | undefined;
  dep: DependencyDescriptor;
}

export const simulateCommand = defineRunCommand<SimulateFlags>({
  name: "simulate",
  summary: "evaluate the packageRules against one hypothetical update",
  usage: [`simulate [file] --dep '{"depName":"react","currentValue":"17.0.0"}'`],
  details: [
    "The outcome comes first, in one sentence — the first line of pretty output,",
    "`verdict.text` in JSON — and `flattened.note` says what the update-type",
    "flattening did: whether a block for this update type existed at all, and",
    "whether it changed anything when it was merged up.",
    "",
    "`updateType` is derived from currentValue/newValue when you don't set",
    "it, exactly as a real lookup would before the rules run — and `packageName`",
    "defaults to `depName`, the way Renovate's fetch worker fills it in.",
    "",
    "A `config:best-practices` config resolves to hundreds of rules, so BOTH",
    "output formats answer with the notable ones — matched, not-simulated, and",
    "the rows the tool could not evaluate — and state how many that withheld.",
    "`--verdict all` returns every row, `--verdict matched|no-input|no-match|",
    "error` one class, `--source repo|presets` scopes by the layer that wrote",
    "the rule, and `--rule <n>` returns ONE merged rule by index whatever the",
    "facets hide (`ruleSources` is the legend for those indexes). `--format",
    "json` always carries `ruleFilter` with `total`/`shown`/`hidden`.",
    "",
    "Rules that failed only because your `--dep` left a field unset are counted",
    "in `missingInputs`, and rules whose matcher THREW in `evaluationErrors`.",
    "Both are stated in one line whatever `--verdict` you asked for — those",
    "rules report a plain `no-match`, so every scoped view would otherwise hide",
    "them, and an un-evaluated rule is not a verdict about your config.",
    "",
    "`--format json` answers at `--detail verdict`: the merge trace",
    "(`mergeSteps`, `rawFinalConfig`) is ~1 MB on a `config:recommended` run and",
    "is opt-in through `--detail full`, which returns the whole simulation",
    "result unprojected. `finalDependencyConfig` is reported at",
    "`--config-scope package-rules` — the globalOnly options no rule can read",
    "are dropped — and `--keys a,b` narrows it to the options you asked about.",
    "Both narrowings apply at `--detail verdict` only; `--detail full` is the",
    "unprojected result and says so in `notes` when `--keys` was passed.",
  ],
  options: [
    ...INPUT_OPTIONS,
    "dep",
    "dep-file",
    "verdict",
    "source",
    "rule",
    "detail",
    "keys",
    "config-scope",
    "format",
  ],
  async prepare(args) {
    return {
      selection: ruleFilterSelection(args),
      detail: parseDetail(stringOption(args, "detail")) ?? "verdict",
      keys: parseKeys(stringOption(args, "keys")),
      scope: parseConfigScope(stringOption(args, "config-scope")),
      dep: await readDependency(args, "dep", "dep-file"),
    };
  },
  async answer({ io, format, prepared, result }) {
    const { selection, detail, keys, scope, dep } = prepared;
    const sim = await askSimulation({ finalConfig: result.finalConfig, dep, transport: "cli" });
    const view = buildRuleView(sim, result, selection);
    writeNotes(io, view.notes);
    const matched = sim.rules.filter((r) => r.verdict === "matched");
    const refused = wouldRefuse(result);
    const refusal = refusalNote(refused ? ["the config"] : []);

    if (format === "json") {
      emitJson(io, {
        dep,
        // The aggregates and the rule-list view both come from the projection,
        // so `missingInputs`, `evaluationErrors`, `ruleFilter` and the notes are
        // carried whatever `--verdict`/`--source`/`--rule` did to the rows — the
        // rules they count are exactly the ones a filter removes.
        ...simulationPayload(sim, {
          detail,
          scope: scope ?? "package-rules",
          transport: selection.transport,
          attribution: view.attribution,
          finalConfig: result.finalConfig,
          ruleView: view,
          ...(keys ? { keys } : {}),
        }),
        wouldRefuse: refused,
        ...(refusal ? { exitNote: refusal } : {}),
      });
    } else {
      // Deliberately NOT the whole `finalDependencyConfig`: it is the
      // effective config with every Renovate default in it, which buries the
      // answer. What the rules DID is the delta they merged; `--format json`
      // carries the full document for anyone who wants it.
      const changes = sim.mergeSteps.flatMap((step) =>
        collapseDiffs(step.merged).map(
          (m) =>
            `  ${mergedLine(m)}` +
            (step.kind === "flatten"
              ? `  (${step.updateType} block)`
              : `  (rule #${step.ruleIndex ?? 0})`),
        ),
      );
      const hiddenNote = hiddenRulesNote(view);
      // Siblings of the hidden-rules note, not part of it: these are printed
      // even when the view hid nothing, because the rules they count are
      // reported as a plain `no-match` and read as "your config just doesn't
      // do that" — or, for the error one, as a verdict about a rule the tool
      // never managed to evaluate.
      const missingNote = missingInputsNote(sim.missingInputs, selection.transport);
      const errorsNote = evaluationErrorsNote(sim.evaluationErrors, selection.transport);
      // Roadmap 048: the outcome in one sentence, ABOVE the counts — the same
      // string the web app's verdict card renders, so a terminal and a
      // screenshot answer the question the same way.
      const verdict = verdictPayload(sim, result.finalConfig, view.attribution);
      const flattened = flattenedView(sim, view.attribution);
      emitLines(io, [
        verdict.text,
        ...(verdict.caveat ? [verdict.caveat] : []),
        "",
        `${matched.length} of ${sim.rules.length} packageRules matched — rule numbers are ` +
          "merged packageRules[N] indexes, and `--rule <n>` takes them verbatim.",
        "",
        ...verdictLines(view.rules, view.originOf),
        ...(hiddenNote ? [hiddenNote] : []),
        ...(errorsNote ? [errorsNote] : []),
        ...(missingNote ? [missingNote] : []),
        "",
        ...(changes.length > 0
          ? ["The rules changed these options for this dependency:", ...changes]
          : ["No rule changed anything for this dependency."]),
        // Which of the four flattening outcomes produced the lines above (or
        // their absence) — an empty `merged` used to be silent about whether
        // there was a block at all.
        `Update-type flattening: ${flattened.note}.`,
        "",
        "`--format json` adds the clause-level evidence and the full per-dependency config.",
        ...(sim.notes.length > 0 ? ["", "Notes:", ...sim.notes.map((n) => `  ${n}`)] : []),
        ...(refusal ? ["", refusal] : []),
      ]);
    }
  },
});
