export { runPipeline } from "./pipeline";
export {
  type ClauseEvaluation,
  type ClauseState,
  type DependencyDescriptor,
  type MergedKey,
  type RuleEvaluation,
  type RuleVerdict,
  simulatePackageRules,
  type SimulationInput,
  type SimulationResult,
} from "./simulate-package-rules";
export { setPresetAuth, type PresetAuth } from "./auth";
export { renovateVersion } from "./version";
export { getOptions, mergeChildConfig } from "./renovate-adapter";
export { getOptionIndex, type OptionDoc, type OptionIndex } from "./option-docs";
export {
  computeProvenance,
  type KeyProvenance,
  type ProvenanceAction,
  type ProvenanceLayer,
  type ProvenanceStep,
} from "./trace/provenance";
export {
  parseInjectedPreset,
  type PresetIdentity,
  presetInjectionKey,
} from "./shims/presets/injection";
export {
  fetchRepoConfig,
  RepoConfigNotFoundError,
  type RepoConfigRequest,
  type RepoConfigResult,
  type RepoPlatform,
} from "./shims/repo-config";
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
