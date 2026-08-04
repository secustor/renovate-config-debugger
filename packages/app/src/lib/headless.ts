/**
 * Roadmap 058: the app's DOM-free derivations, as one entry point for
 * `packages/cli`.
 *
 * The engine answers "what did Renovate do"; these modules answer the handful
 * of questions the app adds on top — the preset-expansion totals, the plain-
 * English run digest, the effective-config tallies, the pollution-checked
 * parse of the 008 config layers. The CLI must quote the SAME numbers the web
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
  buildRunDigest,
  clauseText,
  type DigestClause,
  type DigestInput,
  type DigestProblem,
  type DigestTone,
  digestText,
} from "./run-digest";
export { buildDigestInput, deriveRunFacts, type RunFacts, validatedConfigOf } from "./run-facts";
