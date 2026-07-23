export { runPipeline } from "./pipeline";
export { setPresetAuth, type PresetAuth } from "./auth";
export { renovateVersion } from "./version";
export { getOptions, mergeChildConfig } from "./renovate-adapter";
export { getOptionIndex, type OptionDoc, type OptionIndex } from "./option-docs";
export {
  parseInjectedPreset,
  type PresetIdentity,
  presetInjectionKey,
} from "./shims/presets/injection";
export type {
  LogLevel,
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
