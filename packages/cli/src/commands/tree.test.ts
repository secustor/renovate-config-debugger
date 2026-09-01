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

  test("--node --body on a body the node never held says so", async () => {
    const run = await runJson<{ body: string; afterParams: unknown; note: string }>([
      "tree",
      fixture("clean.json"),
      "--node",
      ":dependencyDashboard",
      "--body",
      "afterParams",
      "--format",
      "json",
    ]);
    expect(run.code).toBe(0);
    expect(run.payload.body).toBe("afterParams");
    expect(run.payload.afterParams).toBeNull();
    expect(run.payload.note).toContain("no `afterParams` body");

    const pretty = await runCli([
      "tree",
      fixture("clean.json"),
      "--node",
      ":dependencyDashboard",
      "--body",
      "afterParams",
    ]);
    expect(pretty.stdout).toContain("afterParams:\nthis node has no");
  });

  test("--node prints --depth levels BELOW the queried node", async () => {
    // Regression: the --node branch passed viewOf an ABSOLUTE depth limit, so
    // any node at or below --depth (default 2) reported zero children.
    // `group:monorepos` sits at depth 2 with grandchildren at depth 4.
    type Child = { name: string; children?: Child[]; childrenOmitted?: number };
    const query = ["tree", "--stdin", "--node", "group:monorepos", "--format", "json"];
    const stdin = { stdin: '{"extends":["config:recommended"]}' };

    const deep = await runJson<{ node: { children?: Child[] } }>(query, stdin);
    expect(deep.code).toBe(0);
    const grandparents = (deep.payload.node.children ?? []).filter(
      (c) => (c.children ?? []).length > 0,
    );
    expect(grandparents.length).toBeGreaterThan(0);

    const shallow = await runJson<{ node: { children?: Child[] } }>(
      [...query, "--depth", "1"],
      stdin,
    );
    expect(shallow.code).toBe(0);
    const cut = shallow.payload.node.children ?? [];
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every((c) => c.children === undefined)).toBe(true);
    expect(cut.some((c) => (c.childrenOmitted ?? 0) > 0)).toBe(true);
  });

  test("--body without --node is refused", async () => {
    const run = await runCli(["tree", fixture("clean.json"), "--body", "input"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("one node at a time");
  });
});
