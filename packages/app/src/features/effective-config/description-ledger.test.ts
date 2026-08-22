import { describe, expect, test } from "vitest";
import type {
  DescriptionAttribution,
  DescriptionProvenance,
  DroppedDescription,
  ProvenanceLayer,
  UnattributedDescription,
} from "@renovate-config-debugger/engine";
import {
  buildDescriptionLedger,
  type DescriptionLedger,
  DROPPED_COLLAPSE_AFTER,
  droppedSummaryText,
  duplicateNoteText,
  duplicatePillText,
  hiddenCount,
  LEDGER_COLLAPSE_AFTER,
  ledgerCountText,
  type LedgerGroup,
  ledgerMatchesFinalValue,
  ledgerPreviewText,
  ledgerRevealText,
  type LedgerRow,
  ledgerView,
  ledgerWriterText,
  unattributedNoteText,
  unattributedValueText,
  viaNoteRef,
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

/** Builds `entries` with the indices and duplicate markers the engine assigns.
 *  `startAt` shifts the first index, for the arrays whose earlier positions are
 *  held by non-string members. */
function entries(specs: EntrySpec[], startAt = 0): DescriptionAttribution[] {
  const firstByValue = new Map<string, number>();
  return specs.map((spec, offset) => {
    const index = startAt + offset;
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
  const merged: DescriptionProvenance = {
    entries: [],
    unattributed: [],
    finalLength: 0,
    dropped: [],
    ruleDescriptions: [],
    degraded: false,
    ...overrides,
  };
  // The engine's own invariant (069 PR 1), so no test can build a provenance
  // that could not have come out of a run.
  return overrides.finalLength === undefined
    ? { ...merged, finalLength: merged.entries.length + merged.unattributed.length }
    : merged;
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

/** Every row of every run, in the order the ledger renders them. */
function allRows(ledger: DescriptionLedger): LedgerRow[] {
  return ledger.groups.flatMap((group) => group.rows);
}

describe("buildDescriptionLedger", () => {
  test("is null when the run has no attributed string at all", () => {
    expect(buildDescriptionLedger(provenance())).toBeNull();
    // `{"description": [42]}` is that same empty state: there is no prose to
    // blame anyone for, so the row keeps the generic chain.
    expect(
      buildDescriptionLedger(provenance({ unattributed: [{ index: 0, value: 42 }] })),
    ).toBeNull();
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

    expect(ledger.groups.map((group) => group.rows.length)).toEqual([2, 1, 1]);
    expect(ledger.entryCount).toBe(4);
    expect(ledger.finalLength).toBe(4);
    // Indices are the engine's — the canonical position in the final array.
    expect(groupAt(ledger, 0).rows.map((row) => row.index)).toEqual([0, 1]);
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
    // an ordinal for the second run of the same name (`stableLayerKey`, whose
    // separator is U+241F — a character no preset name can contain).
    expect(ledger.groups.map((group) => group.key)).toEqual([
      "preset:config:best-practices",
      "preset::dependencyDashboard",
      "preset:config:best-practices␟2",
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
      "preset::dependencyDashboard␟2",
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

/**
 * `description` is `type: array, subType: string`, but a wrong-typed member is
 * a validation WARNING: `{"description": ["keep", 42]}` merges and the `42`
 * holds index 1. The ledger claims to be the final array with the authorship
 * put back, so it has to carry a line for that member too — the alternative is
 * an array rendered one member shorter than the "Final value" above it.
 */
describe("members that are not text", () => {
  const mixed = provenance({
    entries: entries(
      [
        { value: "Keep this.", via: REPO, node: "root" },
        { value: "And this.", via: REPO, node: "root" },
      ],
      1,
    ),
    unattributed: [
      { index: 0, value: 42 },
      { index: 3, value: { nested: true } },
    ],
    finalLength: 4,
  });

  test("every index of the final array gets exactly one row, in order", () => {
    const rows = allRows(ledgerOf(mixed));

    expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3]);
    expect(rows.map((row) => row.kind)).toEqual(["unattributed", "entry", "entry", "unattributed"]);
  });

  test("they sit inline in the surrounding run rather than in a section of their own", () => {
    // The run is a visual grouping and nothing more — every row carries its own
    // source cell — so index order is worth more here than a hairline that
    // would have to mean "no layer", which is not a thing a run can say.
    const ledger = ledgerOf(mixed);

    expect(ledger.groups).toHaveLength(1);
    expect(groupAt(ledger, 0).layer).toEqual(REPO);
  });

  test("the counts keep the two kinds apart instead of summing them", () => {
    const ledger = ledgerOf(mixed);

    expect(ledger.entryCount).toBe(2);
    expect(ledger.unattributedCount).toBe(2);
    expect(ledger.finalLength).toBe(4);
    // "4 entries" would credit prose the array does not contain.
    expect(ledgerPreviewText(ledger)).toBe(
      '2 sentences + 2 other members — "Keep this.", "And this."',
    );
  });

  test("one of each is worded in the singular", () => {
    const ledger = ledgerOf(
      provenance({
        entries: entries([{ value: "Keep this.", via: REPO, node: "root" }]),
        unattributed: [{ index: 1, value: 42 }],
      }),
    );

    expect(ledgerPreviewText(ledger)).toBe('1 sentence + 1 other member — "Keep this."');
  });

  test("the row shows compact JSON and says plainly that nobody wrote it", () => {
    expect(unattributedValueText(42)).toBe("42");
    expect(unattributedValueText({ a: 1 })).toBe('{"a":1}');
    expect(unattributedValueText(null)).toBe("null");
    // `undefined` has no JSON form at all — printed rather than dropped.
    expect(unattributedValueText(undefined)).toBe("undefined");
    // …and truncated, so a 4 KB object cannot become the ledger.
    expect(unattributedValueText({ long: "x".repeat(200) }).length).toBeLessThan(70);
    expect(unattributedNoteText()).toBe(
      "not text — Renovate accepted it, but no preset can be credited",
    );
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

  test("accepts a mixed array, non-string member included", () => {
    const member: UnattributedDescription = { index: 1, value: { keep: true } };
    const ledger = ledgerOf(
      provenance({
        entries: entries([{ value: "keep", via: REPO, node: "root" }]),
        unattributed: [member],
      }),
    );

    // The member is compared by identity — it IS the object the engine took out
    // of this array…
    expect(ledgerMatchesFinalValue(ledger, ["keep", member.value])).toBe(true);
    // …so a structurally equal stand-in is not the same array.
    expect(ledgerMatchesFinalValue(ledger, ["keep", { keep: true }])).toBe(false);
    // …and a member that moved is a different array too.
    expect(ledgerMatchesFinalValue(ledger, [member.value, "keep"])).toBe(false);
  });

  test("rejects a length mismatch, a reordering and a non-array value", () => {
    const ledger = ledgerOf(three);

    expect(ledgerMatchesFinalValue(ledger, ["a", "b"])).toBe(false);
    expect(ledgerMatchesFinalValue(ledger, ["a", "b", "c", "d"])).toBe(false);
    expect(ledgerMatchesFinalValue(ledger, ["c", "b", "a"])).toBe(false);
    expect(ledgerMatchesFinalValue(ledger, "a b c")).toBe(false);
    expect(ledgerMatchesFinalValue(ledger, undefined)).toBe(false);
  });

  test("rejects a ledger whose rows do not cover the array", () => {
    // The genuine-mismatch fallback the `description` row still needs: a ledger
    // claiming a length it has no rows for accounts for the array only in the
    // header, and the row hands back to the generic chain rather than print it.
    const ledger = ledgerOf(three);
    const overclaiming: DescriptionLedger = { ...ledger, finalLength: 4 };

    expect(ledgerMatchesFinalValue(overclaiming, ["a", "b", "c", "d"])).toBe(false);
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

    expect(text.startsWith('3 strings — "Enable Renovate Dependency Dashboard creation."')).toBe(
      true,
    );
    // Truncated, so the cell never becomes the wall of text the row is meant
    // to summarise — and truncated safely (see `truncate.test.ts`).
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThan(100);
    expect(
      /[\uD800-\uDFFF]/.test(
        ledgerPreviewText(
          ledgerOf(
            provenance({
              entries: entries([{ value: `${"a".repeat(78)}😀tail`, via: REPO }]),
            }),
          ),
        ),
      ),
    ).toBe(false);
  });

  /** Roadmap 082: the design's two nouns, and they are not interchangeable —
   *  the collapsed row describes a VALUE (an array of strings), the expanded
   *  ledger counts the LINES it wrote a row for. */
  test("the row counts strings, the ledger counts lines", () => {
    const ledger = ledgerOf(
      provenance({ entries: entries([{ value: "Just this.", via: REPO, node: "root" }]) }),
    );

    expect(ledgerPreviewText(ledger)).toBe('1 string — "Just this."');
    expect(ledgerCountText(ledger)).toBe("1 line");
    expect(
      ledgerCountText(
        ledgerOf(
          provenance({
            entries: entries([
              { value: "a", via: REPO, node: "root" },
              { value: "b", via: REPO, node: "root" },
            ]),
          }),
        ),
      ),
    ).toBe("2 lines");
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
    // Roadmap 081: the reference, not the sentence — the note's name is a
    // preset token, and the "via" in front of it is the component's prose.
    expect(viaNoteRef(entryAt(list, 0))?.name).toBe("config:best-practices");
    // The top-level extend IS the writer: repeating its name would be noise.
    expect(viaNoteRef(entryAt(list, 1))).toBeNull();
    // Not a preset layer at all — the chip already says "repo config".
    expect(viaNoteRef(entryAt(list, 2))).toBeNull();
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

  test("an approximate duplicate hedges instead of accusing a layer", () => {
    // The engine reached these through its enclosing-node fallback, so the
    // arrival layer is assigned rather than verified — and for a whole-run
    // fallback it is the fabricated `repo` layer, which would otherwise have
    // the reader's own config blamed for a repeat a preset caused.
    const hedged = entries([
      { value: "a", via: BEST_PRACTICES, node: "p1" },
      { value: "a", via: DASHBOARD, node: "p2", approximate: true },
      { value: "a", via: REPO, node: "root", approximate: true },
    ]);

    expect(duplicateNoteText(entryAt(hedged, 1))).toBe(
      "probably resolved again by :dependencyDashboard",
    );
    expect(duplicateNoteText(entryAt(hedged, 2))).toBe("probably repeated by repo config");
  });
});

describe("collapsing", () => {
  test("hides nothing until the threshold is passed, and nothing once expanded", () => {
    expect(hiddenCount(LEDGER_COLLAPSE_AFTER, LEDGER_COLLAPSE_AFTER, false)).toBe(0);
    expect(hiddenCount(LEDGER_COLLAPSE_AFTER + 3, LEDGER_COLLAPSE_AFTER, false)).toBe(3);
    expect(hiddenCount(LEDGER_COLLAPSE_AFTER + 3, LEDGER_COLLAPSE_AFTER, true)).toBe(0);
    expect(hiddenCount(2, DROPPED_COLLAPSE_AFTER, false)).toBe(0);
  });

  /**
   * Roadmap 082 (GAP-16): the cap is the LEDGER's, applied across the runs in
   * order, so what a collapsed ledger shows is always a prefix of the final
   * array — the one property "this is that array, with the authorship put back"
   * rests on.
   */
  test("cuts the runs at one global cap, keeping index order", () => {
    const ledger = ledgerOf(
      provenance({
        entries: entries(
          Array.from({ length: LEDGER_COLLAPSE_AFTER + 4 }, (_, i) => ({
            value: `line ${i}`,
            via: i < 2 ? REPO : BEST_PRACTICES,
            node: "p1",
          })),
        ),
      }),
    );

    const collapsed = ledgerView(ledger, false);
    expect(collapsed.groups.flatMap((g) => g.rows).length).toBe(LEDGER_COLLAPSE_AFTER);
    expect(collapsed.hiddenRows).toBe(4);
    // The first run survives whole, the second is cut — nothing is reordered.
    expect(collapsed.groups[0]?.rows).toHaveLength(2);
    expect(collapsed.groups.flatMap((g) => g.rows).map((r) => r.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);

    const revealed = ledgerView(ledger, true);
    expect(revealed.hiddenRows).toBe(0);
    expect(revealed.groups).toBe(ledger.groups);
  });

  test("closes the list with ONE sentence offering both halves", () => {
    expect(ledgerRevealText(5, 135)).toBe("5 more lines · 135 dropped before merging →");
    expect(ledgerRevealText(1, 0)).toBe("1 more line →");
    expect(ledgerRevealText(0, 1)).toBe("1 dropped before merging →");
    // Nothing held back and nothing dropped: no button at all.
    expect(ledgerRevealText(0, 0)).toBeNull();
  });
});

describe("the dropped footer", () => {
  // The wording of each drop rule lives in `drop-reasons.ts` (shared with
  // the preset tree's own note) and is tested there; this is the ledger's own
  // summary line.
  test("summarises the count", () => {
    const drop: DroppedDescription = {
      value: "Use best practices.",
      node: { nodeId: "n1", name: "config:best-practices" },
      reason: "wrapper-preset",
    };

    expect(droppedSummaryText([drop, drop])).toBe("Not included: 2 descriptions Renovate dropped");
    expect(droppedSummaryText([drop])).toBe("Not included: 1 description Renovate dropped");
  });
});
