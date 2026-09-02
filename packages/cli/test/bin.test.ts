import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { fixture } from "./harness";

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
 *
 * The dev runner is the target, not the published `bin/rcd.mjs`: that one needs
 * `dist/main.js`, which the test job never builds. So nothing here proves the
 * built artifact — its own dispatch and help live in
 * `test/bundle/cli-surface.test.ts`, which is the only regime that sees
 * `ssr.noExternal: true` output.
 */

const BIN = fileURLToPath(new URL("../bin/rcd-dev.mjs", import.meta.url));
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

describe("bin/rcd-dev.mjs", () => {
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

  test("a peer that stops reading is not a crash", async () => {
    // `rcd … | head`: the same over-64-KB answer, with the read end closed
    // mid-write. Without `bin/io.mjs`'s `guardStdio`, the failed write is an
    // uncaught exception — so the absence of the crash IS the assertion.
    const child = spawn(
      process.execPath,
      [BIN, "run", "--stdin", "--select", "final", "--format", "json"],
      { cwd: CLI_DIR, env: CHILD_ENV, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.once("data", () => child.stdout.destroy());
    child.stdin.end('{"extends":["config:recommended"]}');

    const [code] = (await once(child, "exit")) as [number | null, string | null];
    expect(code).toBe(0);
    expect(stderr).not.toContain("Unhandled 'error' event");
    expect(stderr).not.toContain("EPIPE");
  }, 120_000);
});

/**
 * `rcd mcp` over a real pipe. Nothing in-process can cover it: the command's
 * whole subject is stdio — the SDK owns stdout as the protocol, and the
 * session ends on an EOF only a bin can see.
 */

interface JsonRpcMessage {
  jsonrpc: string;
  id?: number;
  result?: { tools?: { name: string }[] };
  error?: unknown;
}

describe("bin/rcd-dev.mjs mcp", () => {
  test("answers JSON-RPC on stdout and exits 0 when the client disconnects", async () => {
    const child = spawn(process.execPath, [BIN, "mcp"], {
      cwd: CLI_DIR,
      env: CHILD_ENV,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Piped and never asserted on, but it has to be drained: a stderr nobody
    // reads fills its own pipe buffer and stalls the child.
    child.stderr.resume();

    const messages: JsonRpcMessage[] = [];
    let toolsList: JsonRpcMessage | undefined;
    const answered = new Promise<void>((resolve) => {
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        if (line.trim() === "") {
          return;
        }
        // Every line is protocol: a stray log or hint on stdout is a bug the
        // parse below is here to catch.
        const message = JSON.parse(line) as JsonRpcMessage;
        messages.push(message);
        if (message.id === 2) {
          toolsList = message;
          resolve();
        }
      });
    });

    for (const message of [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "rcd-test", version: "0" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    await answered;
    expect(messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
    expect(messages.filter((message) => message.error !== undefined)).toEqual([]);
    expect(toolsList?.result?.tools?.map((tool) => tool.name)).toEqual([
      "run_config",
      "get_final_config",
      "get_preset_tree",
      "get_preset_node",
      "get_provenance",
      "get_resolved_config",
      "simulate",
      "simulate_group",
      "compare_simulations",
      "explain_message",
      "get_option_docs",
      "extract_deps",
    ]);

    // The regression: the SDK's stdio transport ignores EOF, so the command
    // used to wait forever and Node killed the process at 13 — with the dev
    // runner's Vite teardown never reached.
    child.stdin.end();
    const [code] = (await once(child, "exit")) as [number | null, string | null];
    expect(code).toBe(0);
  }, 120_000);
});
