import {
  type DependencyDescriptor,
  simulatePackageRules,
  type SimulationResult,
} from "@renovate-config-debugger/engine";
import { CliError } from "../io";
import type { RunTransport } from "../run-input";

/**
 * "Which packageRules match this update?" — behind `rcd simulate`/`compare`/
 * `group` and the MCP server's `simulate` (see `./pipeline` for this layer).
 */

/** An empty object would read as "Renovate set nothing", which is never what
 *  happened; MCP names the held run it is talking about, the CLI has none. */
const NO_FINAL_CONFIG: Record<RunTransport, (subject: string) => string> = {
  cli: () => "nothing to simulate — the run produced no effective config",
  mcp: (subject) =>
    `${subject} produced no effective config — the run stopped before the merge stage. ` +
    "Check `accepted`, `errors` and `stageStatus` from run_config.",
};

export function requireFinalConfig(
  finalConfig: Record<string, unknown> | undefined,
  transport: RunTransport,
  subject = "this run",
): Record<string, unknown> {
  if (!finalConfig) {
    throw new CliError(NO_FINAL_CONFIG[transport](subject));
  }
  return finalConfig;
}

export interface SimulationQuestion {
  finalConfig: Record<string, unknown> | undefined;
  dep: DependencyDescriptor;
  transport: RunTransport;
  /** What the "no effective config" message names — the held run id on MCP. */
  subject?: string | undefined;
  signal?: AbortSignal | undefined;
}

export function askSimulation(question: SimulationQuestion): Promise<SimulationResult> {
  const config = requireFinalConfig(question.finalConfig, question.transport, question.subject);
  return simulatePackageRules({ config, dep: question.dep }, question.signal);
}
