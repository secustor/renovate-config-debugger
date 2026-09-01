import { describe, expect, test } from "vitest";
import { fixture, runCli, runJson } from "../../test/harness";

describe("tree", () => {
  test("structure and stats, no bodies", async () => {
    const run = await runJson<{
      summary: { resolved: number };
      root: { children: { name: string; ownOptions: number }[] };
    }>(["tree", fixture("clean.json"), "--format", "json"]);
    expect(run.code).toBe(0);
    const tree = run.payload;
    expect(tree.summary.resolved).toBe(1);
    expect(tree.root.children[0]?.name).toBe(":dependencyDashboard");
    expect(JSON.stringify(tree)).not.toContain("dependencyDashboardTitle");
  });

  test("--node --body is how a body is asked for", async () => {
    const run = await runJson<{ body: string; input: { dependencyDashboard: boolean } }>([
      "tree",
      fixture("clean.json"),
      "--node",
      ":dependencyDashboard",
      "--body",
      "input",
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    const node = run.payload;
    expect(node.body).toBe("input");
    expect(node.input.dependencyDashboard).toBe(true);
  });

  test("--body without --node is refused", async () => {
    const run = await runCli(["tree", fixture("clean.json"), "--body", "input"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("one node at a time");
  });
});
