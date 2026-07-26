export { runPipeline } from "./pipeline";
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
} from "./simulate-package-rules";
export {
  compareSimulations,
  type ConfigKeyDelta,
  type RuleRef,
  type SimulationComparison,
} from "./simulate-compare";
export { setPresetAuth, type PresetAuth } from "./auth";
export { deriveUpdateType, renovateVersion } from "./version";
export { getOptions, mergeChildConfig } from "./renovate-adapter";
export { getOptionIndex, type OptionDoc, type OptionIndex } from "./option-docs";
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
  parseInjectedPreset,
  type PresetIdentity,
  presetInjectionKey,
} from "./shims/presets/injection";
export {
  fetchRepoConfig,
  fetchRepoFile,
  RepoConfigNotFoundError,
  type RepoConfigRequest,
  type RepoConfigResult,
  type RepoFileRequest,
  type RepoPlatform,
} from "./shims/repo-config";
export { STAGE_IDS } from "./trace/model";
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
