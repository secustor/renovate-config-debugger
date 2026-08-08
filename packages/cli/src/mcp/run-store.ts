import type { PipelineInput, TraceResult } from "@renovate-config-debugger/engine";
import type { RunFacts } from "@renovate-config-debugger/app/headless";
import { deriveRunFacts } from "@renovate-config-debugger/app/headless";
import { CliError } from "../io";

/**
 * Roadmap 060: the runs the server is holding.
 *
 * Handles, not payloads. A full trace for `config:recommended` is over a
 * thousand nodes with four config bodies each; `run_config` returns a summary
 * and a `runId`, and the drill-down tools query the trace that stays here.
 * That is the web app's progressive disclosure, as tool calls — and it buys
 * run CONSISTENCY as well as size: two `rcd` invocations can describe
 * different worlds if a remote preset changed between them, two `{runId}`
 * lookups cannot.
 *
 * Small on purpose. A debugging session works on one config at a time; the
 * older entries exist so an agent can compare the run before its edit with the
 * run after it.
 */

export interface HeldRun {
  runId: string;
  result: TraceResult;
  input: PipelineInput;
  /** Derived once per run — every tool that quotes a number reads these. */
  facts: RunFacts;
}

export const DEFAULT_RUN_LIMIT = 8;

export class RunStore {
  readonly #runs = new Map<string, HeldRun>();
  readonly #limit: number;
  #counter = 0;

  constructor(limit: number = DEFAULT_RUN_LIMIT) {
    this.#limit = limit;
  }

  put(result: TraceResult, input: PipelineInput): HeldRun {
    this.#counter += 1;
    const run: HeldRun = {
      runId: `run-${this.#counter}`,
      result,
      input,
      facts: deriveRunFacts(result),
    };
    this.#runs.set(run.runId, run);
    // Map iterates in insertion order, so the first key is the oldest.
    while (this.#runs.size > this.#limit) {
      const oldest = this.#runs.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.#runs.delete(oldest);
    }
    return run;
  }

  /** Throws with the ids still held — an expired handle is a common, and
   *  entirely recoverable, mistake for an agent to make. */
  get(runId: string): HeldRun {
    const run = this.#runs.get(runId);
    if (!run) {
      const held = [...this.#runs.keys()];
      throw new CliError(
        `no run "${runId}" — it has been evicted or never existed. ` +
          (held.length > 0
            ? `Currently held: ${held.join(", ")}. Call run_config again.`
            : "Call run_config first."),
      );
    }
    // Refresh recency so the run an agent keeps drilling into is never the one
    // evicted next.
    this.#runs.delete(runId);
    this.#runs.set(runId, run);
    return run;
  }

  get size(): number {
    return this.#runs.size;
  }
}
