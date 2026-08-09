import {
  computeRuleProvenance,
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
  if (source !== "all") {
    const layerByIndex = ruleLayerIndex(computeRuleProvenance(result));
    if (layerByIndex.size === 0) {
      notes.push(
        `--source ${source} ignored: this run has no per-rule provenance ` +
          "(the preset tree is incomplete, so no rule can be attributed to a config level)",
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
