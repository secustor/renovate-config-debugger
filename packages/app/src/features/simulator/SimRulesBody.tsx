import type { ProvenanceLayer, RuleEvaluation } from "@renovate-config-debugger/engine";
import {
  ALL_PRESETS,
  DEFAULT_RULE_FILTERS,
  type FilterOption,
  isDefaultView,
  type PresetFilter,
  REPO_RULES,
  type RuleFilters,
  type VerdictFilter,
  presetFilterOptions,
  verdictFilterOptions,
} from "@/lib/rule-filters";
import { RuleRow } from "./RuleRow";

function optionLabel(option: FilterOption): string {
  return `${option.label} (${option.count})`;
}

/**
 * Roadmap 023/047: the rules drawer's filter row — the Effective Config tab's
 * `.prov-filters` chrome, one `<select>` per facet. The controls sit on the
 * right edge because the drawer's own summary row already carries the headline
 * count on the left, and the shown-count is stated only while the filters are
 * actually narrowing the list: unfiltered it would repeat "N of M matched"
 * from the row above it.
 *
 * Its own component for the depth ratchet (`react/jsx-max-depth` is 3) —
 * the same reason `ProvFilters` is separate from the panel it filters.
 */
function SimRulesFilters({
  filters,
  onFiltersChange,
  verdictOptions,
  presetOptions,
  shownCount,
  totalCount,
}: {
  filters: RuleFilters;
  onFiltersChange: (filters: RuleFilters) => void;
  verdictOptions: FilterOption[];
  presetOptions: FilterOption[];
  shownCount: number;
  totalCount: number;
}) {
  const plural = totalCount === 1 ? "" : "s";
  // Stated only where it says something the rest of the drawer does not: the
  // default view's count is the summary row's own "N of M matched", and a
  // facet that hides nothing ("All verdicts") has nothing to report.
  const stateCount = shownCount < totalCount && !isDefaultView(filters);
  return (
    <div className="prov-filters sim-filters">
      {stateCount ? (
        <span className="sim-filter-count">
          {shownCount} of {totalCount} rule{plural} shown
        </span>
      ) : null}
      <select
        aria-label="Filter rules by verdict"
        value={filters.verdict}
        onChange={(e) => onFiltersChange({ ...filters, verdict: e.target.value as VerdictFilter })}
      >
        {verdictOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter rules by preset"
        value={filters.preset}
        onChange={(e) => onFiltersChange({ ...filters, preset: e.target.value as PresetFilter })}
      >
        <option value={ALL_PRESETS}>All presets</option>
        {presetOptions.map((option) => (
          <option key={option.value} value={option.value}>
            only from {optionLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** What an empty list means depends on why it is empty: at the default view
 *  it is the run's own answer ("nothing matched"), under a narrowed facet it
 *  is the filters' doing — and each states the way out of itself. */
function SimRulesEmpty({
  filters,
  onFiltersChange,
  hiddenCount,
  totalRules,
}: {
  filters: RuleFilters;
  onFiltersChange: (filters: RuleFilters) => void;
  hiddenCount: number;
  totalRules: number;
}) {
  if (!isDefaultView(filters)) {
    return (
      <p className="empty-note">
        No rule matches these filters.{" "}
        <button
          type="button"
          className="sim-toggle inline"
          onClick={() => onFiltersChange(DEFAULT_RULE_FILTERS)}
        >
          Clear them.
        </button>
      </p>
    );
  }
  return (
    <p className="empty-note">
      No rule matched this dependency.{" "}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="sim-toggle inline"
          onClick={() => onFiltersChange({ ...filters, verdict: "all" })}
        >
          Show all {totalRules} anyway.
        </button>
      ) : null}
    </p>
  );
}

/**
 * Roadmap 023/047: the body of the "Matched rules" drawer — the filter row the
 * persona study leaned on, then the rule rows themselves.
 */
export function SimRulesBody({
  rules,
  shownRules,
  filters,
  onFiltersChange,
  layerByIndex,
  onSelectPreset,
}: {
  rules: RuleEvaluation[];
  shownRules: RuleEvaluation[];
  filters: RuleFilters;
  onFiltersChange: (filters: RuleFilters) => void;
  layerByIndex: Map<number, ProvenanceLayer>;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <>
      <SimRulesFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        verdictOptions={verdictFilterOptions(rules)}
        presetOptions={presetFilterOptions(rules, layerByIndex, filters.preset)}
        shownCount={shownRules.length}
        totalCount={rules.length}
      />
      {shownRules.length > 0 ? (
        <div className="sim-rules">
          {shownRules.map((rule) => (
            <RuleRow
              key={rule.index}
              rule={rule}
              layer={layerByIndex.get(rule.index)}
              onSelectPreset={onSelectPreset}
              // Roadmap 023: narrowing to the user's OWN rules is the "where is
              // my rule?" move — those few rows open with their clause evidence
              // already showing, as the "my rules only" toggle used to.
              defaultExpanded={filters.preset === REPO_RULES}
            />
          ))}
        </div>
      ) : (
        <SimRulesEmpty
          filters={filters}
          onFiltersChange={onFiltersChange}
          hiddenCount={rules.length - shownRules.length}
          totalRules={rules.length}
        />
      )}
    </>
  );
}
