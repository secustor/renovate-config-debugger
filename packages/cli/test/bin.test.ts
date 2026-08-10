import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { fixture } from "../src/test-harness";

/**
 * The bin itself, as a real subprocess.
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
 */

const BIN = fileURLToPath(new URL("../bin/rcd.mjs", import.meta.url));
const CLI_DIR = fileURLToPath(new URL("..", import.meta.url));

// The bin hands the REAL environment to `main` — tokens, and env markers like
// Claude Code's — so the child gets a copy with those signals stripped. The
// assertions must not depend on the session that happens to run the suite.
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

function runBin(args: string[], stdin = ""): Promise<BinRun> {
  return new Promise<BinRun>((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [BIN, ...args],
      // `--select final` prints Renovate's whole effective config; the default
      // 1 MB buffer truncates it into a parse error.
      { cwd: CLI_DIR, env: CHILD_ENV, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr });
        } else if (typeof error.code === "number") {
          // The bin answers with `process.exitCode`, so every non-zero exit
          // arrives as an `Error` carrying that code — it is the answer, not
          // a failure.
          resolve({ code: error.code, stdout, stderr });
        } else {
          // No numeric code: the spawn itself failed, which no assertion here
          // is about.
          reject(error);
        }
      },
    );
    // Always closed: a command that does not read stdin would otherwise hold
    // an open pipe for the life of the child.
    child.stdin?.end(stdin);
  });
}

describe("bin/rcd.mjs", () => {
  test("--help writes the command list to stdout and exits 0", async () => {
    const run = await runBin(["--help"]);
    expect(run.code).toBe(0);
    expect(run.stderr).toBe("");
    for (const name of ["validate", "digest", "run", "simulate", "compare", "docs"]) {
      expect(run.stdout).toContain(name);
    }
  });

  test("a clean config exits 0 and stdout is one JSON document", async () => {
    const run = await runBin(["digest", fixture("clean.json"), "--format", "json"]);
    expect(run.code).toBe(0);
    const digest = JSON.parse(run.stdout) as { digest: string; accepted: boolean };
    expect(digest.accepted).toBe(true);
    expect(digest.digest).toContain("Renovate accepted this config");
  });

  test("a config Renovate would refuse exits 2, with the report still on stdout", async () => {
    const run = await runBin(["validate", fixture("invalid.json"), "--format", "json"]);
    expect(run.code).toBe(2);
    expect(JSON.parse(run.stdout)).toMatchObject({ accepted: false });
  });

  test("the config can come from the process's own stdin", async () => {
    const run = await runBin(
      ["run", "--stdin", "--format", "json", "--select", "final"],
      '{"labels":["from-stdin"]}',
    );
    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as { finalConfig: { labels: string[] } };
    expect(result.finalConfig.labels).toEqual(["from-stdin"]);
  });

  test("a JSON document larger than the pipe buffer survives the pipe", async () => {
    // `config:recommended` resolved is ~300 KB, so the answer outgrows the
    // 64 KB a pipe holds and stdout finishes writing asynchronously. Exiting
    // on the exit code rather than waiting for the loop used to drop the rest
    // and still report success.
    const run = await runBin(
      ["run", "--stdin", "--select", "final", "--format", "json"],
      '{"extends":["config:recommended"]}',
    );
    expect(run.code).toBe(0);
    expect(run.stdout.length).toBeGreaterThan(64 * 1024);
    const result = JSON.parse(run.stdout) as { finalConfig: { extends?: string[] } };
    expect(result.finalConfig).toBeTypeOf("object");
  }, 120_000);
});
