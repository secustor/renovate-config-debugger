import type { ReactNode } from "react";
import type {
  MergedKey,
  MergeStep,
  ProvenanceLayer,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { ConfigJson } from "@/components/ConfigJson";
import { CopyButton } from "@/components/CopyButton";
import { Term } from "@/components/glossary";
import { OptionKey } from "@/components/option-docs";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { ruleLabel } from "./rule-format";
import { ruleRef } from "@/lib/rule-ref";

/** Roadmap 044: the changed keys of one merge stop, as inline `<code>` chips
 *  inside its explanation row. */
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
 * Roadmap 044/046, retired to a static list by 094: one stop of the merge
 * replay. The sequence is base → each MATCHING rule (in merge order) →
 * update-type flattening (whenever blocks existed, merged up or merely
 * consumed) → the final per-dependency config. Non-matching rules are
 * deliberately absent — they merge nothing, and the rule list already explains
 * them clause by clause.
 *
 * A stop is prose plus an identity now, not a step: 094 retired the positional
 * stepper, so nothing walks the sequence one index at a time and no stop
 * carries the document snapshots a per-stop diff needed.
 */
export interface MergeStop {
  kind: "base" | "rule" | "flatten" | "final";
  /** `kind: "rule"` only — the rule's position in `packageRules`. */
  ruleIndex?: number;
  /** The keys this stop changed (rule and flatten stops). */
  merged?: MergedKey[];
  /** Stable identity: the list's React key. The scroll anchor is separate and
   *  positional — `mergeStopId(index)` in `dom-ids.ts` (roadmap 094). */
  id: string;
  /** Where the stop sits in the sequence. A rule stop matches how `stopLabels`
   *  words a thread's "step 2 of 2 in the replay →"; the rest are named. */
  counter: string;
  /** The head row: what this stop is (name, key chip, provenance chip). */
  head: ReactNode;
  explanation: ReactNode;
  /** More than prose, for the one stop that has more — the final config. */
  body?: ReactNode;
  /** Roadmap 047: the delta shorthand the collapsed drawer summary quotes
   *  (`+1` / `⊘7`). The flatten stop's alone: every other stop's explanation
   *  names the keys it wrote, which says more than a count. */
  count?: string;
}

/**
 * The starting point: the effective config with the simulated dependency's
 * fields layered on, before any rule ran.
 */
function baseStop(): MergeStop {
  return {
    kind: "base",
    id: "base",
    counter: "Start",
    head: <span className="migration-step-name">Base config</span>,
    explanation:
      "The effective config with the simulated dependency's fields layered on — what every rule was tested against.",
  };
}

/** One matching rule's stop, in merge order. */
function ruleStop(
  ms: MergeStep,
  i: number,
  nRules: number,
  sim: SimulationResult,
  layerByIndex: Map<number, ProvenanceLayer>,
  onSelectPreset?: (nodeId: string) => void,
): MergeStop {
  const rule = sim.rules.find((r) => r.index === ms.ruleIndex);
  const layer = ms.ruleIndex === undefined ? undefined : layerByIndex.get(ms.ruleIndex);
  // The engine declares `ruleIndex` optional on EVERY `MergeStep`, so
  // filtering to rule steps above does not narrow it — even though a rule
  // step always carries one. The hand-written template interpolated it
  // regardless and would have rendered `packageRules[undefined]`; this falls
  // back to the same "matched rule" wording the stop head already uses below
  // when the rule itself cannot be found.
  const ref = ms.ruleIndex === undefined ? "matched rule" : ruleRef(ms.ruleIndex);
  return {
    kind: "rule",
    ruleIndex: ms.ruleIndex,
    merged: ms.merged,
    id: `rule-${ms.ruleIndex}`,
    counter: `Step ${i + 1} of ${nRules}`,
    head: (
      <>
        <span className="sim-rule-index">{ref}</span>
        <span className="migration-step-name">{rule ? ruleLabel(rule) : "matched rule"}</span>
        {layer ? (
          <span className="sim-rule-provenance">
            <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} />
          </span>
        ) : null}
      </>
    ),
    explanation:
      ms.merged.length > 0 ? (
        <>This rule set {mergedKeyList(ms.merged)}.</>
      ) : (
        <>
          This rule matched but sets nothing beyond its <code>match*</code> selectors — the config
          is unchanged after this step.
        </>
      ),
  };
}

/**
 * Update-type flattening, which renders whenever blocks existed — merged up or
 * merely consumed.
 */
function flattenStop(
  sim: SimulationResult,
  flattenStep: MergeStep | undefined,
  blockKeys: string[],
): MergeStop {
  const mergedUp = flattenStep?.merged ?? [];
  return {
    kind: "flatten",
    merged: mergedUp,
    id: "flatten",
    count: mergedUp.length > 0 ? `+${mergedUp.length}` : `⊘${blockKeys.length}`,
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
          After the rules, Renovate merges the <code>{flattenStep?.updateType}</code> block up into
          the config and then drops every update-type block. Merged: {mergedKeyList(mergedUp)}.
        </>
      ) : (
        <>
          Renovate resolves the update-type blocks into the config for this update, then drops them
          all —{" "}
          {sim.flattened.updateType === undefined ? (
            <>
              <Term id="updateType">updateType</Term> is unset, so none of them applied
            </>
          ) : (
            <>
              none of them changed anything for this <code>{sim.flattened.updateType}</code> update
            </>
          )}
          ; the {blockKeys.length} block{blockKeys.length === 1 ? " was" : "s were"} consumed
          without merging anything up.
        </>
      ),
  };
}

/** What Renovate would actually use for this update — the README's promise,
 *  with its own Copy control. */
function finalStop(sim: SimulationResult): MergeStop {
  return {
    kind: "final",
    id: "final",
    counter: "Result",
    head: <span className="migration-step-name">Final per-dependency config</span>,
    explanation:
      "What Renovate would use for this update — the base config plus everything the stops before this one applied.",
    body: (
      <div>
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
  };
}

/**
 * The merge replay, as four kinds of stop. Each kind is its own builder — the
 * sequence is base -> every matching rule -> flattening -> final, and this
 * function is that sentence rather than the object literals it used to be.
 */
export function buildMergeStops(
  sim: SimulationResult,
  layerByIndex: Map<number, ProvenanceLayer>,
  onSelectPreset?: (nodeId: string) => void,
): MergeStop[] {
  const ruleSteps = sim.mergeSteps.filter((s) => s.kind === "rule");
  const nRules = ruleSteps.length;
  const flattenStep = sim.mergeSteps.find((s) => s.kind === "flatten");
  const blockKeys = Object.keys(sim.flattened.blocks);

  const stops: MergeStop[] = [baseStop()];
  for (const [i, ms] of ruleSteps.entries()) {
    stops.push(ruleStop(ms, i, nRules, sim, layerByIndex, onSelectPreset));
  }
  if (flattenStep !== undefined || blockKeys.length > 0) {
    stops.push(flattenStop(sim, flattenStep, blockKeys));
  }
  stops.push(finalStop(sim));
  return stops;
}
