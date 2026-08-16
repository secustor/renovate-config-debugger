import type { ReactNode } from "react";
import type {
  MergedKey,
  ProvenanceLayer,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { ConfigJson } from "@/components/ConfigJson";
import { CopyButton } from "@/components/CopyButton";
import { Term } from "@/components/glossary";
import { OptionKey } from "@/components/option-docs";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import type { SequenceDotLevel } from "@/components/SequenceTimeline";
import type { StepThroughStep } from "@/components/StepThrough";
import { UPDATE_TYPE_KEYS } from "@/lib/update-type-keys";
import { ruleLabel } from "./rule-format";

/** Roadmap 044: the changed keys of one merge step, as inline `<code>` chips
 *  inside the stepper's explanation row. */
function mergedKeyList(merged: MergedKey[]): ReactNode {
  return merged.map((m, i) => (
    <span key={m.key}>
      {i > 0 ? ", " : null}
      <code>
        <OptionKey name={m.key} flagUnknown />
      </code>
    </span>
  ));
}

/**
 * Roadmap 044/046: one stop of the merge timeline — its chip on the shared
 * sequence grammar and its `StepThrough` step. The sequence is base → each
 * MATCHING rule (in merge order) → update-type flattening (whenever blocks
 * existed, merged up or merely consumed) → the final per-dependency config,
 * which replaces the old "show the full resolved dependency config"
 * disclosure. Non-matching rules are deliberately absent — they merge nothing,
 * and the rule list already explains them clause by clause.
 */
export interface MergeStop {
  kind: "base" | "rule" | "flatten" | "final";
  /** `kind: "rule"` only — the rule's position in `packageRules`. */
  ruleIndex?: number;
  /** The keys this stop changed (rule and flatten stops). */
  merged?: MergedKey[];
  chip: { dot?: SequenceDotLevel; label: ReactNode; count?: string; ariaLabel: string };
  step: StepThroughStep;
}

/** Stable identity so the flatten diff's widget memo never rebuilds. */
const FLATTEN_BENIGN_REMOVALS = {
  keys: UPDATE_TYPE_KEYS,
  note: "consumed by flattening — resolved into this update's config, then dropped; not a rejection",
};

export function buildMergeStops(
  sim: SimulationResult,
  layerByIndex: Map<number, ProvenanceLayer>,
  onSelectPreset?: (nodeId: string) => void,
): MergeStop[] {
  const ruleSteps = sim.mergeSteps.filter((s) => s.kind === "rule");
  const nRules = ruleSteps.length;
  const flattenStep = sim.mergeSteps.find((s) => s.kind === "flatten");
  const blockKeys = Object.keys(sim.flattened.blocks);
  const base = sim.mergeSteps[0]?.before ?? sim.rawFinalConfig;

  const stops: MergeStop[] = [
    {
      kind: "base",
      chip: { dot: "skipped", label: "base", ariaLabel: "Base config — before any rule" },
      step: {
        id: "base",
        before: base,
        after: base,
        counter: "Start",
        head: <span className="migration-step-name">Base config</span>,
        explanation:
          "The effective config with the simulated dependency's fields layered on — what every rule was tested against.",
        body: <div className="empty-note">Starting point — select a merge to see its diff.</div>,
      },
    },
  ];

  for (const [i, ms] of ruleSteps.entries()) {
    const rule = sim.rules.find((r) => r.index === ms.ruleIndex);
    const layer = ms.ruleIndex === undefined ? undefined : layerByIndex.get(ms.ruleIndex);
    const changed = ms.merged.length;
    stops.push({
      kind: "rule",
      ruleIndex: ms.ruleIndex,
      merged: ms.merged,
      chip: {
        // The 024 dot vocabulary, meanings intact: green circle = ran and
        // changed nothing, amber diamond = changed things.
        dot: changed > 0 ? "changed" : "clean",
        label: <span className="stage-chip-mono">packageRules[{ms.ruleIndex}]</span>,
        count: changed > 0 ? `+${changed}` : "±0",
        ariaLabel: `Step ${i + 1} of ${nRules}: packageRules[${ms.ruleIndex}] ${
          changed > 0 ? `changed ${changed} key${changed === 1 ? "" : "s"}` : "changed nothing"
        }`,
      },
      step: {
        id: `rule-${ms.ruleIndex}`,
        before: ms.before,
        after: ms.after,
        counter: `Step ${i + 1} of ${nRules}`,
        head: (
          <>
            <span className="sim-rule-index">packageRules[{ms.ruleIndex}]</span>
            <span className="migration-step-name">{rule ? ruleLabel(rule) : "matched rule"}</span>
            {layer ? (
              <span className="sim-rule-provenance">
                <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} />
              </span>
            ) : null}
          </>
        ),
        explanation:
          changed > 0 ? (
            <>This rule set {mergedKeyList(ms.merged)}.</>
          ) : (
            <>
              This rule matched but sets nothing beyond its <code>match*</code> selectors — the
              config is unchanged after this step.
            </>
          ),
      },
    });
  }

  // The flatten stop renders whenever update-type blocks existed — merged up
  // or merely consumed. The consumed-only diff is derived here (the engine
  // only records a step when something merged up): the blocks are deleted from
  // the config exactly as upstream `flattenUpdates` does.
  if (flattenStep !== undefined || blockKeys.length > 0) {
    const before = flattenStep?.before ?? sim.rawFinalConfig;
    let after = flattenStep?.after;
    if (after === undefined) {
      const cleaned = { ...before };
      for (const key of UPDATE_TYPE_KEYS) {
        delete cleaned[key];
      }
      after = cleaned;
    }
    const mergedUp = flattenStep?.merged ?? [];
    stops.push({
      kind: "flatten",
      merged: mergedUp,
      chip: {
        dot: "changed",
        label: "flatten",
        count: mergedUp.length > 0 ? `+${mergedUp.length}` : `⊘${blockKeys.length}`,
        ariaLabel:
          mergedUp.length > 0
            ? `Update-type flattening: merged the ${flattenStep?.updateType} block up, ${mergedUp.length} key${mergedUp.length === 1 ? "" : "s"}`
            : `Update-type flattening: consumed ${blockKeys.length} block${blockKeys.length === 1 ? "" : "s"}`,
      },
      step: {
        id: "flatten",
        before,
        after,
        counter: "After the rules",
        head: (
          <>
            <span className="migration-step-name">Update-type flattening</span>
            {flattenStep?.updateType ? (
              <code className="migration-step-key">{flattenStep.updateType}</code>
            ) : null}
          </>
        ),
        explanation:
          mergedUp.length > 0 ? (
            <>
              After the rules, Renovate merges the <code>{flattenStep?.updateType}</code> block up
              into the config and then drops every update-type block. Merged:{" "}
              {mergedKeyList(mergedUp)}.
            </>
          ) : (
            <>
              Renovate resolves the update-type blocks into the config for this update, then drops
              them all —{" "}
              {sim.flattened.updateType === undefined ? (
                <>
                  <Term id="updateType">updateType</Term> is unset, so none of them applied
                </>
              ) : (
                <>
                  none of them changed anything for this <code>{sim.flattened.updateType}</code>{" "}
                  update
                </>
              )}
              ; the {blockKeys.length} block{blockKeys.length === 1 ? " was" : "s were"} consumed
              without merging anything up.
            </>
          ),
        benignRemovals: FLATTEN_BENIGN_REMOVALS,
      },
    });
  }

  stops.push({
    kind: "final",
    chip: { label: "final config", ariaLabel: "Final per-dependency config" },
    step: {
      id: "final",
      before: sim.finalDependencyConfig,
      after: sim.finalDependencyConfig,
      counter: "Result",
      head: <span className="migration-step-name">Final per-dependency config</span>,
      explanation:
        "What Renovate would use for this update — the base config plus everything the stops before this one applied.",
      body: (
        <div className="sim-final-config">
          <div className="sim-final-config-actions">
            <CopyButton
              getText={() => `${JSON.stringify(sim.finalDependencyConfig, null, 2)}\n`}
              label="Copy config"
              title="Copy the final per-dependency config as JSON"
            />
          </div>
          <pre className="config-view">
            <ConfigJson value={sim.finalDependencyConfig} />
          </pre>
        </div>
      ),
    },
  });

  return stops;
}
