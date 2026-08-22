export { runPipeline } from "./pipeline";
export { globalOnlyOptionNames, removeGlobalConfig } from "./config-scope";
export {
  type ClauseEvaluation,
  type ClauseState,
  type DependencyDescriptor,
  type FlattenResult,
  type MergedKey,
  type MergeStep,
  type RuleEvaluation,
  type RuleVerdict,
  simulatePackageRules,
  type SimulationInput,
  type SimulationResult,
  UPDATE_TYPE_KEYS,
} from "./simulate-package-rules";
export {
  type EvaluationErrorSummary,
  hasEvaluationError,
  isNoInputNoMatch,
  type MissingInputGroup,
  type MissingInputSummary,
  summarizeEvaluationErrors,
  summarizeMissingInputs,
} from "./simulate-missing-inputs";
export {
  type CompareOptions,
  compareSimulations,
  type ComparisonMode,
  type ComparisonVerdict,
  type ConfigKeyDelta,
  type DeltaKind,
  type RuleIdentityChurn,
  type RuleRef,
  type SelectorChangeKind,
  type SignatureChange,
  type SimulationComparison,
} from "./simulate-compare";
export {
  getPresetAuth,
  type PresetAuth,
  type PresetHostRule,
  type PresetHostType,
  type PresetTokenKey,
  resolveAuthToken,
  setPresetAuth,
} from "./auth";
export { deriveUpdateType, renovateVersion } from "./version";
export { getOptions, mergeChildConfig } from "./renovate-adapter";
export {
  getOptionIndex,
  type OptionDoc,
  type OptionIndex,
  type OptionPlacement,
  type OptionRequiredIf,
  type OptionStage,
  optionsSourceUrl,
  PATTERN_MATCHING_NOTE,
  REQUIRED_IF_NOTE,
  STRING_PATTERN_MATCHING_DOCS_URL,
  TEMPLATING_NOTE,
} from "./option-docs";
export { listDatasourceNames, listManagerNames } from "./registries";
export {
  type ConfigPathSegment,
  ERROR_TRANSLATIONS,
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
export { isIndentAt, isSpaceAt, skipComment, skipString } from "./text-scan";
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
  type ProvenanceAction,
  type ProvenanceLayer,
  type ProvenanceStep,
  type RuleAttribution,
} from "./trace/provenance";
export {
  computeResolvedConfig,
  type ResolvedConfigMode,
  type ResolvedConfigOutput,
} from "./trace/resolved-config";
export {
  parseInjectedPreset,
  type PresetIdentity,
  presetInjectionKey,
} from "./shims/presets/injection";
export {
  CONFIG_FILE_NAMES,
  fetchRepoConfig,
  fetchRepoFile,
  RepoConfigNotFoundError,
  type RepoConfigRequest,
  type RepoConfigResult,
  type RepoFileRequest,
  type RepoPlatform,
} from "./shims/repo-config";
export { ROOT_NODE_ID, STAGE_IDS } from "./trace/model";
export type {
  LogLevel,
  MigrationStepInfo,
  PipelineInput,
  PlatformContext,
  PresetNode,
  PresetNodeState,
  PresetSource,
  PresetSourceRef,
  StageId,
  StageStatus,
  TraceEvent,
  TraceEventKind,
  TraceResult,
  ValidationMessage,
} from "./trace/model";
