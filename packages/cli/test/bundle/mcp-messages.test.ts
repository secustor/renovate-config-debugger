import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * The validation messages the PUBLISHED bin emits, over a real pipe.
 *
 * This is the only regime that can catch the failure it pins. zod declares
 * `"sideEffects": false` while installing its English locale as a top-level
 * side effect, so rolldown — building this package with `ssr.noExternal: true`
 * — drops the call, and every rejection the shipped artifact reports collapses
 * to a bare `Invalid input`: the typo'd key unnamed, the enum members unlisted,
 * the expected type gone. `src/mcp/server.test.ts` runs zod unbundled and
 * stays green throughout; `src/mcp/zod-locale.ts` is the fix.
 *
 * So the target here is `bin/rcd.mjs` (needs `dist/`, hence the `bundle`
 * project rather than `cli`), not the dev runner `test/bin.test.ts` drives.
 * One child, one handshake, every case in it: each spawn loads the whole
 * bundle.
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

interface JsonRpcMessage {
  jsonrpc: string;
  id?: number;
  result?: { content?: { type: string; text?: string }[]; isError?: boolean };
}

/** The rejection text for one bad `tools/call`, keyed by request id. */
interface BadCall {
  id: number;
  name: string;
  args: Record<string, unknown>;
}

const BAD_CALLS: BadCall[] = [
  { id: 10, name: "get_preset_tree", args: { runId: "run-1", dept: 3 } },
  { id: 11, name: "simulate", args: { runId: "run-1", dep: {}, source: "bogus" } },
  { id: 12, name: "run_config", args: { content: { extends: ["config:recommended"] } } },
];

async function rejectionTexts(): Promise<Map<number, string>> {
  const child = spawn(process.execPath, [BIN, "mcp"], {
    cwd: CLI_DIR,
    env: CHILD_ENV,
    stdio: ["pipe", "pipe", "pipe"],
  });
  // A stderr nobody reads fills its pipe buffer and stalls the child.
  child.stderr.resume();

  const texts = new Map<number, string>();
  const answered = new Promise<void>((resolve) => {
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      if (line.trim() === "") {
        return;
      }
      // Every line is protocol — a stray log on stdout is a bug this catches.
      const message = JSON.parse(line) as JsonRpcMessage;
      if (message.id === undefined || message.id < 10) {
        return;
      }
      texts.set(message.id, message.result?.content?.[0]?.text ?? "");
      if (texts.size === BAD_CALLS.length) {
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
        clientInfo: { name: "rcd-bundle-test", version: "0" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    ...BAD_CALLS.map((call) => ({
      jsonrpc: "2.0",
      id: call.id,
      method: "tools/call",
      params: { name: call.name, arguments: call.args },
    })),
  ]) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  await answered;
  child.stdin.end();
  await once(child, "exit");
  return texts;
}

describe("bin/rcd.mjs mcp", () => {
  test("a rejected argument still names the field in the built bundle", async () => {
    const texts = await rejectionTexts();
    // The typo'd tool parameter, by name.
    expect(texts.get(10)).toContain('Unrecognized key: "dept"');
    // The enum, with its members — what tells a model which value to retry.
    expect(texts.get(11)).toContain('Invalid option: expected one of "all"');
    // The commonest mistake of all: `content` is the file's TEXT.
    expect(texts.get(12)).toContain("expected string, received object");
  }, 120_000);
});
