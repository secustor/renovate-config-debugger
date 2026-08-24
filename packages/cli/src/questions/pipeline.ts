import type { PipelineInput, PresetAuth } from "@renovate-config-debugger/engine";

/**
 * `src/questions/` — the transport-neutral layer between the engine and the
 * two surfaces that speak for it.
 *
 * Roadmap 060's claim is that "the MCP tools are the CLI's projections, not a
 * second implementation". The projections made that true for RENDERING; the
 * assembly around them — build the pipeline input, dispatch a provenance
 * question, finish a dependency descriptor, tally a comparison's per-side
 * notes — was still written twice, once in `src/commands/*` and once in
 * `src/mcp/server.ts`, and the two copies had already drifted apart.
 *
 * The rule here: typed inputs in, a typed ANSWER out. Nothing in this
 * directory prints, exits, reads argv, or shapes an MCP result — a question is
 * asked the same way from both transports and each formats the answer its own
 * way. Where a message has to differ per transport (a flag name on one side, a
 * tool parameter on the other) it is a `Record<RunTransport, …>` table, the
 * same shape `run-input.ts` already uses for the credentials guard: the two
 * spellings sit next to each other instead of in two files.
 */

/** Everything a run needs, however the caller came by it. */
export interface PipelineInputSpec {
  fileName: string;
  content: string;
  /** The credentials the run may use — `{}` when the guard withheld them. It
   *  travels ON the input, never in engine module state (see `resolveRunAuth`). */
  presetAuth: PresetAuth;
  globalConfig?: Record<string, unknown> | undefined;
  inheritedConfig?: Record<string, unknown> | undefined;
  platform?: string | undefined;
  endpoint?: string | undefined;
  platformOverride?: boolean | undefined;
}

/**
 * The optional halves of a `PipelineInput` are OMITTED rather than set to
 * `undefined`: the engine distinguishes "no global config layer" from "a
 * global config layer that is undefined" in more than one place, and a spread
 * of `{ platform: undefined }` is not the same input as one without the key.
 */
export function buildPipelineInput(spec: PipelineInputSpec): PipelineInput {
  return {
    fileName: spec.fileName,
    content: spec.content,
    presetAuth: spec.presetAuth,
    ...(spec.globalConfig ? { globalConfig: spec.globalConfig } : {}),
    ...(spec.inheritedConfig ? { inheritedConfig: spec.inheritedConfig } : {}),
    ...(spec.platform ? { platform: spec.platform } : {}),
    ...(spec.endpoint ? { endpoint: spec.endpoint } : {}),
    ...(spec.platformOverride ? { platformOverride: true } : {}),
  };
}
