import {
  computeResolvedConfig,
  type ResolvedConfigMode,
  type ResolvedConfigOutput,
  type TraceResult,
} from "@renovate-config-debugger/engine";
import { CliError } from "../io";
import type { RunTransport } from "../run-input";

/**
 * "What would I write instead of these presets?" (roadmap 051) — behind
 * `rcd resolved` and the MCP server's `get_resolved_config` (see `./pipeline`
 * for what this layer is).
 */

export interface ResolvedQuestion {
  mode: ResolvedConfigMode;
  includeDefaults: boolean;
  transport: RunTransport;
}

export interface ResolvedAnswer {
  mode: ResolvedConfigMode;
  includeDefaults: boolean;
  output: ResolvedConfigOutput;
}

/** Defaults may only be written into a fully expanded document: in one that
 *  still extends presets they would merge AFTER them and override them. */
const DEFAULTS_NEED_FULL: Record<RunTransport, string> = {
  cli: "--include-defaults needs --mode full (see `rcd resolved --help`)",
  mcp: 'includeDefaults needs mode "full"',
};

const NEEDS_RESOLUTION: Record<RunTransport, string> = {
  cli: "this document needs a completed preset resolution — see `rcd validate` for why it stopped",
  mcp: "this document needs a completed preset resolution — validate the config",
};

export function askResolved(result: TraceResult, question: ResolvedQuestion): ResolvedAnswer {
  const { mode, includeDefaults, transport } = question;
  if (includeDefaults && mode !== "full") {
    throw new CliError(DEFAULTS_NEED_FULL[transport]);
  }
  const output = computeResolvedConfig(result, mode, { includeDefaults });
  if (!output) {
    throw new CliError(NEEDS_RESOLUTION[transport]);
  }
  return { mode, includeDefaults, output };
}
