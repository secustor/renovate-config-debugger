import { describe, expect, test } from "vitest";
import type {
  DroppedDescription,
  DroppedDescriptionReason,
} from "@renovate-config-debugger/engine";
import { DROP_REASONS, dropReasonText } from "./drop-reasons";

/**
 * Roadmap 069: the wording of the three rules that delete a description before
 * it can merge. Shared by the Effective config's blame ledger footer (PR 3) and
 * the preset tree's per-node note (PR 4), so it is tested once, here.
 */

const wrapper: DroppedDescription = {
  value: "Use best practices.",
  node: { nodeId: "n1", name: "config:best-practices" },
  reason: "wrapper-preset",
};
const packageList: DroppedDescription = {
  value: "AWS SDK packages.",
  node: { nodeId: "n4", name: "packages:awsSdk" },
  reason: "package-list-preset",
};
const muted: DroppedDescription = {
  value: "Group Jest packages.",
  node: { nodeId: "n5", name: "group:jestPlusTypes" },
  reason: "ignore-deps-quirk",
  droppedBy: { nodeId: "n6", name: "group:recommended" },
};

describe("dropReasonText", () => {
  test("gives each drop rule its own human reason", () => {
    expect(dropReasonText(wrapper)).toContain("wrapper preset");
    expect(dropReasonText(packageList)).toContain("`matchPackageNames`");
    // The mute names the extending config, because that is the config the
    // reader can change.
    expect(dropReasonText(muted)).toBe(
      "muted by `group:recommended` — its empty `ignoreDeps` deletes every description it extends",
    );
  });

  test("the mute is still explained when the extending node is unknown", () => {
    expect(dropReasonText({ ...muted, droppedBy: undefined })).toContain(
      "muted by the extending config",
    );
  });

  test("an approximate drop hedges the preset, never the rule", () => {
    // The drop came out of a subtree that had already degraded to its enclosing
    // node (069 PR 1): what Renovate did is certain, who wrote the sentence is
    // not — so the rule stays intact and the hedge is appended, matching the
    // `≈` the row puts beside the chip.
    expect(dropReasonText({ ...wrapper, approximate: true })).toBe(
      `${dropReasonText(wrapper)}; exact preset unknown`,
    );
  });
});

test("every reason the engine can report has wording", () => {
  // The `Record<DroppedDescriptionReason, …>` makes this exhaustive at compile
  // time; this catches the runtime half — a table key that is not a reason, and
  // an empty clause that would render as a dangling em dash.
  const reasons: DroppedDescriptionReason[] = [
    "wrapper-preset",
    "package-list-preset",
    "ignore-deps-quirk",
  ];

  expect(Object.keys(DROP_REASONS).toSorted()).toEqual(reasons.toSorted());
  for (const reason of reasons) {
    const text = dropReasonText({ ...wrapper, reason });
    expect(text).toContain(" — ");
    expect(text.endsWith("—")).toBe(false);
  }
});
