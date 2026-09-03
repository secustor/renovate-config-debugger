import { readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * vitest.config.ts assigns tests to its two projects by glob. A test file
 * matching NEITHER would run in no project and pass silently — the failure
 * mode the shimmed include list had while it was hand-maintained (two files
 * without the infix were enumerated instead of renamed). This pins the two
 * naming conventions the globs rely on.
 *
 * - `test/*.node.test.ts` → golden (untouched renovate modules, the reference)
 * - `test/*.shimmed.test.ts` → shimmed (the browser module graph)
 * - `src/**\/*.test.ts` → golden, the colocated suites of modules that need no
 *   shims. Location, not an infix, is what assigns these, so a `.shimmed.`
 *   name under `src/` would read as shimmed and quietly run unshimmed.
 */
const engineDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function testFilesUnder(dir: string): string[] {
  return readdirSync(join(engineDir, dir), { recursive: true, encoding: "utf8" }).filter((name) =>
    name.endsWith(".test.ts"),
  );
}

describe("vitest project coverage", () => {
  it("every test file under test/ matches exactly one project glob", () => {
    const unassigned = testFilesUnder("test").filter(
      (name) => !name.endsWith(".node.test.ts") && !name.endsWith(".shimmed.test.ts"),
    );
    expect(unassigned).toEqual([]);
  });

  it("test/ stays flat — both project globs are single-level", () => {
    // `test/*.…` matches no subdirectory, so a nested suite would satisfy the
    // naming assertion above and still run in no project at all.
    const nested = testFilesUnder("test").filter((name) => name.includes(sep));
    expect(nested).toEqual([]);
  });

  it("no colocated src/ test claims an infix that would misdescribe its project", () => {
    const misnamed = testFilesUnder("src").filter(
      (name) => name.endsWith(".node.test.ts") || name.endsWith(".shimmed.test.ts"),
    );
    expect(misnamed).toEqual([]);
  });

  it("the colocated suites are actually there", () => {
    expect(testFilesUnder("src").length).toBeGreaterThan(0);
  });
});
