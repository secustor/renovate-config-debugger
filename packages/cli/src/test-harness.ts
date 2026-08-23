import { fileURLToPath } from "node:url";
import type { CliIo } from "./io";
import { main } from "./main";

/**
 * The commands are driven in-process against the same module graph the bin
 * boots, so a test asserts on the real engine's output — see
 * `vitest.config.ts`. Everything the CLI would read from the process arrives
 * through {@link CliIo}, which is exactly what makes that possible.
 */

export interface RecordingIo extends CliIo {
  stdout: string;
  stderr: string;
  /** stdout parsed as the one JSON document `--format json` promises. */
  json(): unknown;
}

export interface ProcessStub {
  env?: Record<string, string | undefined>;
  stdin?: string;
}

export function recordingIo(options?: ProcessStub): RecordingIo {
  const io: RecordingIo = {
    stdout: "",
    stderr: "",
    out(text) {
      io.stdout += text;
    },
    err(text) {
      io.stderr += text;
    },
    env: options?.env ?? {},
    readStdin: () => Promise.resolve(options?.stdin ?? ""),
    json: () => JSON.parse(io.stdout) as unknown,
  };
  return io;
}

/** What one `rcd` invocation produced: the code it exited with, and everything
 *  it wrote. */
export interface CliRun extends RecordingIo {
  /**
   * The exit code — the command's answer, not an aside: `2` means Renovate
   * would refuse the config, `1` that the question was not answered.
   */
  code: number;
}

/**
 * One invocation, end to end: argv in, exit code and captured streams out.
 *
 * Every suite here asks the same three-line question — build a recording io,
 * await `main` with it, assert on the code and then on what was written — so
 * the wiring is spelled once and a test reads as the invocation it is. It runs
 * the WHOLE CLI (dispatch, flags, the real engine), which is the point: these
 * suites exist to prove the surface a user types, not a function underneath it.
 */
export async function runCli(argv: readonly string[], process?: ProcessStub): Promise<CliRun> {
  const io = recordingIo(process);
  const code = await main([...argv], io);
  return Object.assign(io, { code });
}

/** {@link runCli}, with stdout already parsed as the one JSON document
 *  `--format json` promises — `payload` typed as the caller expects it. */
export async function runJson<Payload>(
  argv: readonly string[],
  process?: ProcessStub,
): Promise<CliRun & { payload: Payload }> {
  const run = await runCli(argv, process);
  return Object.assign(run, { payload: run.json() as Payload });
}

export function fixture(name: string): string {
  return fileURLToPath(new URL(`../test/fixtures/${name}`, import.meta.url));
}
