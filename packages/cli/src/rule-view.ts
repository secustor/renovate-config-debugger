import {
  computeRuleProvenance,
  type EvaluationErrorSummary,
  type MissingInputSummary,
  type RuleAttribution,
  type RuleEvaluation,
  type SimulationResult,
  type TraceResult,
} from "@renovate-config-debugger/engine";
import {
  filterRulesBySource,
  matchesVerdictFilter,
  ruleLayerIndex,
  SOURCE_FILTERS,
  type SourceFilter,
  VERDICT_FILTERS,
  type VerdictFilter,
} from "@renovate-config-debugger/app/headless";
import { choiceOption, intOption, type ParsedArgs } from "./args";
import { CliError } from "./io";
import {
  type RuleOrigin,
  ruleOrigin,
  type RuleSourceRange,
  ruleSourceRanges,
} from "./projections/rule-provenance";
import type { RunTransport } from "./run-input";

/**
 * Roadmap 062 (2026-07 persona study, top friction — 6 of 9 sessions): a
 * `config:best-practices` run has ~713 packageRules, and `rcd simulate` printed
 * every one of them with no way to scope the dump. The web app solved this in
 * its rules drawer; the predicates were hoisted into the app's shared layer so
 * BOTH surfaces filter with one implementation, reached here through
 * `@renovate-config-debugger/app/headless`.
 *
 * Roadmap 073 made the default ONE default: `notable` on pretty output, on
 * `--format json` and on the MCP tool. The old json default was the full array,
 * for scripts that index into it — but on a `config:recommended` run that array
 * is 340 kB against a 65 kB transport budget, so the "complete" answer was
 * already being cut to a byte-arithmetic window with no relation to the
 * question. `matched ⊂ notable`, so the common pipeline (`jq '.rules[] |
 * select(.verdict=="matched")'`) returns exactly what it did; what changed is
 * that the payload now STATES what it withheld and names the parameter that
 * returns it. That statement is the invariant — a narrowing nobody can reverse
 * is indistinguishable from a bug.
 */

/** What the flags (or the tool parameters) selected. */
export interface RuleFilterSelection {
  verdict: VerdictFilter;
  source: SourceFilter;
  /**
   * One merged rule by index — the drill-down that makes
   * `missingInputs.sampleRuleIndexes` actionable. It answers "why did rule N
   * not fire", so it is deliberately INDEPENDENT of the facets: a row the
   * verdict filter hides is the commonest reason to ask for it.
   */
  rule?: number;
  /**
   * How the caller asked. The facets are one implementation with two
   * spellings — `--source repo` on the CLI, `source: "repo"` over MCP — and a
   * note that quotes the wrong one is a dead end for whoever reads it: an
   * agent cannot pass a flag, and telling it to is worse than saying nothing.
   */
  transport: RunTransport;
}

/** The facet as the caller would have to spell it on THEIR surface. */
export function facetText(transport: RunTransport, facet: string, value: string): string {
  return transport === "mcp" ? `${facet}: "${value}"` : `--${facet} ${value}`;
}

/** `rule: 42` / `--rule 42` — the drill-down, spelled for this surface. */
function ruleText(transport: RunTransport, index: number | "N"): string {
  return transport === "mcp" ? `rule: ${index}` : `--rule ${index}`;
}

/** The facets, at one default for every output format (roadmap 073). */
export function ruleFilterSelection(args: ParsedArgs): RuleFilterSelection {
  const rule = intOption(args, "rule", { min: 0 });
  return {
    verdict: choiceOption(args, "verdict", VERDICT_FILTERS) ?? "notable",
    source: choiceOption(args, "source", SOURCE_FILTERS) ?? "all",
    ...(rule !== undefined ? { rule } : {}),
    transport: "cli",
  };
}

/** The rules a command should print, and what applying the filters cost. */
export interface RuleView {
  rules: RuleEvaluation[];
  /** How many rules the simulation produced, before filtering. */
  total: number;
  /** `total - rules.length`. */
  hidden: number;
  verdict: VerdictFilter;
  source: SourceFilter;
  /** The single rule this view was asked for, if any — the facets above then
   *  read `all`, because none of them decided the list. */
  rule?: number;
  /** Which surface's spelling the notes speak. */
  transport: RunTransport;
  /** Diagnostics about the view itself — e.g. `--source` asked for with no
   *  provenance; printed by the CLI and appended to the payload's `notes`. */
  notes: string[];
  /**
   * Per-rule attribution for the run behind this simulation (roadmap 071), or
   * undefined when it is not determinable. Carried whatever `--source` did,
   * because it is also what tells a caller which layer a MATCHED rule came
   * from — a question the filter does not ask.
   */
  attribution: readonly RuleAttribution[] | undefined;
  /** {@link attribution} as one range per contributing layer — the legend a
   *  payload can afford next to a 727-row rule list. */
  sources: RuleSourceRange[];
  /** Which layer contributed one merged rule, by its `RuleEvaluation.index`. */
  originOf: (index: number) => RuleOrigin | undefined;
}

/**
 * The row the drill-down asked for, or an error naming the total — an index
 * out of range is a question about a rule that does not exist, and answering
 * it with an empty list would read as "that rule did nothing".
 */
function oneRule(
  rules: readonly RuleEvaluation[],
  index: number,
  transport: RunTransport,
): RuleEvaluation {
  const found = rules[index];
  if (!found) {
    throw new CliError(
      `this simulation evaluated ${rules.length} merged packageRules; there is no rule ${index}. ` +
        `\`${facetText(transport, "verdict", "all")}\` lists them all, and \`ruleSources\` is the ` +
        "legend for the indexes.",
    );
  }
  return found;
}

/**
 * Applies the selection to a simulation. `--source` needs per-rule provenance
 * (`computeRuleProvenance`), which a run can legitimately fail to produce (a
 * preset that would not resolve, replayed layer lengths that don't add up).
 * That is reported as a note and the facet is dropped — filtering every rule
 * away because the attribution is missing would be a wrong answer, not a
 * narrow one.
 */
export function buildRuleView(
  sim: SimulationResult,
  result: TraceResult,
  selection: RuleFilterSelection,
): RuleView {
  const notes: string[] = [];
  // Unconditionally, not just for `--source`: the attribution is also what
  // says which layer a matched rule came from, which every caller wants and
  // no filter asks for.
  const attribution = computeRuleProvenance(result);
  if (selection.rule !== undefined) {
    // The drill-down answers about ONE row, so it reports the facets as `all`:
    // saying `verdict: "notable"` about a list no facet produced would be a
    // claim the view cannot back.
    return {
      rules: [oneRule(sim.rules, selection.rule, selection.transport)],
      total: sim.rules.length,
      hidden: Math.max(0, sim.rules.length - 1),
      verdict: "all",
      source: "all",
      rule: selection.rule,
      transport: selection.transport,
      notes,
      attribution,
      sources: ruleSourceRanges(attribution),
      originOf: (index) => ruleOrigin(index, attribution),
    };
  }
  let rules = sim.rules.filter((rule) => matchesVerdictFilter(rule, selection.verdict));
  let source = selection.source;
  if (source !== "all") {
    const layerByIndex = ruleLayerIndex(attribution);
    if (layerByIndex.size === 0) {
      notes.push(
        `${facetText(selection.transport, "source", source)} ignored: this run has no per-rule ` +
          "provenance (the preset tree is incomplete, so no rule can be attributed to a config " +
          "level)",
      );
      source = "all";
    } else {
      rules = filterRulesBySource(rules, source, layerByIndex);
    }
  }
  return {
    rules,
    total: sim.rules.length,
    hidden: sim.rules.length - rules.length,
    verdict: selection.verdict,
    source,
    transport: selection.transport,
    notes,
    attribution,
    sources: ruleSourceRanges(attribution),
    originOf: (index) => ruleOrigin(index, attribution),
  };
}

/** The flags as the user would have to type them to reproduce this view. */
function flagsOf(view: RuleView): string {
  if (view.rule !== undefined) {
    return `--rule ${view.rule}`;
  }
  const flags = [`--verdict ${view.verdict}`];
  if (view.source !== "all") {
    flags.push(`--source ${view.source}`);
  }
  return flags.join(" ");
}

/**
 * The trailing line pretty output owes the reader whenever the list it printed
 * is not the whole list. Never silent: a filtered dump that does not say what
 * it dropped is the same "where are my rules?" problem, one level down.
 */
export function hiddenRulesNote(view: RuleView): string | undefined {
  if (view.hidden === 0) {
    return undefined;
  }
  const noun = view.hidden === 1 ? "rule" : "rules";
  return (
    `${view.hidden} of ${view.total} ${noun} hidden by ${flagsOf(view)} — ` +
    "`--verdict all --source all` shows every rule."
  );
}

/** What `notable` keeps, in the words the badge uses — an agent that reads
 *  "notable" without this cannot tell whether an error row is in or out. */
const NOTABLE_MEANS =
  "the rows that acted or could not be decided: matched, not-simulated, and the ones the tool " +
  "could not evaluate";

/**
 * The payload's own statement of what it withheld and how to get it back — the
 * reversibility invariant of roadmap 073, and the reason flipping the default
 * to `notable` is not a silent narrowing.
 *
 * Present whenever ANY narrowing is in effect, including the one nobody asked
 * for (the default), and including a view that happened to hide nothing: a
 * reader cannot tell a short list from a shortened one, and the count is what
 * settles it.
 */
export function ruleFilterNote(view: RuleView): string | undefined {
  const { transport, total } = view;
  const allRows = `\`${facetText(transport, "verdict", "all")}\` returns every row`;
  const oneRow = `\`${ruleText(transport, "N")}\` returns one row by index, whatever the facets hide`;
  if (view.rule !== undefined) {
    return (
      `\`rules\` holds ONLY merged rule ${view.rule}, of ${total} — the drill-down ignores the ` +
      `verdict and source facets by design. ${allRows}.`
    );
  }
  if (view.verdict === "all" && view.source === "all") {
    return undefined;
  }
  const facets = [
    `\`${facetText(transport, "verdict", view.verdict)}\``,
    ...(view.source === "all" ? [] : [`\`${facetText(transport, "source", view.source)}\``]),
  ].join(" + ");
  const kept = view.verdict === "notable" ? ` — ${NOTABLE_MEANS}` : "";
  const withheld =
    view.hidden === 0
      ? "no row was withheld"
      : `${view.hidden} withheld (their counts are in \`verdict\`, \`missingInputs\` and ` +
        "`evaluationErrors`)";
  return (
    `\`rules\` holds the ${view.rules.length} of ${total} rules ${facets} keeps${kept}; ` +
    `${withheld}. ${allRows}, and ${oneRow}.`
  );
}

/**
 * The engine's transport-neutral missing-input line, with the pointer that
 * only this layer can spell: `--verdict no-input` for a person at a terminal,
 * `verdict: "no-input"` for an agent that cannot pass a flag.
 *
 * A SIBLING of `hiddenRulesNote`, never folded into it. That note answers
 * "what did the filter cost" and disappears when nothing was filtered — which
 * is precisely the view (`--verdict all`, an unfiltered MCP call) where the
 * no-input fact is still the whole answer.
 */
export function missingInputsNote(
  summary: MissingInputSummary,
  transport: RunTransport,
): string | undefined {
  if (!summary.note) {
    return undefined;
  }
  return `${summary.note} \`${facetText(transport, "verdict", "no-input")}\` lists them.`;
}

/**
 * The same shape for the aggregate that must survive even harder (roadmap 073):
 * a rule whose matcher threw is reported `no-match` by upstream, so nothing in
 * the row's verdict says the tool failed rather than the config.
 */
export function evaluationErrorsNote(
  summary: EvaluationErrorSummary,
  transport: RunTransport,
): string | undefined {
  if (!summary.note) {
    return undefined;
  }
  return `${summary.note} \`${facetText(transport, "verdict", "error")}\` lists them.`;
}

/**
 * The JSON counterpart, on EVERY payload (roadmap 073) — `total`/`shown`/
 * `hidden` are what make the flipped default auditable, and a key that appears
 * only when a filter was passed cannot be relied on to say "nothing was
 * withheld".
 */
export function ruleFilterPayload(view: RuleView): { ruleFilter: Record<string, unknown> } {
  return {
    ruleFilter: {
      verdict: view.verdict,
      source: view.source,
      ...(view.rule !== undefined ? { rule: view.rule } : {}),
      total: view.total,
      shown: view.rules.length,
      hidden: view.hidden,
    },
  };
}
