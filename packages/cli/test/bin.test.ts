import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { describeBinContract, runBin } from "./bin-harness";

/**
 * The DEV bin, as a real subprocess.
 *
 * The suites colocated under `src/` call `main(argv, io)` inside vitest's own
 * module graph,
 * which leaves the entire entry point untested: booting Vite's SSR runner
 * against `vite.config.ts`, loading `src/main.ts` through it, and the process
 * wiring `src/` is forbidden to touch — argv, stdout/stderr, stdin, and the
 * exit code. Those are exactly the parts that break without a single command
 * being wrong.
 *
 * A smoke set on purpose: every case pays a fresh Vite server boot, so the
 * behavior of the commands is asserted in-process and only the seams the bin
 * owns are asserted here.
 *
 * The shared contract lives in `bin-harness.ts` and runs against the PUBLISHED
 * bin too (`published-bin.test.ts`, in the `bundle` project — it needs a
 * `dist/`). Below it, only what is true of this bin alone.
 */

const BIN = fileURLToPath(new URL("../bin/rcd-dev.mjs", import.meta.url));

describeBinContract("bin/rcd-dev.mjs", BIN);

describe("bin/rcd-dev.mjs only", () => {
  test("a JSON document larger than the pipe buffer survives the pipe", async () => {
    // `config:recommended` resolved is ~300 KB, so the answer outgrows the
    // 64 KB a pipe holds and stdout finishes writing asynchronously. Exiting
    // on the exit code rather than waiting for the loop used to drop the rest
    // and still report success.
    const run = await runBin(
      BIN,
      ["run", "--stdin", "--select", "final", "--format", "json"],
      '{"extends":["config:recommended"]}',
    );
    expect(run.code).toBe(0);
    expect(run.stdout.length).toBeGreaterThan(64 * 1024);
    const result = JSON.parse(run.stdout) as { finalConfig: { extends?: string[] } };
    expect(result.finalConfig).toBeTypeOf("object");
  }, 120_000);
});
