import {
  computeRuleProvenance,
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
import { type OutputFormat, type ParsedArgs, stringOption } from "./args";
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
 * The two defaults are deliberately different, because the two consumers are:
 * - pretty output defaults to `notable` (matched + unresolved — the drawer's
 *   own default view), and always states how many rows that hid, so nothing is
 *   silently truncated;
 * - `--format json` defaults to the FULL array, because scripts and the MCP
 *   drill-down already index into it; filters apply only when asked for, and
 *   then the payload carries the counts they hid.
 */

/** What the flags selected, plus whether the user actually typed them. */
export interface RuleFilterSelection {
  verdict: VerdictFilter;
  source: SourceFilter;
  /** Either flag was passed explicitly — the JSON payload filters only then. */
  explicit: boolean;
  /**
   * How the caller asked. The facets are one implementation with two
   * spellings — `--source repo` on the CLI, `source: "repo"` over MCP — and a
   * note that quotes the wrong one is a dead end for whoever reads it: an
   * agent cannot pass a flag, and telling it to is worse than saying nothing.
   */
  transport: RunTransport;
}

/** The facet as the caller would have to spell it on THEIR surface. */
function facetText(transport: RunTransport, facet: string, value: string): string {
  return transport === "mcp" ? `${facet}: "${value}"` : `--${facet} ${value}`;
}

function parseChoice<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  flag: string,
  fallback: T,
): T {
  if (raw === undefined) {
    return fallback;
  }
  const found = allowed.find((value) => value === raw);
  if (!found) {
    throw new CliError(`--${flag} must be one of ${allowed.join("|")} (got "${raw}")`);
  }
  return found;
}

export function ruleFilterSelection(args: ParsedArgs, format: OutputFormat): RuleFilterSelection {
  const rawVerdict = stringOption(args, "verdict");
  const rawSource = stringOption(args, "source");
  return {
    verdict: parseChoice(
      rawVerdict,
      VERDICT_FILTERS,
      "verdict",
      format === "json" ? "all" : "notable",
    ),
    source: parseChoice(rawSource, SOURCE_FILTERS, "source", "all"),
    explicit: rawVerdict !== undefined || rawSource !== undefined,
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
  /** Diagnostics for stderr — e.g. `--source` asked for with no provenance. */
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
  let rules = sim.rules.filter((rule) => matchesVerdictFilter(rule, selection.verdict));
  let source = selection.source;
  // Unconditionally, not just for `--source`: the attribution is also what
  // says which layer a matched rule came from, which every caller wants and
  // no filter asks for.
  const attribution = computeRuleProvenance(result);
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
    notes,
    attribution,
    sources: ruleSourceRanges(attribution),
    originOf: (index) => ruleOrigin(index, attribution),
  };
}

/** The flags as the user would have to type them to reproduce this view. */
function flagsOf(view: RuleView): string {
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

/** The JSON counterpart: present only when filters were actually applied, so
 *  an unflagged `--format json` keeps the exact payload scripts already parse. */
export function ruleFilterPayload(view: RuleView): { ruleFilter: Record<string, unknown> } {
  return {
    ruleFilter: {
      verdict: view.verdict,
      source: view.source,
      total: view.total,
      shown: view.rules.length,
      hidden: view.hidden,
    },
  };
}
