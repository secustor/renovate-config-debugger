import type {
  ConfigKeyDelta,
  MergedKey,
  RuleAttribution,
  RuleEvaluation,
  SimulationComparison,
  SimulationResult,
  ValidationMessage,
} from "@renovate-config-debugger/engine";
import { CliError } from "../io";
import { missingInputsNote } from "../rule-view";
import type { RunTransport } from "../run-input";
import {
  collapseDiffs,
  type ConfigScope,
  type ConfigView,
  type MaybeCollapsed,
  projectConfig,
  projectKeySet,
} from "./config-view";
import { type RuleCrossLink, ruleCrossLink } from "./messages";
import {
  type RuleOrigin,
  ruleOrigin,
  type RuleSourceRange,
  ruleSourceRanges,
} from "./rule-provenance";
import { flattenedView, verdictPayload } from "./verdict";

/**
 * Roadmap 070: the simulate/compare payload shape, shared by `rcd simulate` /
 * `rcd compare` and the MCP server's `simulate` / `compare_simulations`.
 *
 * It used to live in `mcp/server.ts`, which meant the CLI's `--format json`
 * had no `detail` gate at all and spread the whole `SimulationResult`: 74% of
 * a 106 kB answer was `mergeSteps` + `rawFinalConfig`, describing how the
 * merge proceeded — a question nobody asked. The two transports are one
 * surface, so they are now one implementation, and the projections it applies
 * (`config-view`) are the same on both.
 */

/**
 * H1 (roadmap 068, 6 of 9 persona sessions): what a simulate answer carries by
 * default.
 *
 * Measured on `config:recommended` + a react update, the whole
 * `SimulationResult` is 1.36 MB — of which `mergeSteps` is 797 kB (two
 * elements, each a full config snapshot) and `rawFinalConfig` 199 kB. Those
 * two answer "how did the merge proceed", a question nobody asked, and they
 * drowned the one that was: the elision spent its budget on them and returned
 * 2 of 713 rules, with the merge trace dropped whole anyway. Personas at every
 * level asked for the same shape by hand — the matched rules, `flattened` and
 * `finalDependencyConfig`.
 *
 * So the merge trace is opt-in. `full` is the whole `SimulationResult`,
 * untouched and byte-exact, for the caller who is actually stepping through
 * the merge — which is also what makes every other projection here safe to
 * apply: the unprojected document is one parameter away.
 */
export const SIMULATE_DETAIL = ["verdict", "full"] as const;
export type SimulateDetail = (typeof SIMULATE_DETAIL)[number];

export const VERDICT_DETAIL_NOTE =
  "`mergeSteps` and `rawFinalConfig` are omitted at this detail level — on a `config:recommended` " +
  'run they are ~1 MB of the payload and describe how the merge proceeded. Pass detail: "full" ' +
  "for them.";

export interface SimulateProjection {
  detail: SimulateDetail;
  keys?: readonly string[];
  scope: ConfigScope;
  /**
   * The transport's spelling of the missing-input pointer
   * (`missingInputsNote`). Optional only so a caller that has no rule list to
   * point at can omit it; both transports pass it.
   */
  transport?: RunTransport;
  /**
   * Per-rule attribution for the run this simulation came from (roadmap 071) —
   * `buildRuleView`'s `attribution`. Omitted, or `undefined` because the run
   * could not be attributed, means no `ruleSources`, no `origin` and no
   * message cross-links: a wrong layer is worse than none.
   */
  attribution?: readonly RuleAttribution[] | undefined;
  /**
   * The run's effective config (roadmap 048) — the pre-rules baseline
   * `verdict.changedKeys` is measured against. Omitted only costs the
   * sentence its negative clauses ("would NOT automerge" needs to know a rule
   * turned it off); the verdict itself is answered either way.
   */
  finalConfig?: Record<string, unknown> | undefined;
}

export const RULE_SOURCES_NOTE =
  "`ruleSources` is the whole rule list's legend: each entry is the CONTIGUOUS range of merged " +
  "indexes one layer contributed. A rule's index inside its own layer is `index - from` — for " +
  "the `repo` entry that is the `packageRules[N]` you wrote. Matched rules carry it inline as " +
  "`origin`.";

/** Matched rules, with the layer that contributed them. Only the matched ones:
 *  annotating all ~727 rows costs 15 % of the payload to answer a question
 *  about the handful that fired, and `ruleSources` already covers the rest. */
export function withRuleOrigins<T extends { index: number; verdict: RuleEvaluation["verdict"] }>(
  rules: readonly T[],
  attribution: readonly RuleAttribution[] | undefined,
): (T | (T & { origin: RuleOrigin }))[] {
  if (!attribution || attribution.length === 0) {
    return [...rules];
  }
  return rules.map((rule) => {
    if (rule.verdict !== "matched") {
      return rule;
    }
    const origin = ruleOrigin(rule.index, attribution);
    return origin ? { ...rule, origin } : rule;
  });
}

/** A message with `rule` — its merged index cross-linked to the one the reader
 *  wrote. These come from validating the MERGED array, so the link runs the
 *  other way round from the repo-stage messages `run_config` reports. */
export function withRuleLinks(
  messages: readonly ValidationMessage[],
  attribution: readonly RuleAttribution[] | undefined,
): (ValidationMessage | (ValidationMessage & { rule: RuleCrossLink }))[] {
  return messages.map((message) => {
    const rule = ruleCrossLink(message, "merged", attribution);
    return rule ? { ...message, rule } : message;
  });
}

/** A rule with its merge diffs collapsed. Exported because the rule list is
 *  REPLACED downstream when `verdict`/`source` scope it (`buildRuleView`), and
 *  the replacement must carry the same shape as the default one. */
export function collapseRuleMerges(
  rules: readonly RuleEvaluation[],
): (RuleEvaluation | (Omit<RuleEvaluation, "merged"> & { merged: MaybeCollapsed<MergedKey>[] }))[] {
  return rules.map((rule) =>
    rule.merged ? { ...rule, merged: collapseDiffs(rule.merged) } : rule,
  );
}

/**
 * The simulation, at the requested detail. Listed key by key rather than
 * subtracted from the result, so the default shape is legible here and a
 * future field has to be admitted on purpose.
 */
export function simulationPayload(sim: SimulationResult, options: SimulateProjection) {
  // Roadmap 048: FIRST, on every detail level. It is the answer the other keys
  // are evidence for, it is the last thing the MCP elision would take (it drops
  // the largest keys), and `full` must not be the level that loses it.
  const verdict = verdictPayload(sim, options.finalConfig, options.attribution);
  const flattened = flattenedView(sim, options.attribution);
  if (options.detail === "full") {
    // The escape hatch stays the result itself — every member verbatim,
    // `mergeSteps` and `rawFinalConfig` included — plus the verdict and the
    // flattening legend, which are additive and cost a few hundred bytes.
    return { verdict, ...sim, flattened };
  }
  const projected = projectConfig(sim.finalDependencyConfig, {
    scope: options.scope,
    ...(options.keys ? { keys: options.keys } : {}),
  });
  const missingNote = options.transport
    ? missingInputsNote(sim.missingInputs, options.transport)
    : undefined;
  const sources: RuleSourceRange[] = ruleSourceRanges(options.attribution);
  return {
    verdict,
    rules: withRuleOrigins(collapseRuleMerges(sim.rules), options.attribution),
    // ~200 bytes for the whole attribution, and immune to the elision (the
    // largest-array pass never picks it) — so "which layer wrote this rule"
    // survives an answer whose rule list did not.
    ...(sources.length > 0 ? { ruleSources: sources, ruleSourcesNote: RULE_SOURCES_NOTE } : {}),
    // Admitted on purpose, and NOT next to the rows it describes: `rules` is
    // replaced downstream by a `verdict`/`source` view and is the first array
    // the MCP elision shrinks, and the rules this counts are exactly the ones
    // a `notable`/`matched` filter removes. A few hundred bytes that survive
    // both, against an answer that reads as "nothing matched".
    missingInputs: sim.missingInputs,
    ...(missingNote ? { missingInputsNote: missingNote } : {}),
    flattened: { ...flattened, merged: collapseDiffs(sim.flattened.merged) },
    finalDependencyConfig: projected.config,
    configView: projected.view,
    // The simulator validates the MERGED array (`validateConfig("repo", {
    // packageRules })`), so a `packageRules[N]` here is a merged index — the
    // link says which rule of the reader's own config that is.
    errors: withRuleLinks(sim.errors, options.attribution),
    warnings: withRuleLinks(sim.warnings, options.attribution),
    notes: sim.notes,
    detailNote: VERDICT_DETAIL_NOTE,
  };
}

export interface ComparisonProjection {
  keys?: readonly string[];
  scope: ConfigScope;
}

export interface ProjectedComparison extends Omit<SimulationComparison, "configDelta"> {
  configDelta: MaybeCollapsed<ConfigKeyDelta>[];
  configView: ConfigView;
}

/**
 * The comparison, with its key delta scoped, key-selected and
 * description-collapsed.
 *
 * `summary` and the verdict booleans are deliberately NOT projected: they
 * state what the comparison found, over the whole delta, and a verdict that
 * changed with the view a caller asked for would be uncitable. So `summary`
 * may name a key this view withheld — which is exactly what `configView`
 * (`scope`, `withheld`, `droppedGlobalOnly`) is there to say.
 *
 * Collapsing never moves a key: it rewrites one entry's VALUE fields, so the
 * delta's key set is untouched by it.
 */
export function comparisonPayload(
  comparison: SimulationComparison,
  options: ComparisonProjection,
): ProjectedComparison {
  const { kept, view } = projectKeySet(
    comparison.configDelta.map((delta) => delta.key),
    { scope: options.scope, ...(options.keys ? { keys: options.keys } : {}) },
  );
  return {
    ...comparison,
    configDelta: collapseDiffs(comparison.configDelta.filter((delta) => kept.has(delta.key))),
    configView: view,
  };
}

export function parseDetail(raw: string | undefined): SimulateDetail | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const found = SIMULATE_DETAIL.find((detail) => detail === raw);
  if (!found) {
    throw new CliError(`--detail must be one of ${SIMULATE_DETAIL.join("|")} (got "${raw}")`);
  }
  return found;
}
