import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import { fixture } from "../src/test-harness";
import { MCP_TOOL_NAMES, mcpSession, runBin } from "./bin-harness";

/**
 * The PUBLISHED bin — `bin/rcd.mjs` dispatching to the built `dist/main.js`,
 * which is what `pnpm dlx @renovate-config-debugger/cli …` runs.
 *
 * The `bundle` project's other suites prove the ENGINE half of that artifact
 * (the engine's shimmed snapshots, re-run against `dist/engine-surface.js`).
 * Nothing proved the other half: commander, zod, the MCP SDK and the app's
 * headless derivations, all inlined by a different bundler pass than the dev
 * runner's transform pipeline. A stdio transport that mis-interops after
 * bundling would break `claude mcp add rcd -- pnpm dlx …` for every consumer
 * with CI green — hence `mcp` here, not only in the dev bin's suite.
 *
 * It runs in the `bundle` project (after `pnpm build`), never in `cli`, for
 * the same reason the parity suites do: there is no `dist/` before the build.
 */

const BIN = fileURLToPath(new URL("../bin/rcd.mjs", import.meta.url));
const BUNDLE = fileURLToPath(new URL("../dist/main.js", import.meta.url));

beforeAll(() => {
  // Loud rather than skipped: a silent skip is how "the published bin is
  // tested" quietly stops being true.
  expect(
    existsSync(BUNDLE),
    "dist/main.js is missing — run `pnpm --filter @renovate-config-debugger/cli build` first",
  ).toBe(true);
});

describe("bin/rcd.mjs (published)", () => {
  test("--version answers from the bundle and exits 0", async () => {
    const run = await runBin(BIN, ["--version"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/^rcd \d+\.\d+\.\d+ \(renovate \d+\.\d+\.\d+\)/);
  });

  test("a clean config exits 0 and stdout is one JSON document", async () => {
    const run = await runBin(BIN, ["digest", fixture("clean.json"), "--format", "json"]);
    expect(run.code).toBe(0);
    const digest = JSON.parse(run.stdout) as { digest: string; accepted: boolean };
    expect(digest.accepted).toBe(true);
  });

  test("a config Renovate would refuse exits 2", async () => {
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
});

describe("bin/rcd.mjs mcp (published)", () => {
  test("answers JSON-RPC on stdout and exits 0 when the client disconnects", async () => {
    const session = await mcpSession(BIN);
    expect(session.messages.every((message) => message.jsonrpc === "2.0")).toBe(true);
    expect(session.messages.filter((message) => message.error !== undefined)).toEqual([]);
    expect(session.toolsList?.result?.tools?.map((tool) => tool.name)).toEqual(MCP_TOOL_NAMES);
    expect(session.code).toBe(0);
  }, 120_000);
});
