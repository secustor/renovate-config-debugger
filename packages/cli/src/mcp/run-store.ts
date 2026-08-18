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
 * Small on purpose, and measured. A `config:recommended` trace costs ~165 MB
 * of heap, so the old limit of 8 held ~1.4 GB in a long session — in a process
 * the host keeps alive for as long as the agent is working. A debugging
 * session works on one config at a time and the documented before/after oracle
 * needs two, so three is the whole requirement plus one.
 */

export interface HeldRun {
  runId: string;
  result: TraceResult;
  input: PipelineInput;
  /** Derived once per run — every tool that quotes a number reads these. */
  facts: RunFacts;
}

export const DEFAULT_RUN_LIMIT = 3;

/**
 * The held copy, without the logger shim's raw `log` events.
 *
 * Measured on a `config:recommended` run: 76.1 MB of events, 74.8 MB of it
 * `kind: "log"` — and NOTHING on the MCP path reads them. The trace's own
 * derivations index `stage-complete`, `migration-applied` and `preset-error`;
 * the preset tree, the provenance replay and the resolved-config projection
 * read no events at all. `rcd run --slice events` does print them, but that is
 * the CLI's own one-shot path, which never touches this store.
 *
 * A COPY, never a mutation: the caller still holds the result it handed over,
 * and a store is no place to decide what that caller may still look at.
 */
function heldTrace(result: TraceResult): TraceResult {
  const events = result.events.filter((event) => event.kind !== "log");
  return events.length === result.events.length ? result : { ...result, events };
}

export class RunStore {
  readonly #runs = new Map<string, HeldRun>();
  readonly #limit: number;
  #counter = 0;

  constructor(limit: number = DEFAULT_RUN_LIMIT) {
    this.#limit = limit;
  }

  put(result: TraceResult, input: PipelineInput): HeldRun {
    this.#counter += 1;
    const held = heldTrace(result);
    const run: HeldRun = {
      runId: `run-${this.#counter}`,
      result: held,
      input,
      facts: deriveRunFacts(held),
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

  /** The eviction bound, so `run_config`'s answer can state it up front —
   *  replay-04's experts each lost a runId to it and burned a call
   *  rediscovering the policy from the `get` error. */
  get limit(): number {
    return this.#limit;
  }

  /** Ids currently held, oldest first — the first is the next to be evicted. */
  heldIds(): string[] {
    return [...this.#runs.keys()];
  }
}
