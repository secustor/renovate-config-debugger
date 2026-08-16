import type {
  ConfigKeyDelta,
  MergedKey,
  RuleEvaluation,
  SimulationComparison,
  SimulationResult,
} from "@renovate-config-debugger/engine";
import { CliError } from "../io";
import {
  collapseDiffs,
  type ConfigScope,
  type ConfigView,
  type MaybeCollapsed,
  projectConfig,
  projectKeySet,
} from "./config-view";

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
  if (options.detail === "full") {
    return sim;
  }
  const projected = projectConfig(sim.finalDependencyConfig, {
    scope: options.scope,
    ...(options.keys ? { keys: options.keys } : {}),
  });
  return {
    rules: collapseRuleMerges(sim.rules),
    flattened: { ...sim.flattened, merged: collapseDiffs(sim.flattened.merged) },
    finalDependencyConfig: projected.config,
    configView: projected.view,
    errors: sim.errors,
    warnings: sim.warnings,
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
