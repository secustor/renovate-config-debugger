export { runPipeline } from "./pipeline";
export {
  EXTRACTABLE_MANAGERS,
  type ExtractableMatch,
  type ExtractableWalk,
  type ExtractedPackageFile,
  extractDeps,
  type ExtractFile,
  type ExtractOutcome,
  type ExtractRequest,
  matchExtractableManagers,
  matchManagersForFile,
} from "./extract";
export type { PackageDependency } from "./renovate-adapter";
export { globalOnlyOptionNames, removeGlobalConfig } from "./config-scope";
export {
  type ClauseEvaluation,
  type DependencyDescriptor,
  type FlattenResult,
  type MergedKey,
  type MergeStep,
  type RuleEvaluation,
  simulatePackageRules,
  type SimulationResult,
  UPDATE_TYPE_KEYS,
} from "./simulate-package-rules";
export {
  type EvaluationErrorSummary,
  hasEvaluationError,
  isNoInputNoMatch,
  type MissingInputSummary,
} from "./simulate-missing-inputs";
export {
  compareSimulations,
  type ComparisonMode,
  type ConfigKeyDelta,
  type RuleRef,
  type SignatureChange,
  type SimulationComparison,
} from "./simulate-compare";
export {
  type AuthRefreshHandler,
  getPresetAuth,
  type PresetAuth,
  type PresetTokenKey,
  resolveAuthToken,
  setAuthRefreshHandler,
  setPresetAuth,
} from "./auth";
export { deriveUpdateType, renovateVersion } from "./version";
export { mergeChildConfig } from "./renovate-adapter";
export {
  getOptionIndex,
  type OptionDoc,
  type OptionIndex,
  type OptionPlacement,
  type OptionRequiredIf,
  optionsSourceUrl,
  PATTERN_MATCHING_NOTE,
  REQUIRED_IF_NOTE,
} from "./option-docs";
export { listDatasourceNames, listManagerNames } from "./registries";
export {
  type ErrorFixResult,
  type ErrorTranslation,
  findMentionedOption,
  translateMessage,
  type TranslatedMessage,
} from "./error-translations";
export { applyFixToText, type AppliedTextFix } from "./error-fix-text";
/** Also reachable as `@renovate-config-debugger/engine/text-scan` — the import
 *  the app's first-paint modules must use, since this barrel pulls the Renovate
 *  graph in with it. */
export { isSpaceAt, skipComment, skipString } from "./text-scan";
export {
  computeDescriptionProvenance,
  type DescriptionAttribution,
  type DescriptionProvenance,
  type DescriptionSource,
  type DroppedDescription,
  type DroppedDescriptionReason,
  type RuleDescriptionAttribution,
  type UnattributedDescription,
} from "./trace/description-provenance";
export {
  computeProvenance,
  computeRuleProvenance,
  type KeyProvenance,
  type ProvenanceLayer,
  type ProvenanceStep,
  type RuleAttribution,
} from "./trace/provenance";
export {
  computeResolvedConfig,
  type ResolvedConfigMode,
  type ResolvedConfigOutput,
} from "./trace/resolved-config";
export { parseInjectedPreset, presetInjectionKey } from "./shims/presets/injection";
export {
  CONFIG_FILE_NAMES,
  extractPackageJsonConfig,
  fetchRepoConfig,
  fetchRepoFile,
  fetchRepoTree,
  RepoConfigNotFoundError,
  type RepoConfigRequest,
  type RepoConfigResult,
  type RepoFileRequest,
  type RepoPlatform,
  type RepoTreeRequest,
  type RepoTreeResult,
} from "./shims/repo-config";
export { ROOT_NODE_ID, STAGE_IDS } from "./trace/model";
export type {
  PipelineInput,
  PresetNode,
  PresetNodeState,
  PresetSourceRef,
  StageId,
  StageStatus,
  TraceEvent,
  TraceResult,
  ValidationMessage,
} from "./trace/model";
