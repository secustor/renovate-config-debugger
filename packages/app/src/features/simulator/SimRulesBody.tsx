import type { ProvenanceLayer, RuleEvaluation } from "@renovate-config-debugger/engine";
import { RuleRow } from "./RuleRow";

/**
 * Roadmap 023/047: the body of the "Matched rules" drawer — the shown/filter
 * controls the persona study leaned on, then the rule rows themselves. The
 * "N of M rules shown" line stays inside the body: the drawer's own summary
 * row already carries the headline count, and this one tracks what the
 * filters are currently doing to the list below it.
 */
export function SimRulesBody({
  rules,
  shownRules,
  notableCount,
  hiddenCount,
  repoRuleCount,
  myRulesOnly,
  onMyRulesOnlyChange,
  showAll,
  onShowAllChange,
  layerByIndex,
  onSelectPreset,
}: {
  rules: RuleEvaluation[];
  shownRules: RuleEvaluation[];
  notableCount: number;
  hiddenCount: number;
  repoRuleCount: number;
  myRulesOnly: boolean;
  onMyRulesOnlyChange: (value: boolean) => void;
  showAll: boolean;
  onShowAllChange: (value: boolean) => void;
  layerByIndex: Map<number, ProvenanceLayer>;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const plural = rules.length === 1 ? "" : "s";
  return (
    <>
      <div className="sim-rules-head">
        <span className="sim-summary">
          {myRulesOnly
            ? `your ${repoRuleCount} config rule${repoRuleCount === 1 ? "" : "s"}`
            : showAll
              ? `all ${rules.length} rule${plural}`
              : `${notableCount} of ${rules.length} rule${plural} shown`}
        </span>
        {repoRuleCount > 0 ? (
          <button
            type="button"
            className={`sim-toggle${myRulesOnly ? " active" : ""}`}
            onClick={() => onMyRulesOnlyChange(!myRulesOnly)}
            title="Show only the packageRules from your own repo config, with their clause evidence expanded"
          >
            {myRulesOnly ? "show all rules" : "my rules only"}
          </button>
        ) : null}
        {hiddenCount > 0 && !myRulesOnly ? (
          <button type="button" className="sim-toggle" onClick={() => onShowAllChange(!showAll)}>
            {showAll ? "show matched only" : `show all ${rules.length}`}
          </button>
        ) : null}
      </div>
      {shownRules.length > 0 ? (
        <div className="sim-rules">
          {shownRules.map((rule) => (
            <RuleRow
              key={rule.index}
              rule={rule}
              layer={layerByIndex.get(rule.index)}
              onSelectPreset={onSelectPreset}
              defaultExpanded={myRulesOnly}
            />
          ))}
        </div>
      ) : myRulesOnly ? (
        <p className="empty-note">
          None of your repo config&apos;s rules are in the merged set for this run.
        </p>
      ) : (
        <p className="empty-note">
          No rule matched this dependency.{" "}
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="sim-toggle inline"
              onClick={() => onShowAllChange(true)}
            >
              Show all {rules.length} anyway.
            </button>
          ) : null}
        </p>
      )}
    </>
  );
}
