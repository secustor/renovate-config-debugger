import { describe, expect, test } from "vitest";
import { groupTally, groupTallyLines } from "./group";

/**
 * Roadmap 074. Pure — no pipeline run: the tally is arithmetic over the
 * per-dependency configs the simulations already produced.
 */

function update(
  depName: string,
  updateType: string,
  config: Record<string, unknown>,
): Parameters<typeof groupTally>[0][number] {
  return { dep: { depName, updateType }, sim: { finalDependencyConfig: config } };
}

describe("groupTally", () => {
  test("members below the gate would WAIT, and the verdict says the arithmetic", () => {
    const tally = groupTally([
      update("react", "minor", { groupName: "react monorepo", minimumGroupSize: 3 }),
      update("react-dom", "minor", { groupName: "react monorepo", minimumGroupSize: 3 }),
      update("lodash", "patch", {}),
    ]);
    expect(tally.updates).toBe(3);
    expect(tally.groups).toHaveLength(1);
    expect(tally.groups[0]).toMatchObject({
      groupName: "react monorepo",
      size: 2,
      minimumGroupSize: 3,
      wouldForm: false,
    });
    expect(tally.groups[0]?.verdict).toBe(
      '"react monorepo" would WAIT: 2 updates of the 3 its minimumGroupSize requires.',
    );
    expect(tally.ungrouped).toEqual([{ depName: "lodash", updateType: "patch" }]);
  });

  test("a group at its gate forms, and one without a gate says so", () => {
    const tally = groupTally([
      update("react", "minor", { groupName: "react monorepo", minimumGroupSize: 2 }),
      update("react-dom", "minor", { groupName: "react monorepo", minimumGroupSize: 2 }),
      update("chalk", "patch", { groupName: "cosmetics" }),
    ]);
    expect(tally.groups[0]).toMatchObject({ size: 2, minimumGroupSize: 2, wouldForm: true });
    expect(tally.groups[0]?.verdict).toContain("meets its minimumGroupSize: 2 of 2");
    expect(tally.groups[1]).toMatchObject({
      groupName: "cosmetics",
      minimumGroupSize: 1,
      wouldForm: true,
    });
    expect(tally.groups[1]?.verdict).toContain("no minimumGroupSize gate");
  });

  /** Rule-scoped `minimumGroupSize` can hand members of ONE group different
   *  values; inside Renovate the effective gate is then ordering-dependent, so
   *  the tally takes the conservative one and names the spread. */
  test("members that disagree on the gate are tallied against the largest, and named", () => {
    const tally = groupTally([
      update("a", "minor", { groupName: "g", minimumGroupSize: 5 }),
      update("b", "minor", { groupName: "g", minimumGroupSize: 2 }),
    ]);
    expect(tally.groups[0]).toMatchObject({
      minimumGroupSize: 5,
      minimumGroupSizeValues: [2, 5],
      wouldForm: false,
    });
    expect(tally.notes.join(" ")).toContain("different minimumGroupSize values (2, 5)");
  });

  test("the scope caveat is on every answer — the tally is over the supplied list", () => {
    const tally = groupTally([
      update("a", "minor", { groupName: "g" }),
      update("b", "minor", { groupName: "g" }),
    ]);
    expect(tally.notes.join(" ")).toContain("updates YOU supplied");
    expect(tally.notes.join(" ")).toContain("separateMajorMinor");
  });

  test("groupSlug rides along when a member's config set one", () => {
    const tally = groupTally([
      update("a", "minor", { groupName: "g", groupSlug: "my-g" }),
      update("b", "minor", { groupName: "g" }),
    ]);
    expect(tally.groups[0]?.groupSlug).toBe("my-g");
  });

  test("pretty lines carry the headline, the members and the caveats", () => {
    const lines = groupTallyLines(
      groupTally([
        update("react", "minor", { groupName: "react monorepo", minimumGroupSize: 3 }),
        update("react-dom", "minor", { groupName: "react monorepo", minimumGroupSize: 3 }),
        update("lodash", "patch", {}),
      ]),
    );
    const text = lines.join("\n");
    expect(lines[0]).toBe("1 group over 3 simulated updates (1 update ungrouped).");
    expect(text).toContain('"react monorepo" would WAIT');
    expect(text).toContain("react-dom (minor)");
    expect(text).toContain("Ungrouped — each update gets its own PR:");
    expect(text).toContain("lodash (patch)");
    expect(text).toContain("updates YOU supplied");
  });
});
