import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { fixture } from "../src/test-harness";
import { CHILD_ENV, CLI_DIR, MCP_TOOL_NAMES, mcpSession, runBin } from "./bin-harness";

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
 * The PUBLISHED bin has its own suite (`published-bin.test.ts`) against the
 * same harness — it needs `dist/main.js`, so it runs in the `bundle` project,
 * after the build, rather than here.
 */

const BIN = fileURLToPath(new URL("../bin/rcd-dev.mjs", import.meta.url));

describe("bin/rcd-dev.mjs", () => {
  test("--help writes the command list to stdout and exits 0", async () => {
    const run = await runBin(BIN, ["--help"]);
    expect(run.code).toBe(0);
    expect(run.stderr).toBe("");
    for (const name of ["validate", "digest", "run", "simulate", "compare", "docs"]) {
      expect(run.stdout).toContain(name);
    }
  });

  test("a clean config exits 0 and stdout is one JSON document", async () => {
    const run = await runBin(BIN, ["digest", fixture("clean.json"), "--format", "json"]);
    expect(run.code).toBe(0);
    const digest = JSON.parse(run.stdout) as { digest: string; accepted: boolean };
    expect(digest.accepted).toBe(true);
    expect(digest.digest).toContain("Renovate accepted this config");
  });

  test("a config Renovate would refuse exits 2, with the report still on stdout", async () => {
    const run = await runBin(BIN, ["validate", fixture("invalid.json"), "--format", "json"]);
    expect(run.code).toBe(2);
    expect(JSON.parse(run.stdout)).toMatchObject({ accepted: false });
  });

  test("the config can come from the process's own stdin", async () => {
    const run = await runBin(
      BIN,
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
      BIN,
      ["run", "--stdin", "--select", "final", "--format", "json"],
      '{"extends":["config:recommended"]}',
    );
    expect(run.code).toBe(0);
    expect(run.stdout.length).toBeGreaterThan(64 * 1024);
    const result = JSON.parse(run.stdout) as { finalConfig: { extends?: string[] } };
    expect(result.finalConfig).toBeTypeOf("object");
  }, 120_000);

  test("a reader that stops reading does not crash the process", async () => {
    // `… | head` is the shape an agent uses to peek at a large answer. stdout
    // with no `'error'` listener turns the resulting EPIPE into an UNCAUGHT
    // exception — a stack trace and a non-zero exit for a command that did
    // nothing wrong. `bin/io.mjs` guards both streams; this is that guard.
    const pipeline = await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
      execFile(
        "bash",
        [
          "-c",
          // pipefail: without it the pipeline reports `head`'s status and a
          // crashed producer would pass unnoticed.
          `set -o pipefail; echo '{"extends":["config:recommended"]}' | node ${JSON.stringify(BIN)} run --stdin --select final --format json | head -c 100`,
        ],
        { cwd: CLI_DIR, env: CHILD_ENV },
        (error, _stdout, stderr) => {
          if (!error) {
            resolve({ code: 0, stderr });
          } else if (typeof error.code === "number") {
            resolve({ code: error.code, stderr });
          } else {
            reject(error);
          }
        },
      );
    });
    expect(pipeline.stderr).not.toMatch(/EPIPE|Unhandled 'error' event/);
    expect(pipeline.code).toBe(0);
  }, 120_000);
});

/**
 * `rcd mcp` over a real pipe. Nothing in-process can cover it: the command's
 * whole subject is stdio — the SDK owns stdout as the protocol, and the
 * session ends on an EOF only a bin can see.
 */
describe("bin/rcd-dev.mjs mcp", () => {
  test("answers JSON-RPC on stdout and exits 0 when the client disconnects", async () => {
    const session = await mcpSession(BIN);
    expect(session.messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
    expect(session.messages.filter((message) => message.error !== undefined)).toEqual([]);
    expect(session.toolsList?.result?.tools?.map((tool) => tool.name)).toEqual(MCP_TOOL_NAMES);
    expect(session.code).toBe(0);
  }, 120_000);
});
