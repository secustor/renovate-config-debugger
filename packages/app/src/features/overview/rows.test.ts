import { describe, expect, test } from "vitest";
import type { DescriptionProvenance, ProvenanceLayer } from "@renovate-config-debugger/engine";
import { buildDescriptionDigest } from "@/lib/description-digest";
import { overviewRows } from "./rows";

/**
 * Roadmap 083: the flattening, and the one thing it decides — what the card's
 * count means. Everything else about the model is 069's and tested there
 * (`lib/description-digest.test.ts`).
 */

const REPO: ProvenanceLayer = { kind: "repo" };
const RECOMMENDED: ProvenanceLayer = {
  kind: "preset",
  nodeId: "p1",
  name: "config:recommended",
};
const DASHBOARD: ProvenanceLayer = {
  kind: "preset",
  nodeId: "p2",
  name: ":dependencyDashboard",
};

function provenance(partial: Partial<DescriptionProvenance>): DescriptionProvenance {
  return {
    entries: [],
    ruleDescriptions: [],
    dropped: [],
    unattributed: [],
    degraded: false,
    finalLength: 0,
    ...partial,
  };
}

function rowsOf(partial: Partial<DescriptionProvenance>, rules?: readonly unknown[]) {
  const digest = buildDescriptionDigest(provenance(partial), rules ?? null);
  if (!digest) {
    throw new Error("expected a digest");
  }
  return overviewRows(digest);
}

test("a sentence a later extend repeats is listed once", () => {
  // 069's digest keeps the repeat — its groups are per-extend, and "this extend
  // added nothing new" is a fact it exists to report. Grouped by TOPIC there is
  // no such fact left to state, and the same sentence twice under one heading
  // is the noise this tab removes. `show raw order` is the way to the array as
  // Renovate built it, repeats included.
  const rows = rowsOf({
    entries: [
      { index: 0, value: "Enable Renovate Dependency Dashboard creation.", viaTopLevel: DASHBOARD },
      {
        index: 1,
        value: "Enable Renovate Dependency Dashboard creation.",
        viaTopLevel: RECOMMENDED,
        duplicateOfIndex: 0,
      },
    ],
    finalLength: 2,
  });
  expect(rows.map((row) => row.text)).toEqual(["Enable Renovate Dependency Dashboard creation."]);
  expect(rows[0]?.layer).toBe(DASHBOARD);
});

test("the rows arrive in Renovate's merge order, the repo's own last", () => {
  const rows = rowsOf({
    entries: [
      { index: 0, value: "From the preset.", viaTopLevel: RECOMMENDED },
      { index: 1, value: "From me.", viaTopLevel: REPO },
    ],
    finalLength: 2,
  });
  expect(rows.map((row) => row.text)).toEqual(["From the preset.", "From me."]);
});

describe("the repo's own packageRules prose", () => {
  const RULES = [{ matchUpdateTypes: ["major"], minimumReleaseAge: "14 days" }];
  const RULE_PROVENANCE = {
    ruleDescriptions: [
      {
        ruleIndex: 0,
        sourceIndex: 0,
        values: ["Slow down risky major updates"],
        layer: REPO,
      },
    ],
  };

  test("is a row like any other, carrying its citation as the note", () => {
    const rows = rowsOf(RULE_PROVENANCE, RULES);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe("Slow down risky major updates");
    expect(rows[0]?.layer).toBe(REPO);
    // Cited by the index in the READER's config, which is the one they can find
    // in their editor — presets merge ahead of the repo.
    expect(rows[0]?.note).toBe("packageRules[0] — matchUpdateTypes → minimumReleaseAge");
  });

  test("counts toward the card's total, unlike `totals.behaviors`", () => {
    // `totals.behaviors` counts the top-level array only — a rule description
    // never enters it, because Renovate does not hoist one. The card lists both,
    // so the number it prints has to be the rows it printed.
    const digest = buildDescriptionDigest(provenance(RULE_PROVENANCE), RULES);
    expect(digest?.totals.behaviors).toBe(0);
    expect(rowsOf(RULE_PROVENANCE, RULES)).toHaveLength(1);
  });
});

test("an approximate attribution survives the flattening", () => {
  const rows = rowsOf({
    entries: [
      {
        index: 0,
        value: "Pin Docker digests.",
        viaTopLevel: RECOMMENDED,
        node: { nodeId: "p9", name: "docker:pinDigests" },
        approximate: true,
      },
    ],
    degraded: true,
    finalLength: 1,
  });
  expect(rows[0]?.approximate).toBe(true);
  expect(rows[0]?.node?.name).toBe("docker:pinDigests");
});
