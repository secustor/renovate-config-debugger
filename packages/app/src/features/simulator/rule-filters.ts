import type { ProvenanceLayer, RuleEvaluation } from "@renovate-config-debugger/engine";
import { type LayerId, layerId, layerLabel } from "@/components/provenance-layer";
import { isNoInputNoMatch } from "./rule-format";

/**
 * The rules drawer's two filter facets — verdict and provenance — as one
 * value, with the pure filtering they drive.
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
 */

/** The verdict facet. `notable` is the default view (matched + unresolved,
 *  i.e. everything except a plain no-match) — roadmap 012/047's finding that a
 *  first screen of 700 "no match" rows buries the handful that did something.
 *  The other three are the verdicts a rule row can wear, split the way the
 *  badge splits them (see {@link isNoInputNoMatch}). */
export type VerdictFilter = "notable" | "all" | "matched" | "no-input" | "no-match";

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

export function matchesVerdictFilter(rule: RuleEvaluation, filter: VerdictFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "notable") {
    return rule.verdict !== "no-match";
  }
  if (filter === "matched") {
    return rule.verdict === "matched";
  }
  if (filter === "no-input") {
    return isNoInputNoMatch(rule);
  }
  return rule.verdict === "no-match" && !isNoInputNoMatch(rule);
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
  const byLayer = new Map<LayerId, FilterOption>();
  for (const rule of rules) {
    const layer = layerByIndex.get(rule.index);
    if (!layer) {
      continue;
    }
    const id = layerId(layer);
    const entry = byLayer.get(id);
    if (entry) {
      entry.count += 1;
    } else {
      byLayer.set(id, { value: id, label: layerLabel(layer), count: 1 });
    }
  }
  if (selected !== ALL_PRESETS && !byLayer.has(selected)) {
    byLayer.set(selected, { value: selected, label: selected.replace(/^preset:/, ""), count: 0 });
  }
  return [...byLayer.values()].toSorted(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}
