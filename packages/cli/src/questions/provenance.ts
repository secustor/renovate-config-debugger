import {
  computeRuleProvenance,
  type KeyProvenance,
  type TraceResult,
} from "@renovate-config-debugger/engine";
import type { SourceFilter } from "@renovate-config-debugger/app/headless";
import { CliError } from "../io";
import { perDependencyNote, provenanceOf } from "../projections/provenance";
import {
  oneRuleView,
  type OneRuleView,
  type RuleDigestPlan,
  type RuleProvenanceView,
  ruleProvenanceView,
} from "../projections/rule-provenance";
import type { RunTransport } from "../run-input";

/**
 * "Who set this key?" — the dispatch behind `rcd provenance` and the MCP
 * server's `get_provenance` (see `./pipeline` for what this layer is).
 *
 * Four questions hide behind one key parameter, and which one was asked is the
 * part both transports used to re-derive: no key is the INDEX, a key is that
 * key's chain, `packageRules` is the concatenation projection, and
 * `packageRules` with a rule index is one merged rule's body.
 */

export interface ProvenanceQuestion {
  /** A top-level config option. Omitted asks for the index. */
  key?: string | undefined;
  /** One merged rule by index. `packageRules` only. */
  rule?: number | undefined;
  /** Scope the contributions to a class of layer. `packageRules` only. */
  source?: SourceFilter | undefined;
  transport: RunTransport;
}

export type ProvenanceAnswer =
  | {
      kind: "index";
      /** Every key, for the tally. */
      entries: KeyProvenance[];
      /** The keys some layer beyond the defaults set — what an index lists. */
      shown: KeyProvenance[];
    }
  | { kind: "key"; entry: KeyProvenance; perDependency?: string }
  | { kind: "rule"; view: OneRuleView }
  | {
      kind: "rules";
      /**
       * The `packageRules` view at a chosen digest plan. A closure because the
       * plan is the ONE thing that is transport business: a terminal scrolls
       * and takes the richest, while an MCP answer walks the plans down until
       * one fits its byte budget.
       */
      view: (plan: RuleDigestPlan) => RuleProvenanceView;
    };

/**
 * Same rule, two spellings: the CLI names the flags it rejected, the MCP
 * server names the parameter and the key that would have accepted it.
 */
const SCOPE_ERROR: Record<RunTransport, (key: string, offending: string) => string> = {
  cli: (key) => `--rule/--source scope the merged packageRules; "${key}" is not an array of rules`,
  mcp: (key, offending) =>
    `\`${offending}\` scopes the merged packageRules; key "${key}" is not an array of rules. ` +
    'Drop it, or ask for key: "packageRules".',
};

export function askProvenance(result: TraceResult, question: ProvenanceQuestion): ProvenanceAnswer {
  const { key, rule, source, transport } = question;
  const provenance = provenanceOf(result);
  const entries = [...provenance.values()];
  if (!key) {
    return { kind: "index", entries, shown: entries.filter((entry) => !entry.isDefaultOnly) };
  }
  const entry = provenance.get(key);
  if (!entry) {
    throw new CliError(`no key "${key}" in the effective config`);
  }
  if (key !== "packageRules") {
    // `rule` first, so the message names the parameter a caller most likely
    // reached for — and so both transports reject the same one of the two.
    const offending = rule !== undefined ? "rule" : source !== undefined ? "source" : undefined;
    if (offending) {
      throw new CliError(SCOPE_ERROR[transport](key, offending));
    }
    // Roadmap 068: for a key a packageRule can also set, this chain is the
    // repository-wide value, not the one an actual update would get.
    const note = perDependencyNote(key, result.finalConfig);
    return { kind: "key", entry, ...(note ? { perDependency: note } : {}) };
  }
  const attribution = computeRuleProvenance(result);
  const rules = Array.isArray(result.finalConfig?.packageRules)
    ? result.finalConfig.packageRules
    : [];
  if (rule !== undefined) {
    return { kind: "rule", view: oneRuleView(rule, attribution, rules) };
  }
  const scoped = source ? { source } : {};
  return {
    kind: "rules",
    view: (plan) => ruleProvenanceView(entry, attribution, rules, plan, scoped),
  };
}
