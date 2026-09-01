/**
 * Roadmap 058: the app's DOM-free derivations, as one entry point for
 * `packages/cli`.
 *
 * The engine answers "what did Renovate do"; these modules answer the handful
 * of questions the app adds on top — the preset-expansion totals, the plain-
 * English run digest, the effective-config tallies, the pollution-checked
 * parse of the 008 config layers, (roadmap 062) the simulator's rule
 * filters, which `rcd simulate --verdict/--source` is, and the verdict
 * sentence the card renders, with the update-type blocks flattening applied or
 * consumed; and (roadmap 071) the one-line rule summaries and the
 * `packageRules[N]` cross-index behind `RuleMessage`. The CLI must quote the
 * SAME numbers the web app renders, so it imports them rather than restating
 * them; this barrel is the seam that makes that an import instead of a copy.
 *
 * The list is exactly what `packages/cli/src` imports today, not everything a
 * CLI might one day want: a re-export nothing consumes is a public surface with
 * no consumer to keep it honest. Adding a line when the CLI needs one is the
 * cheap half; the modules themselves are untouched either way.
 *
 * Everything re-exported here is pure: no React, no DOM, no browser globals.
 * Nothing from `features/` may be added (the shared layer must not import a
 * feature — roadmap 048); if the CLI ever needs a feature-slice derivation,
 * that derivation gets hoisted into the shared layer first.
 */
export { computeTreeStats, type TreeStats } from "./preset-tree-stats";
export {
  type AppliedBlock,
  appliedUpdateTypeBlock,
  consumedAuthoredBlocks,
} from "./consumed-blocks";
export { effectiveTally, isOverridden, multiContribBadgeKind } from "./effective-tally";
export { plural } from "./format";
export { parseLayerJson } from "./input-schemas";
export { crossRuleIndex, ruleIndexInMessage, type RuleMessageIndexKind } from "./rule-cross-index";
export {
  filterRulesBySource,
  matchesVerdictFilter,
  ruleLayerIndex,
  ruleOriginLayer,
  SOURCE_FILTERS,
  type SourceFilter,
  VERDICT_FILTERS,
  type VerdictFilter,
} from "./rule-filters";
export { ruleWrittenKeys, summarizeRuleSelectors } from "./rule-selectors";
export { truncate } from "./truncate";
export { changedDependencyKeys } from "./simulation-changes";
export { buildRunDigest, clauseText, type DigestTone, digestText } from "./run-digest";
export { buildDigestInput, deriveRunFacts, type RunFacts, validatedConfigOf } from "./run-facts";
export { buildNoInputCaveat, buildVerdictSegments, verdictText } from "./verdict-sentence";
