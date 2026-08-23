import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * vitest.config.ts assigns tests to its two projects by glob:
 * `test/*.node.test.ts` runs golden (real renovate modules) and
 * `test/*.shimmed.test.ts` runs shimmed (the browser module graph). A test
 * file matching NEITHER would run in no project and pass silently — the
 * failure mode the shimmed include list had while it was hand-maintained
 * (two files without the infix were enumerated instead of renamed). This
 * pins the naming convention the globs rely on.
 */
describe("vitest project coverage", () => {
  it("every test file matches exactly one project glob", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const unassigned = readdirSync(join(testDir))
      .filter((name) => name.endsWith(".test.ts"))
      .filter((name) => !name.endsWith(".node.test.ts") && !name.endsWith(".shimmed.test.ts"));
    expect(unassigned).toEqual([]);
  });
});
