import type {
  ProvenanceLayer,
  RuleAttribution,
  RuleEvaluation,
} from "@renovate-config-debugger/engine";
import { type LayerId, layerId, layerLabel, tallyRulesByLayer } from "@/lib/provenance-layer";
import { hasEvaluationError, isNoInputNoMatch } from "./rule-verdict";

/**
 * The rules drawer's filter facets — verdict and provenance — as one value,
 * with the pure filtering they drive.
 *
 * They replace the three link toggles the drawer used to carry ("all N rules"
 * / "my rules only" / "show all N"): a link that both states the current view
 * and changes it reads as a caption, and the persona sessions had people
 * clicking "show all 715" to find out what it did. Two labelled `<select>`s in
 * the Effective Config tab's `.prov-filters` chrome say what they filter
 * before they are touched, and "my rules only" survives as what it always
 * was — the provenance facet narrowed to `repo config`.
 *
 * Pure functions in their own module (not inside the components) because
 * `useRuleFocus` must answer "is this rule currently visible?" with the exact
 * predicate the list renders with — a cross-link that scrolls to a row the
 * filters are hiding is the bug this shape prevents.
 *
 * Roadmap 062 hoisted the module out of `features/simulator/` into the shared
 * layer: the 2026-07 persona study found `rcd simulate` dumping ~713 rule rows
 * with no way to scope them, in 6 of 9 sessions. The CLI's `--verdict` /
 * `--source` flags are these predicates, reached through
 * `@renovate-config-debugger/app/headless` — so the CLI's counts are the app's
 * counts rather than a second implementation that drifts.
 */

/** The verdict facet. `notable` is the default view (matched + unresolved +
 *  the rows the tool could not evaluate) — roadmap 012/047's finding that a
 *  first screen of 700 "no match" rows buries the handful that did something.
 *  The others are the verdicts a rule row can wear, split the way the badge
 *  splits them (see {@link isNoInputNoMatch}, {@link hasEvaluationError}). */
export type VerdictFilter = "notable" | "all" | "matched" | "no-input" | "no-match" | "error";

/** Every {@link VerdictFilter}, for a CLI flag's parse + help text. */
export const VERDICT_FILTERS: readonly VerdictFilter[] = [
  "notable",
  "all",
  "matched",
  "no-input",
  "no-match",
  "error",
];

/** The provenance facet: a layer id present in the run, or {@link ALL_PRESETS}.
 *  A plain {@link LayerId} rather than a `"all" | LayerId` union — that union
 *  collapses to `string` anyway (see `no-redundant-type-constituents`), and
 *  `layerId()` only ever produces the four level kinds or a `preset:`-prefixed
 *  name, so the sentinel can never collide with a real layer. */
export type PresetFilter = LayerId;

export const ALL_PRESETS: PresetFilter = "all";

/** The repo layer's own id — "my rules only", as a filter value. */
export const REPO_RULES: PresetFilter = "repo";

export interface RuleFilters {
  verdict: VerdictFilter;
  preset: PresetFilter;
}

export const DEFAULT_RULE_FILTERS: RuleFilters = { verdict: "notable", preset: ALL_PRESETS };

/** Whether the drawer is showing its default view — the state whose count the
 *  drawer's own summary row already states. */
export function isDefaultView(filters: RuleFilters): boolean {
  return (
    filters.verdict === DEFAULT_RULE_FILTERS.verdict &&
    filters.preset === DEFAULT_RULE_FILTERS.preset
  );
}

/**
 * Roadmap 073, the blocker found while auditing the focused default: a clause
 * whose matcher threw is recorded `state: "error"` and pushes its rule to
 * `verdict: "no-match"`, so the old `notable` (`verdict !== "no-match"`) hid
 * "the tool could not evaluate this rule" — the documented `conda`
 * `matchCurrentVersion` case. `notable` therefore reads the error predicate
 * too, and `no-match` keeps meaning a GENUINE mismatch: it now excludes the
 * error rows the way it already excluded the no-input ones, because `error`
 * names them.
 *
 * A filter change, not a verdict change — `execute()` still reports exactly
 * what upstream's `applyPackageRules` would.
 */
export function matchesVerdictFilter(rule: RuleEvaluation, filter: VerdictFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "notable") {
    return rule.verdict !== "no-match" || hasEvaluationError(rule);
  }
  if (filter === "matched") {
    return rule.verdict === "matched";
  }
  if (filter === "no-input") {
    return isNoInputNoMatch(rule);
  }
  if (filter === "error") {
    return hasEvaluationError(rule);
  }
  return rule.verdict === "no-match" && !isNoInputNoMatch(rule) && !hasEvaluationError(rule);
}

function matchesPresetFilter(
  rule: RuleEvaluation,
  filter: PresetFilter,
  layerByIndex: Map<number, ProvenanceLayer>,
): boolean {
  if (filter === ALL_PRESETS) {
    return true;
  }
  const layer = layerByIndex.get(rule.index);
  return layer !== undefined && layerId(layer) === filter;
}

export function ruleVisible(
  rule: RuleEvaluation,
  filters: RuleFilters,
  layerByIndex: Map<number, ProvenanceLayer>,
): boolean {
  return (
    matchesVerdictFilter(rule, filters.verdict) &&
    matchesPresetFilter(rule, filters.preset, layerByIndex)
  );
}

export function filterRules(
  rules: RuleEvaluation[],
  filters: RuleFilters,
  layerByIndex: Map<number, ProvenanceLayer>,
): RuleEvaluation[] {
  return rules.filter((rule) => ruleVisible(rule, filters, layerByIndex));
}

/**
 * The coarse half of the provenance facet: "my rules" versus "everything a
 * preset brought in". The app's dropdown filters by ONE layer at a time
 * ({@link PresetFilter}) because it can list the layers the run actually has;
 * a `--source` flag has no such list to offer, and the question the persona
 * sessions actually asked of a 713-rule dump was "which of these are mine?".
 *
 * `repo` is the repo config's own layer — the same set "my rules only" always
 * meant. `presets` is every layer an `extends` pulled in. Neither covers the
 * `global`/`inherited`/`defaults` levels: those are not the repo's rules and
 * are not a preset either, so naming them under one of the two would be a
 * claim the run does not support.
 */
export type SourceFilter = "all" | "repo" | "presets";

/** Every {@link SourceFilter}, for a CLI flag's parse + help text. */
export const SOURCE_FILTERS: readonly SourceFilter[] = ["all", "repo", "presets"];

function matchesSourceFilter(
  rule: RuleEvaluation,
  filter: SourceFilter,
  layerByIndex: Map<number, ProvenanceLayer>,
): boolean {
  if (filter === "all") {
    return true;
  }
  const layer = layerByIndex.get(rule.index);
  if (!layer) {
    return false;
  }
  return filter === "repo" ? layer.kind === "repo" : layer.kind === "preset";
}

export function filterRulesBySource(
  rules: RuleEvaluation[],
  filter: SourceFilter,
  layerByIndex: Map<number, ProvenanceLayer>,
): RuleEvaluation[] {
  return rules.filter((rule) => matchesSourceFilter(rule, filter, layerByIndex));
}

/**
 * `computeRuleProvenance`'s array as the index → layer lookup every filter
 * here takes. Shared so the simulator's memo and the CLI build the map the
 * same way (and so "provenance unavailable" is one empty map, not two shapes).
 *
 * The layer is the ORIGINATING preset when the engine verified one — the
 * nested body that actually wrote the rule (`security:minimumReleaseAgeNpm`,
 * not the `config:best-practices` it arrived through) — falling back to the
 * direct extend. Every consumer of this map asks "which preset is this rule
 * from": the rule rows, the merge stops, the pin buckets, and the drawer's
 * preset facet, whose options are these same values. A `config:best-practices`
 * config otherwise answers all four with one 731-rule bucket named after an
 * extend that wrote none of them — the same asymmetry the effective config's
 * cascade already avoids by preferring `ProvenanceStep.writtenBy`.
 *
 * `sourceIndex` stays layer-relative (see {@link RuleAttribution}); a surface
 * that prints an index beside the name must read it off `writtenBy` too, or
 * the two halves of the citation name different bodies.
 */
export function ruleLayerIndex(
  attribution: readonly RuleAttribution[] | null | undefined,
): Map<number, ProvenanceLayer> {
  const map = new Map<number, ProvenanceLayer>();
  for (const attr of attribution ?? []) {
    map.set(attr.index, ruleOriginLayer(attr));
  }
  return map;
}

/** One entry's originating layer — {@link ruleLayerIndex}'s rule, for a caller
 *  holding the attribution itself rather than the map. */
export function ruleOriginLayer(attr: RuleAttribution): ProvenanceLayer {
  return attr.writtenBy
    ? { kind: "preset", nodeId: attr.writtenBy.nodeId, name: attr.writtenBy.name }
    : attr.layer;
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

/**
 * The verdict `<select>`'s options, each carrying how many rules it would
 * leave — the count is what makes the facet answerable before it is chosen
 * ("is it worth filtering?"), and a 0 says the run has none of that kind
 * rather than leaving the user to discover it by picking.
 */
export function verdictFilterOptions(rules: RuleEvaluation[]): FilterOption[] {
  const count = (filter: VerdictFilter) =>
    rules.filter((rule) => matchesVerdictFilter(rule, filter)).length;
  return [
    { value: "notable", label: "Matched & unresolved", count: count("notable") },
    { value: "all", label: "All verdicts", count: rules.length },
    { value: "matched", label: "only matched", count: count("matched") },
    { value: "no-input", label: "only no input", count: count("no-input") },
    { value: "no-match", label: "only no match", count: count("no-match") },
    { value: "error", label: "only not evaluated", count: count("error") },
  ];
}

/**
 * The provenance `<select>`'s options — one per layer that contributed a rule
 * to this run, most-contributing first (the same ordering the drawer's badge
 * row uses). `selected` is kept in the list even when the current run has no
 * rule from it: a re-simulation against a config that dropped a preset must
 * not silently show "all presets" while the state still filters by the gone
 * one.
 */
export function presetFilterOptions(
  rules: RuleEvaluation[],
  layerByIndex: Map<number, ProvenanceLayer>,
  selected: PresetFilter,
): FilterOption[] {
  // The grouping and the ordering are shared with the drawer's badge row
  // (`matchedLayerCounts`), which sits next to this dropdown — two spellings
  // were two chances for the two to disagree about the same run.
  const options: FilterOption[] = tallyRulesByLayer(rules, layerByIndex).map((tally) => ({
    value: layerId(tally.layer),
    label: layerLabel(tally.layer),
    count: tally.count,
  }));
  if (selected !== ALL_PRESETS && !options.some((option) => option.value === selected)) {
    // Appended rather than sorted in: its count is 0 and every real entry's is
    // at least 1, so the shared comparator would put it last regardless.
    options.push({ value: selected, label: selected.replace(/^preset:/, ""), count: 0 });
  }
  return options;
}
