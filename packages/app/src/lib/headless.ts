/**
 * Roadmap 058: the app's DOM-free derivations, as one entry point for
 * `packages/cli`.
 *
 * The engine answers "what did Renovate do"; these modules answer the handful
 * of questions the app adds on top — the preset-expansion totals, the plain-
 * English run digest, the effective-config tallies, the pollution-checked
 * parse of the 008 config layers, and (roadmap 062) the simulator's rule
 * filters, which `rcd simulate --verdict/--source` is. The CLI must quote the
 * SAME numbers the web
 * app renders, so it imports them rather than restating them; this barrel is
 * the seam that makes that an import instead of a copy.
 *
 * Everything re-exported here is pure: no React, no DOM, no browser globals.
 * Nothing from `features/` may be added (the shared layer must not import a
 * feature — roadmap 048); if the CLI ever needs a feature-slice derivation,
 * that derivation gets hoisted into the shared layer first.
 */
export {
  computeTreeStats,
  identityForNodeId,
  type NodeStats,
  nodeIdForIdentity,
  presetTreeSummary,
  type TreeStats,
  type TreeSummary,
} from "@/components/preset-tree-stats";
export {
  effectiveTally,
  type EffectiveTally,
  isOverridden,
  type MultiContribBadge,
  multiContribBadgeKind,
} from "./effective-tally";
export { type LayerParseResult, parseLayerJson } from "./input-schemas";
export {
  ALL_PRESETS,
  DEFAULT_RULE_FILTERS,
  type FilterOption,
  filterRules,
  filterRulesBySource,
  isDefaultView,
  matchesSourceFilter,
  matchesVerdictFilter,
  type PresetFilter,
  presetFilterOptions,
  REPO_RULES,
  type RuleFilters,
  ruleLayerIndex,
  ruleVisible,
  SOURCE_FILTERS,
  type SourceFilter,
  VERDICT_FILTERS,
  type VerdictFilter,
  verdictFilterOptions,
} from "./rule-filters";
export { isNoInputNoMatch } from "./rule-verdict";
export {
  buildRunDigest,
  clauseText,
  type DigestClause,
  type DigestInput,
  type DigestProblem,
  type DigestTone,
  digestText,
} from "./run-digest";
export { buildDigestInput, deriveRunFacts, type RunFacts, validatedConfigOf } from "./run-facts";
