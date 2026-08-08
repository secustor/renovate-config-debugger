/**
 * The CLI's window onto the process, passed in from the bin rather than read
 * from globals.
 *
 * This is not ceremony: `renovateShims()` sets `define: { "process.env": "{}" }`
 * for the whole module graph (renovate's `lib/util/env` spreads `process.env`
 * at import time and would otherwise drag the real environment into a browser
 * bundle). Everything under `src/` runs INSIDE that graph, so `process.env` is
 * literally the empty object here — the tokens have to arrive as data. Stdout
 * and stdin follow the same seam, which is also what lets the tests drive
 * commands in-process and assert on what they wrote.
 */
export interface CliIo {
  /** Writes to stdout verbatim — callers supply their own newlines. */
  out(text: string): void;
  /** Writes to stderr verbatim. Diagnostics only: never the command's answer. */
  err(text: string): void;
  env: Readonly<Record<string, string | undefined>>;
  /** Reads stdin to completion (only called for `--stdin`). */
  readStdin(): Promise<string>;
}

/** Renovate accepted the config and the command answered its question. */
export const EXIT_OK = 0;
/**
 * Infrastructure error: a bad flag, an unreadable file, an unfetchable preset.
 * The question was not answered.
 */
export const EXIT_ERROR = 1;
/**
 * Renovate would refuse this config — the validate stage (or the parse before
 * it) failed. Deliberately `2`: Claude Code hooks treat exit 2 as the blocking
 * "feed stderr back to the model and fix it" signal, so `rcv validate` drops
 * straight into a Stop/PreToolUse hook with no wrapper.
 */
export const EXIT_REFUSED = 2;

/** An error whose message is meant for the user, not a stack trace. */
export class CliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number = EXIT_ERROR) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
