import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `vitest.config.ts` assigns tests to its three projects by filename alone:
 *
 * - `src/**\/*.test.ts`            → unit      (node, no DOM, no engine)
 * - `src/**\/*.test.tsx`           → components (jsdom, NO shim plugin)
 * - `src/**\/*.shimmed.test.tsx`   → shimmed   (jsdom + the browser module graph)
 *
 * Two failure modes follow from that, both silent, both pinned here — the same
 * guard the engine package keeps for the same reason
 * (`engine/test/project-coverage.node.test.ts`):
 *
 * 1. A `.shimmed.test.ts` (no `x`) would run in "unit" — node environment,
 *    unshimmed renovate — while its name promises the opposite.
 * 2. A `.tsx` test that imports the engine as a VALUE and is not named
 *    `.shimmed.` runs in "components", where the shim plugin is absent and
 *    `renovate/dist` loads its Node-only internals instead of the shims. That
 *    is the whole reason the heavy project exists.
 */
const srcDir = dirname(fileURLToPath(import.meta.url));

const testFiles = readdirSync(srcDir, { recursive: true, encoding: "utf8" }).filter(
  (name) => name.endsWith(".test.ts") || name.endsWith(".test.tsx"),
);

/** Type-only imports are erased before a module graph exists, so they need no shims. */
const TYPE_ONLY_IMPORT = /import\s+type\s[\s\S]*?from\s+"[^"]*";/g;
const ENGINE_SPECIFIER = /from\s+"@renovate-config-debugger\/engine"/;

/** A file that mocks the barrel never loads the real one, whatever it imports. */
const ENGINE_MOCKED = /vi\.mock\(\s*"@renovate-config-debugger\/engine"/;

function loadsEngineForReal(source: string): boolean {
  return ENGINE_SPECIFIER.test(source.replace(TYPE_ONLY_IMPORT, "")) && !ENGINE_MOCKED.test(source);
}

describe("vitest project coverage", () => {
  it("the src tree actually holds tests of both kinds", () => {
    expect(testFiles.some((name) => name.endsWith(".test.tsx"))).toBe(true);
    expect(testFiles.some((name) => name.endsWith(".shimmed.test.tsx"))).toBe(true);
  });

  it("no non-tsx test claims the `.shimmed.` infix", () => {
    const misnamed = testFiles.filter((name) => name.endsWith(".shimmed.test.ts"));
    expect(misnamed).toEqual([]);
  });

  it("every test that loads the engine for real is named `.shimmed.test.tsx`", () => {
    const unshimmed = testFiles
      .filter((name) => name.endsWith(".test.tsx") && !name.endsWith(".shimmed.test.tsx"))
      .filter((name) => loadsEngineForReal(readFileSync(join(srcDir, name), "utf8")));
    expect(unshimmed).toEqual([]);
  });
});
