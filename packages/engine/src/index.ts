export { runPipeline } from "./pipeline";
export { setPresetAuth, type PresetAuth } from "./auth";
export { renovateVersion } from "./version";
export { getOptions } from "./renovate-adapter";
export type {
  LogLevel,
  PipelineInput,
  PresetSourceRef,
  StageId,
  StageStatus,
  TraceEvent,
  TraceEventKind,
  TraceResult,
  ValidationMessage,
} from "./trace/model";
