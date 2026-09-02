import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Dispatch and help, from the PUBLISHED bin.
 *
 * This is the only regime that sees `ssr.noExternal: true` output, so it is the
 * only one that can catch a divergence the inlining introduces: commander reads
 * `stripVTControlCharacters` from `node:util`, which the shim plugin answers
 * with `packages/engine/src/shims/node-util-stub.cjs` in the build pipeline
 * too — a missing export there turns every help screen into a crash while
 * `test/bin.test.ts` (the dev runner, unbundled) stays green.
 *
 * Cheap enough for a child per case: no command here resolves a preset.
 */

const BIN = fileURLToPath(new URL("../../bin/rcd.mjs", import.meta.url));
const CLI_DIR = fileURLToPath(new URL("../..", import.meta.url));

// Same reason as `test/bin.test.ts`: the bin hands the REAL environment to
// `main`, and no assertion may depend on the session that runs the suite.
const CHILD_ENV: Record<string, string | undefined> = { ...process.env };
for (const key of Object.keys(CHILD_ENV)) {
  if (key === "CLAUDECODE" || key.startsWith("RCD_") || key.endsWith("_TOKEN")) {
    delete CHILD_ENV[key];
  }
}

interface BinRun {
  code: number;
  stdout: string;
  stderr: string;
}

function runBin(args: string[]): Promise<BinRun> {
  return new Promise<BinRun>((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [BIN, ...args],
      { cwd: CLI_DIR, env: CHILD_ENV, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr });
        } else if (typeof error.code === "number") {
          resolve({ code: error.code, stdout, stderr });
        } else {
          reject(error);
        }
      },
    );
    child.stdin?.end("");
  });
}

const COMMANDS = ["validate", "digest", "run", "simulate", "compare", "docs"];

describe("bin/rcd.mjs", () => {
  test("--help writes the command list to stdout and exits 0", async () => {
    const run = await runBin(["--help"]);
    expect(run.code).toBe(0);
    expect(run.stderr).toBe("");
    for (const name of COMMANDS) {
      expect(run.stdout).toContain(name);
    }
  }, 60_000);

  test("no arguments prints the same command list rather than crashing", async () => {
    const run = await runBin([]);
    expect(run.code).toBe(0);
    for (const name of COMMANDS) {
      expect(run.stdout).toContain(name);
    }
  }, 60_000);

  test("a subcommand's own --help exits 0", async () => {
    const run = await runBin(["digest", "--help"]);
    expect(run.code).toBe(0);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("digest");
  }, 60_000);
});
