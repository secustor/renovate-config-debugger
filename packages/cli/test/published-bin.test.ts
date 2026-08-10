import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import { describeBinContract, runBin } from "./bin-harness";

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
 * with CI green — hence the shared contract below, `mcp` included.
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

describeBinContract("bin/rcd.mjs (published)", BIN);

describe("bin/rcd.mjs only", () => {
  test("--version answers from the bundle", async () => {
    // The dev runner reads `package.json` through Vite; this one answers from
    // whatever `vite build --ssr` baked in, which is the number consumers see.
    const run = await runBin(BIN, ["--version"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/^rcd \d+\.\d+\.\d+ \(renovate \d+\.\d+\.\d+\)/);
  });
});
