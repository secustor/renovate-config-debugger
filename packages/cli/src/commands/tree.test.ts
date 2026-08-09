import { describe, expect, test } from "vitest";
import { main } from "../main";
import { fixture, recordingIo } from "../test-harness";

describe("tree", () => {
  test("structure and stats, no bodies", async () => {
    const io = recordingIo();
    expect(await main(["tree", fixture("clean.json"), "--format", "json"], io)).toBe(0);
    const tree = io.json() as {
      summary: { resolved: number };
      root: { children: { name: string; ownOptions: number }[] };
    };
    expect(tree.summary.resolved).toBe(1);
    expect(tree.root.children[0]?.name).toBe(":dependencyDashboard");
    expect(JSON.stringify(tree)).not.toContain("dependencyDashboardTitle");
  });

  test("--node --body is how a body is asked for", async () => {
    const io = recordingIo();
    expect(
      await main(
        [
          "tree",
          fixture("clean.json"),
          "--node",
          ":dependencyDashboard",
          "--body",
          "input",
          "--format",
          "json",
        ],
        io,
      ),
    ).toBe(0);
    const node = io.json() as { body: string; input: { dependencyDashboard: boolean } };
    expect(node.body).toBe("input");
    expect(node.input.dependencyDashboard).toBe(true);
  });

  test("--body without --node is refused", async () => {
    const io = recordingIo();
    expect(await main(["tree", fixture("clean.json"), "--body", "input"], io)).toBe(1);
    expect(io.stderr).toContain("one node at a time");
  });
});
