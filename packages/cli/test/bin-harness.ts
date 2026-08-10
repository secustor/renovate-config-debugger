import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { fixture } from "../src/test-harness";

/**
 * Driving a bin as a real subprocess — shared by both bins' suites.
 *
 * `bin.test.ts` points it at the dev runner (`bin/rcd-dev.mjs`, no build
 * needed) and `published-bin.test.ts` at the shipped one (`bin/rcd.mjs`, which
 * dispatches to `dist/main.js`). The seams are the same in both: argv,
 * stdout/stderr, stdin, the exit code — and for `mcp`, a stdio session that
 * ends on an EOF only a bin can see.
 */

export const CLI_DIR = fileURLToPath(new URL("..", import.meta.url));

// The bin hands the REAL environment to `main` — tokens, and env markers like
// Claude Code's — so the child gets a copy with those signals stripped. The
// assertions must not depend on the session that happens to run the suite.
export const CHILD_ENV: Record<string, string | undefined> = { ...process.env };
for (const key of Object.keys(CHILD_ENV)) {
  if (key === "CLAUDECODE" || key.startsWith("RCD_") || key.endsWith("_TOKEN")) {
    delete CHILD_ENV[key];
  }
}

export interface BinRun {
  code: number;
  stdout: string;
  stderr: string;
}

export function runBin(bin: string, args: string[], stdin = ""): Promise<BinRun> {
  return new Promise<BinRun>((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [bin, ...args],
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

export interface JsonRpcMessage {
  jsonrpc: string;
  id?: number;
  result?: { tools?: { name: string }[] };
  error?: unknown;
}

export interface McpSession {
  messages: JsonRpcMessage[];
  toolsList: JsonRpcMessage | undefined;
  /** The exit code after the client closes the pipe. */
  code: number | null;
  /** Everything the server wrote to stderr — diagnostics, never protocol. */
  stderr: string;
}

/** The tools `rcd mcp` serves, in order (roadmap 060). */
export const MCP_TOOL_NAMES = [
  "run_config",
  "get_final_config",
  "get_preset_tree",
  "get_preset_node",
  "get_provenance",
  "get_resolved_config",
  "simulate",
  "compare_simulations",
  "explain_message",
  "get_option_docs",
];

/**
 * One `rcd mcp` session over a real pipe: initialize, list the tools, then
 * disconnect. Returns everything the bin wrote as protocol plus how it exited.
 */
export async function mcpSession(bin: string): Promise<McpSession> {
  const child = spawn(process.execPath, [bin, "mcp"], {
    cwd: CLI_DIR,
    env: CHILD_ENV,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Drained, not discarded: a stderr nobody reads fills its own pipe buffer
  // and stalls the child — and when the server dies instead of answering, what
  // it wrote here is the whole diagnosis.
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const messages: JsonRpcMessage[] = [];
  let toolsList: JsonRpcMessage | undefined;
  const answered = new Promise<void>((resolve) => {
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      if (line.trim() === "") {
        return;
      }
      // Every line is protocol: a stray log or hint on stdout is a bug the
      // parse here is meant to catch.
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

  // Raced against the child's exit, never awaited alone: a bundle whose stdio
  // transport is broken exits WITHOUT answering, and waiting on `answered` by
  // itself turns that — the one regression this suite exists to catch — into a
  // silent two-minute timeout with no output attached. Resolving (not
  // rejecting) on exit keeps the loser of the race from becoming an unhandled
  // rejection when the server answers normally.
  const exited = once(child, "exit") as Promise<[number | null, string | null]>;
  const died = exited.then(
    ([code, signal]) =>
      `the bin exited (code ${code}, signal ${signal}) before answering tools/list.\nstderr:\n${stderr}`,
  );
  const failure = await Promise.race([answered.then(() => undefined), died]);
  if (failure !== undefined) {
    throw new Error(failure);
  }

  // The regression this covers: the SDK's stdio transport ignores EOF, so the
  // command used to wait forever and Node killed the process at 13.
  child.stdin.end();
  const [code] = await exited;
  return { messages, toolsList, code, stderr };
}

/**
 * The contract BOTH bins owe, asserted once and run against each.
 *
 * The published bin's suite exists to catch the two of them drifting apart, so
 * the assertions cannot themselves be two copies: a contract change edited in
 * one file and forgotten in the other is the drift, wearing a green tick.
 * Anything true of only one bin (the dev runner's Vite boot, the published
 * one's bundled `--version`) stays in that bin's own suite.
 */
export function describeBinContract(label: string, bin: string): void {
  describe(label, () => {
    test("--help writes the command list to stdout and exits 0", async () => {
      const run = await runBin(bin, ["--help"]);
      expect(run.code).toBe(0);
      expect(run.stderr).toBe("");
      for (const name of ["validate", "digest", "run", "simulate", "compare", "docs"]) {
        expect(run.stdout).toContain(name);
      }
    });

    test("a clean config exits 0 and stdout is one JSON document", async () => {
      const run = await runBin(bin, ["digest", fixture("clean.json"), "--format", "json"]);
      expect(run.code).toBe(0);
      const digest = JSON.parse(run.stdout) as { digest: string; accepted: boolean };
      expect(digest.accepted).toBe(true);
      expect(digest.digest).toContain("Renovate accepted this config");
    });

    test("a config Renovate would refuse exits 2, with the report still on stdout", async () => {
      const run = await runBin(bin, ["validate", fixture("invalid.json"), "--format", "json"]);
      expect(run.code).toBe(2);
      expect(JSON.parse(run.stdout)).toMatchObject({ accepted: false });
    });

    test("the config can come from the process's own stdin", async () => {
      const run = await runBin(
        bin,
        ["run", "--stdin", "--format", "json", "--select", "final"],
        '{"labels":["from-stdin"]}',
      );
      expect(run.code).toBe(0);
      const result = JSON.parse(run.stdout) as { finalConfig: { labels: string[] } };
      expect(result.finalConfig.labels).toEqual(["from-stdin"]);
    });

    test("a reader that stops reading does not crash the process", async () => {
      // `… | head` is the shape an agent uses to peek at a large answer. stdout
      // with no `'error'` listener turns the resulting EPIPE into an UNCAUGHT
      // exception — a stack trace and a non-zero exit for a command that did
      // nothing wrong. `bin/io.mjs` guards both streams; this is that guard.
      const pipeline = await runPipeline(
        // pipefail: without it the pipeline reports `head`'s status and a
        // crashed producer would pass unnoticed.
        `set -o pipefail; echo '{"extends":["config:recommended"]}' | node ${JSON.stringify(bin)} run --stdin --select final --format json | head -c 100`,
      );
      expect(pipeline.stderr).not.toMatch(/EPIPE|Unhandled 'error' event/);
      expect(pipeline.code).toBe(0);
    }, 120_000);

    test("answers JSON-RPC on stdout and exits 0 when the mcp client disconnects", async () => {
      // Nothing in-process can cover this: the command's whole subject is
      // stdio — the SDK owns stdout as the protocol, and the session ends on
      // an EOF only a bin can see.
      const session = await mcpSession(bin);
      expect(session.messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
      expect(session.messages.filter((message) => message.error !== undefined)).toEqual([]);
      expect(session.toolsList?.result?.tools?.map((tool) => tool.name)).toEqual(MCP_TOOL_NAMES);
      expect(session.code).toBe(0);
    }, 120_000);
  });
}

/** One `bash -c` pipeline, for the cases whose subject is the pipe itself. */
function runPipeline(script: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("bash", ["-c", script], { cwd: CLI_DIR, env: CHILD_ENV }, (error, _stdout, stderr) => {
      if (!error) {
        resolve({ code: 0, stderr });
      } else if (typeof error.code === "number") {
        resolve({ code: error.code, stderr });
      } else {
        reject(error);
      }
    });
  });
}
