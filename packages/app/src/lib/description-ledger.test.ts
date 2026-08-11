import { describe, expect, test } from "vitest";
import type {
  DescriptionAttribution,
  DescriptionProvenance,
  DroppedDescription,
  ProvenanceLayer,
} from "@renovate-config-debugger/engine";
import {
  buildDescriptionLedger,
  type DescriptionLedger,
  DROPPED_COLLAPSE_AFTER,
  droppedReasonText,
  droppedSummaryText,
  duplicateNoteText,
  duplicatePillText,
  hiddenCount,
  LEDGER_COLLAPSE_AFTER,
  type LedgerGroup,
  ledgerMatchesFinalValue,
  ledgerPreviewText,
  ledgerWriterText,
  moreDroppedText,
  moreEntriesText,
  viaNoteText,
} from "./description-ledger";

/**
 * Roadmap 069 (PR 3): the blame ledger's view-model — the run grouping, the
 * collapse arithmetic and the wording of every note, over hand-built
 * provenance. The engine's own tests prove the ATTRIBUTION is right (PR 1,
 * against the real 1,088-preset tree); nothing here needs the pipeline.
 */

const REPO: ProvenanceLayer = { kind: "repo" };

function preset(nodeId: string, name = nodeId): ProvenanceLayer {
  return { kind: "preset", nodeId, name };
}

const BEST_PRACTICES = preset("n1", "config:best-practices");
const DASHBOARD = preset("n2", ":dependencyDashboard");
const MONOREPOS = preset("n3", "group:monorepos");

interface EntrySpec {
  value: string;
  via: ProvenanceLayer;
  /** The writing node's id; its name defaults to the id unless `nodeName`
   *  says otherwise (which matters wherever the id is compared to a layer's). */
  node?: string;
  nodeName?: string;
  approximate?: boolean;
}

/** Builds `entries` with the indices and duplicate markers the engine assigns. */
function entries(specs: EntrySpec[]): DescriptionAttribution[] {
  const firstByValue = new Map<string, number>();
  return specs.map((spec, index) => {
    const duplicateOfIndex = firstByValue.get(spec.value);
    if (duplicateOfIndex === undefined) {
      firstByValue.set(spec.value, index);
    }
    return {
      index,
      value: spec.value,
      viaTopLevel: spec.via,
      ...(spec.node ? { node: { nodeId: spec.node, name: spec.nodeName ?? spec.node } } : {}),
      ...(duplicateOfIndex === undefined ? {} : { duplicateOfIndex }),
      ...(spec.approximate ? { approximate: true } : {}),
    };
  });
}

function provenance(overrides: Partial<DescriptionProvenance> = {}): DescriptionProvenance {
  return { entries: [], dropped: [], ruleDescriptions: [], degraded: false, ...overrides };
}

// Throws rather than assert-and-narrow: the failure names what WAS there, and
// the file stays free of the non-null assertions the lint config bans.
function ledgerOf(p: DescriptionProvenance): DescriptionLedger {
  const ledger = buildDescriptionLedger(p);
  if (!ledger) {
    throw new Error("expected a ledger, got null");
  }
  return ledger;
}

function groupAt(ledger: DescriptionLedger, index: number): LedgerGroup {
  const group = ledger.groups[index];
  if (!group) {
    throw new Error(`no run #${index} in: ${ledger.groups.map((g) => g.key).join(", ")}`);
  }
  return group;
}

function entryAt(list: DescriptionAttribution[], index: number): DescriptionAttribution {
  const entry = list[index];
  if (!entry) {
    throw new Error(`no entry #${index} among ${list.length}`);
  }
  return entry;
}

describe("buildDescriptionLedger", () => {
  test("is null when the run has no descriptions at all", () => {
    expect(buildDescriptionLedger(provenance())).toBeNull();
  });

  test("keeps the final array's order and groups consecutive runs by top-level layer", () => {
    const ledger = ledgerOf(
      provenance({
        entries: entries([
          { value: "Dashboard.", via: BEST_PRACTICES, node: ":dependencyDashboard" },
          { value: "Pin digests.", via: BEST_PRACTICES, node: "docker:pinDigests" },
          { value: "Monorepos.", via: MONOREPOS, node: "group:monorepos" },
          { value: "My own summary.", via: REPO, node: "root" },
        ]),
      }),
    );

    expect(ledger.groups.map((group) => group.entries.length)).toEqual([2, 1, 1]);
    expect(ledger.entryCount).toBe(4);
    // Indices are the engine's — the canonical position in the final array.
    expect(groupAt(ledger, 0).entries.map((entry) => entry.index)).toEqual([0, 1]);
    expect(groupAt(ledger, 2).layer).toEqual(REPO);
  });

  test("a layer that contributes twice stays two runs", () => {
    // The interleaving is what a re-extend looks like: the duplicate arrives
    // through its own top-level entry, after the subtree that first pulled it
    // in — folding the two together would erase exactly that story.
    const ledger = ledgerOf(
      provenance({
        entries: entries([
          { value: "a", via: BEST_PRACTICES, node: "x" },
          { value: "b", via: DASHBOARD, node: "y" },
          { value: "c", via: BEST_PRACTICES, node: "z" },
        ]),
      }),
    );

    expect(ledger.groups).toHaveLength(3);
    // The runs break on the NODE, but the keys are named after the layer, with
    // an ordinal for the second run of the same name.
    expect(ledger.groups.map((group) => group.key)).toEqual([
      "preset:config:best-practices",
      "preset::dependencyDashboard",
      "preset:config:best-practices#2",
    ]);
  });

  test("run keys survive a re-run, which mints new node ids", () => {
    // The panel stays mounted while every keystroke produces a new run and
    // hands out `p1`, `p2`, … afresh — a node-id key would silently move a
    // run's "show all" state onto whichever preset inherited the id.
    const spec: EntrySpec[] = [
      { value: "a", via: preset("p1", "config:best-practices") },
      { value: "b", via: preset("p2", "group:monorepos") },
      { value: "c", via: preset("p3", "config:best-practices") },
    ];
    const first = ledgerOf(provenance({ entries: entries(spec) }));
    const rerun = ledgerOf(
      provenance({
        entries: entries([
          { value: "a", via: preset("p7", "config:best-practices") },
          { value: "b", via: preset("p8", "group:monorepos") },
          { value: "c", via: preset("p9", "config:best-practices") },
        ]),
      }),
    );

    expect(rerun.groups.map((group) => group.key)).toEqual(first.groups.map((group) => group.key));
    // …and still three runs: the repeat is the story, and the key only has to
    // be stable, not unique per node.
    expect(rerun.groups).toHaveLength(3);
  });

  test("two adjacent nodes of the same preset stay two runs", () => {
    // Name-keyed grouping would fold these into one run and erase the fact
    // that the preset was extended twice.
    const ledger = ledgerOf(
      provenance({
        entries: entries([
          { value: "a", via: preset("p1", ":dependencyDashboard") },
          { value: "a", via: preset("p2", ":dependencyDashboard") },
        ]),
      }),
    );

    expect(ledger.groups.map((group) => group.key)).toEqual([
      "preset::dependencyDashboard",
      "preset::dependencyDashboard#2",
    ]);
  });

  test("counts distinct writing presets, not strings", () => {
    const ledger = ledgerOf(
      provenance({
        entries: entries([
          { value: "a", via: BEST_PRACTICES, node: "docker:pinDigests" },
          { value: "b", via: BEST_PRACTICES, node: "docker:pinDigests" },
          { value: "c", via: BEST_PRACTICES, node: ":semanticCommits" },
          // A defaults/global/inherited string has no preset node at all…
          { value: "d", via: { kind: "defaults" } },
          // …and the repo's own sentence is written by the root config, which
          // is not a preset however much it looks like a node.
          { value: "e", via: REPO, node: "root" },
        ]),
      }),
    );

    expect(ledger.entryCount).toBe(5);
    expect(ledger.writerCount).toBe(2);
  });

  test("carries the drops and the degraded flag straight through", () => {
    const dropped: DroppedDescription[] = [
      {
        value: "Use best practices.",
        node: { nodeId: "n1", name: "config:best-practices" },
        reason: "wrapper-preset",
      },
    ];
    const ledger = ledgerOf(
      provenance({
        entries: entries([{ value: "a", via: REPO, node: "root" }]),
        dropped,
        degraded: true,
      }),
    );

    expect(ledger.dropped).toEqual(dropped);
    expect(ledger.degraded).toBe(true);
  });
});

describe("ledgerMatchesFinalValue", () => {
  const three = provenance({
    entries: entries([
      { value: "a", via: REPO, node: "root" },
      { value: "b", via: BEST_PRACTICES, node: "p1" },
      { value: "c", via: BEST_PRACTICES, node: "p1" },
    ]),
  });

  test("accepts the array the entries were attributed from", () => {
    expect(ledgerMatchesFinalValue(ledgerOf(three), ["a", "b", "c"])).toBe(true);
  });

  test("rejects a non-string member the walk never saw", () => {
    // `{"description": ["keep", 42]}` is merged by Renovate (type: array,
    // subType: string — a warning, not a refusal), but only the string is
    // attributed. Rendering the ledger would report "1 entry" over a
    // two-member array and make the 42 invisible.
    const ledger = ledgerOf(
      provenance({ entries: entries([{ value: "keep", via: REPO, node: "root" }]) }),
    );

    expect(ledgerMatchesFinalValue(ledger, ["keep", 42])).toBe(false);
    expect(ledgerMatchesFinalValue(ledger, [42, "keep"])).toBe(false);
  });

  test("rejects a length mismatch, a reordering and a non-array value", () => {
    const ledger = ledgerOf(three);

    expect(ledgerMatchesFinalValue(ledger, ["a", "b"])).toBe(false);
    expect(ledgerMatchesFinalValue(ledger, ["a", "b", "c", "d"])).toBe(false);
    expect(ledgerMatchesFinalValue(ledger, ["c", "b", "a"])).toBe(false);
    expect(ledgerMatchesFinalValue(ledger, "a b c")).toBe(false);
    expect(ledgerMatchesFinalValue(ledger, undefined)).toBe(false);
  });
});

describe("the collapsed row's cells", () => {
  test("the preview counts the strings and quotes as many as fit", () => {
    const ledger = ledgerOf(
      provenance({
        entries: entries([
          { value: "Enable Renovate Dependency Dashboard creation.", via: REPO, node: "root" },
          { value: "Pin Docker digests.", via: REPO, node: "root" },
          { value: "Ignore node_modules and various test directories.", via: REPO, node: "root" },
        ]),
      }),
    );
    const text = ledgerPreviewText(ledger);

    expect(text.startsWith('3 entries — "Enable Renovate Dependency Dashboard creation."')).toBe(
      true,
    );
    // Truncated, so the cell never becomes the wall of text the row is meant
    // to summarise.
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThan(100);
  });

  test("the truncation cuts on a character, never through one", () => {
    // A surrogate pair straddling the 80-unit cut would leave half an emoji in
    // the cell, which renders as U+FFFD.
    const split = ledgerOf(
      provenance({ entries: entries([{ value: `${"a".repeat(78)}😀tail`, via: REPO }]) }),
    );
    const whole = ledgerOf(
      provenance({ entries: entries([{ value: `${"a".repeat(77)}😀tail`, via: REPO }]) }),
    );

    // Dropped rather than halved…
    expect(ledgerPreviewText(split)).toBe(`1 entry — "${"a".repeat(78)}…`);
    expect(/[\uD800-\uDFFF]/.test(ledgerPreviewText(split))).toBe(false);
    // …and kept whole when it fits, so the back-off never eats a full one.
    expect(ledgerPreviewText(whole)).toBe(`1 entry — "${"a".repeat(77)}😀…`);
  });

  test("one string is one entry", () => {
    const ledger = ledgerOf(
      provenance({ entries: entries([{ value: "Just this.", via: REPO, node: "root" }]) }),
    );

    expect(ledgerPreviewText(ledger)).toBe('1 entry — "Just this."');
  });

  test("the origin cell counts contributing presets, and says nothing without one", () => {
    const withPresets = ledgerOf(
      provenance({
        entries: entries([
          { value: "a", via: BEST_PRACTICES, node: "p1" },
          { value: "b", via: BEST_PRACTICES, node: "p2" },
        ]),
      }),
    );
    const single = ledgerOf(
      provenance({ entries: entries([{ value: "a", via: BEST_PRACTICES, node: "p1" }]) }),
    );
    const none = ledgerOf(
      provenance({ entries: entries([{ value: "a", via: { kind: "defaults" } }]) }),
    );

    expect(ledgerWriterText(withPresets)).toBe("2 presets");
    expect(ledgerWriterText(single)).toBe("1 preset");
    expect(ledgerWriterText(none)).toBeNull();
  });
});

describe("the per-row notes", () => {
  const list = entries([
    { value: "Pin Docker digests.", via: BEST_PRACTICES, node: "docker:pinDigests" },
    {
      value: "Group known monorepo packages together.",
      via: MONOREPOS,
      node: "n3",
      nodeName: "group:monorepos",
    },
    { value: "My own summary.", via: REPO, node: "root" },
    { value: "Pin Docker digests.", via: DASHBOARD, node: "docker:pinDigests" },
  ]);

  test("names the top-level extend only when it is not the writer itself", () => {
    // Nested: written four levels down, arrived through the extend the reader
    // actually wrote — which is the line they would delete.
    expect(viaNoteText(entryAt(list, 0))).toBe("via config:best-practices");
    // The top-level extend IS the writer: repeating its name would be noise.
    expect(viaNoteText(entryAt(list, 1))).toBeUndefined();
    // Not a preset layer at all — the chip already says "repo config".
    expect(viaNoteText(entryAt(list, 2))).toBeUndefined();
  });

  test("a duplicate points at the occurrence that already said it, 1-based", () => {
    const duplicate = entryAt(list, 3);

    expect(duplicate.duplicateOfIndex).toBe(0);
    expect(duplicatePillText(duplicate)).toBe("duplicate of #1");
    expect(duplicateNoteText(duplicate)).toBe(":dependencyDashboard resolves it again");
  });

  test("a duplicate from a non-preset layer is worded for that layer", () => {
    const repoDuplicates = entries([
      { value: "a", via: BEST_PRACTICES, node: "p1" },
      { value: "a", via: REPO, node: "root" },
    ]);

    expect(duplicateNoteText(entryAt(repoDuplicates, 1))).toBe("repo config repeats it");
  });
});

describe("collapsing", () => {
  test("hides nothing until the threshold is passed, and nothing once expanded", () => {
    expect(hiddenCount(LEDGER_COLLAPSE_AFTER, LEDGER_COLLAPSE_AFTER, false)).toBe(0);
    expect(hiddenCount(LEDGER_COLLAPSE_AFTER + 3, LEDGER_COLLAPSE_AFTER, false)).toBe(3);
    expect(hiddenCount(LEDGER_COLLAPSE_AFTER + 3, LEDGER_COLLAPSE_AFTER, true)).toBe(0);
    expect(hiddenCount(2, DROPPED_COLLAPSE_AFTER, false)).toBe(0);
  });

  test("the toggle names the layer whose run it belongs to", () => {
    expect(moreEntriesText(11, BEST_PRACTICES)).toBe(
      "11 more from config:best-practices — show all",
    );
    expect(moreEntriesText(2, REPO)).toBe("2 more from repo config — show all");
    expect(moreDroppedText(129)).toBe("129 more — show all");
  });
});

describe("the dropped footer", () => {
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

  test("summarises the count", () => {
    expect(droppedSummaryText([wrapper, muted])).toBe(
      "Not included: 2 descriptions Renovate dropped",
    );
    expect(droppedSummaryText([wrapper])).toBe("Not included: 1 description Renovate dropped");
  });

  test("gives each drop rule its own human reason", () => {
    expect(droppedReasonText(wrapper)).toContain("wrapper preset");
    expect(droppedReasonText(packageList)).toContain("`matchPackageNames`");
    // The mute names the extending config, because that is the config the
    // reader can change.
    expect(droppedReasonText(muted)).toBe(
      "muted by `group:recommended` — its empty `ignoreDeps` deletes every description it extends",
    );
  });

  test("the mute is still explained when the extending node is unknown", () => {
    expect(droppedReasonText({ ...muted, droppedBy: undefined })).toContain(
      "muted by the extending config",
    );
  });
});
