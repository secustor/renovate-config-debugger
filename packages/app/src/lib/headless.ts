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
 * consumed; and (roadmap 069) the
 * description digest behind the Overview's "What this config does" card — the
 * grouping and counts, not the attribution, which is the engine's; and
 * (roadmap 071) the one-line rule summaries and the `packageRules[N]`
 * cross-index behind `RuleMessage`. The CLI must quote the
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
  type AppliedBlock,
  appliedUpdateTypeBlock,
  type ConsumedBlock,
  consumedAuthoredBlocks,
} from "./consumed-blocks";
export {
  buildDescriptionDigest,
  descriptionCountText,
  type DescriptionDigest,
  type DescriptionDigestTotals,
  type DigestEntry,
  type DigestGroup,
  type DigestRule,
  groupContributionText,
  ruleNoteText,
  unattributedNoteText,
} from "./description-digest";
export {
  effectiveTally,
  type EffectiveTally,
  isOverridden,
  type MultiContribBadge,
  multiContribBadgeKind,
} from "./effective-tally";
export { type LayerParseResult, parseLayerJson } from "./input-schemas";
export {
  crossRuleIndex,
  type RuleIndexReference,
  ruleIndexInMessage,
  type RuleMessageIndexKind,
} from "./rule-cross-index";
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
export { ruleWrittenKeys, summarizeRuleSelectors } from "./rule-selectors";
export { hasEvaluationError, isNoInputNoMatch } from "./rule-verdict";
export { changedDependencyKeys } from "./simulation-changes";
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
export {
  buildNoInputCaveat,
  buildVerdictSegments,
  type VerdictSegment,
  verdictText,
} from "./verdict-sentence";
