import { fileURLToPath } from "node:url";
import type { CliIo } from "./io";

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

export function recordingIo(options?: {
  env?: Record<string, string | undefined>;
  stdin?: string;
}): RecordingIo {
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

export function fixture(name: string): string {
  return fileURLToPath(new URL(`../test/fixtures/${name}`, import.meta.url));
}
