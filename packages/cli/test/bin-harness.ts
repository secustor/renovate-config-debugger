import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

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

  await answered;

  // The regression this covers: the SDK's stdio transport ignores EOF, so the
  // command used to wait forever and Node killed the process at 13.
  child.stdin.end();
  const [code] = (await once(child, "exit")) as [number | null, string | null];
  return { messages, toolsList, code };
}
