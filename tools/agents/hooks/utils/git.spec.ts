import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWorkingSet } from "./git.ts";

/**
 * `getWorkingSet` decides whether the Stop hook runs any check at all: an empty
 * set exits the hook before lint, typecheck or a single suite (`stop-check.ts`).
 * So a change git reports must never be filtered out of it — a branch whose only
 * change is a deletion is exactly the case that would end green while red.
 */
let repo: string;

// The developer's own git config must not reach this repo: `commit.gpgsign`,
// `core.hooksPath` or `init.templateDir` would fail the setup below.
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };

function run(...args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "ignore", env });
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "rcd-working-set-"));
  run("init", "--initial-branch", "main");
  run("config", "user.email", "hooks@example.test");
  run("config", "user.name", "hooks");
  for (const name of ["kept.ts", "removed.ts", "moved.ts"]) {
    writeFileSync(join(repo, name), "export const x = 1;\n");
  }
  run("add", ".");
  run("commit", "-m", "base");
  // No origin/main and no upstream, so the base ref is HEAD and "changed"
  // narrows to "uncommitted" — the shape `getBaseRef` documents.
  run("rm", "removed.ts");
  run("mv", "moved.ts", "renamed.ts");
  writeFileSync(join(repo, "kept.ts"), "export const x = 2;\n");
  writeFileSync(join(repo, "added.ts"), "export const y = 3;\n");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("getWorkingSet", () => {
  it("reports deletions and both halves of a rename, not just added paths", async () => {
    const { files } = await getWorkingSet(repo);
    expect(files.toSorted()).toEqual([
      "added.ts",
      "kept.ts",
      "moved.ts",
      "removed.ts",
      "renamed.ts",
    ]);
  });
});
