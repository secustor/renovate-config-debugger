import { describe, expect, test } from "vitest";
import type {
  DescriptionAttribution,
  DescriptionProvenance,
  ProvenanceLayer,
} from "@renovate-config-debugger/engine";
import {
  buildDescriptionDigest,
  type DescriptionDigest,
  type DigestGroup,
  type DigestRule,
  hasTopLevelDescriptions,
  ruleNoteText,
  unattributedNoteText,
} from "./description-digest";
import { descriptionProvenance as provenance } from "@tools/test/description-provenance";

/** The ordinal separator `stableLayerKey` uses (U+241F). Spelled out here
 *  because a key that silently became `#`-separated again would re-open the
 *  collision the last test in "grouping" pins down. */
const SEP = "␟";

/**
 * Roadmap 069 (PR 2): the grouping and the counts, over
 * hand-built provenance. The engine's own tests prove the ATTRIBUTION is right
 * (069 PR 1, against the real 1,088-preset tree); everything here is about what
 * the card makes of it, so nothing needs the real pipeline.
 */

const REPO: ProvenanceLayer = { kind: "repo" };

function preset(nodeId: string, name = nodeId): ProvenanceLayer {
  return { kind: "preset", nodeId, name };
}

interface EntrySpec {
  value: string;
  via: ProvenanceLayer;
  node?: string;
  approximate?: boolean;
}

/** Builds `entries` with the indices and duplicate markers the engine would
 *  assign, from a compact per-entry spec. */
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
      ...(spec.node ? { node: { nodeId: spec.node, name: spec.node } } : {}),
      ...(duplicateOfIndex === undefined ? {} : { duplicateOfIndex }),
      ...(spec.approximate ? { approximate: true } : {}),
    };
  });
}

// The three lookups below throw rather than assert-and-narrow: that fails the
// test with a message naming what WAS there, and keeps the file free of the
// non-null assertions the lint config bans.
function digestOf(p: DescriptionProvenance, rules?: readonly unknown[] | null): DescriptionDigest {
  const digest = buildDescriptionDigest(p, rules);
  if (!digest) {
    throw new Error("expected a digest, got null");
  }
  return digest;
}

function groupAt(digest: DescriptionDigest, index: number): DigestGroup {
  const group = digest.groups[index];
  if (!group) {
    throw new Error(`no group #${index} in: ${digest.groups.map((g) => g.key).join(", ")}`);
  }
  return group;
}

function ruleAt(group: DigestGroup, index: number): DigestRule {
  const rule = group.rules[index];
  if (!rule) {
    throw new Error(`group ${group.key} has ${group.rules.length} rules, not ${index + 1}`);
  }
  return rule;
}

const BEST_PRACTICES = preset("n1", "config:best-practices");
const DASHBOARD = preset("n2", ":dependencyDashboard");
const MONOREPOS = preset("n3", "group:monorepos");

describe("grouping", () => {
  test("groups by the top-level layer, in merge order, keeping array order inside", () => {
    const digest = digestOf(
      provenance({
        entries: entries([
          { value: "Dashboard.", via: BEST_PRACTICES, node: ":dependencyDashboard" },
          { value: "Pin Docker digests.", via: BEST_PRACTICES, node: "docker:pinDigests" },
          { value: "Group monorepos.", via: MONOREPOS, node: "group:monorepos" },
          { value: "My own note.", via: REPO, node: "root" },
        ]),
      }),
    );

    expect(digest.groups.map((g) => g.key)).toEqual([
      "preset:config:best-practices",
      "preset:group:monorepos",
      "repo",
    ]);
    expect(groupAt(digest, 0).entries.map((e) => e.value)).toEqual([
      "Dashboard.",
      "Pin Docker digests.",
    ]);
    expect(groupAt(digest, 0).entries[1]?.node).toEqual({
      nodeId: "docker:pinDigests",
      name: "docker:pinDigests",
    });
  });

  test("the same preset extended twice stays two groups", () => {
    // The whole point of GROUPING on the node: a name-keyed grouping would
    // conflate these, and "you extended it twice" is exactly what the card must
    // be able to say. The React keys stay distinct via the ordinal.
    const digest = digestOf(
      provenance({
        entries: entries([
          { value: "Dashboard.", via: preset("a", ":dependencyDashboard") },
          { value: "Dashboard.", via: preset("b", ":dependencyDashboard") },
        ]),
      }),
    );

    expect(digest.groups).toHaveLength(2);
    expect(digest.groups.map((g) => g.key)).toEqual([
      "preset::dependencyDashboard",
      `preset::dependencyDashboard${SEP}2`,
    ]);
  });

  test("a preset named like an ordinal does not collide with a repeated extend", () => {
    // `foo#2` is a legal preset name, and the ordinal used to be spelled `#2` —
    // so the SECOND `foo` and the preset literally called `foo#2` both keyed on
    // `preset:foo#2`, and React would have reconciled one group's expansion
    // state onto the other. The separator is now a character no preset name can
    // contain.
    const digest = digestOf(
      provenance({
        entries: entries([
          { value: "First foo.", via: preset("a", "foo") },
          { value: "The other preset.", via: preset("b", "foo#2") },
          { value: "Second foo.", via: preset("c", "foo") },
        ]),
      }),
    );

    const keys = digest.groups.map((g) => g.key);
    expect(new Set(keys).size).toBe(3);
    expect(keys).toEqual(["preset:foo", "preset:foo#2", `preset:foo${SEP}2`]);
  });

  test("group keys survive a re-run, which mints new node ids", () => {
    // The card stays mounted across runs while `p1`, `p2`, … are handed out
    // afresh — a node-id key would silently move a group's "show all" state
    // onto whichever preset inherited the id.
    const spec: EntrySpec[] = [
      { value: "Dashboard.", via: preset("p1", ":dependencyDashboard") },
      { value: "Group monorepos.", via: preset("p2", "group:monorepos") },
    ];
    const first = digestOf(provenance({ entries: entries(spec) }));
    const rerun = digestOf(
      provenance({
        entries: entries([
          { value: "Dashboard.", via: preset("p7", ":dependencyDashboard") },
          { value: "Group monorepos.", via: preset("p9", "group:monorepos") },
        ]),
      }),
    );

    expect(rerun.groups.map((g) => g.key)).toEqual(first.groups.map((g) => g.key));
  });

  test("entries keep the index, duplicate marker and approximate flag", () => {
    const digest = digestOf(
      provenance({
        entries: entries([
          { value: "Same.", via: BEST_PRACTICES, node: "a" },
          { value: "Same.", via: BEST_PRACTICES, node: "b", approximate: true },
        ]),
      }),
    );

    expect(groupAt(digest, 0).entries).toEqual([
      { index: 0, value: "Same.", node: { nodeId: "a", name: "a" } },
      {
        index: 1,
        value: "Same.",
        node: { nodeId: "b", name: "b" },
        duplicateOfIndex: 0,
        approximate: true,
      },
    ]);
  });

  test("the external layers get their own groups", () => {
    const digest = digestOf(
      provenance({
        entries: entries([
          { value: "From the bot.", via: { kind: "global" } },
          { value: "From the org.", via: { kind: "inherited" } },
          { value: "From a preset.", via: BEST_PRACTICES },
        ]),
      }),
    );

    expect(digest.groups.map((g) => g.key)).toEqual([
      "global",
      "inherited",
      "preset:config:best-practices",
    ]);
  });
});

/** Provenance carrying one `packageRules` description, from `layer`. */
function withRule(layer: ProvenanceLayer, ruleIndex = 0, sourceIndex = 0): DescriptionProvenance {
  return provenance({
    ruleDescriptions: [
      { ruleIndex, sourceIndex, layer, values: ["Slow down risky major updates"] },
    ],
  });
}

describe("rule descriptions", () => {
  const RULES = [
    {
      description: ["Slow down risky major updates"],
      matchUpdateTypes: ["major"],
      minimumReleaseAge: "14 days",
    },
    { description: ["From a preset"], matchManagers: ["npm"] },
  ];

  test("pairs a repo rule with its matcher and write summary", () => {
    const digest = digestOf(withRule(REPO), RULES);

    expect(digest.groups).toHaveLength(1);
    expect(groupAt(digest, 0)).toMatchObject({ key: "repo" });
    expect(ruleAt(groupAt(digest, 0), 0)).toEqual({
      ruleIndex: 0,
      sourceIndex: 0,
      values: ["Slow down risky major updates"],
      selectors: "matchUpdateTypes",
      writes: ["minimumReleaseAge"],
    });
    expect(ruleNoteText(ruleAt(groupAt(digest, 0), 0))).toBe(
      "packageRules[0] — matchUpdateTypes → minimumReleaseAge",
    );
  });

  test("cites the rule where the reader can find it, not the merged index", () => {
    // Presets merge ahead of the repo, so the user's first rule routinely
    // lands at merged index 297 — a number their editor has no line for. The
    // body is still read from the merged array.
    const merged = [...Array.from({ length: 297 }, () => ({})), RULES[0]];
    const digest = digestOf(withRule(REPO, 297, 0), merged);

    expect(ruleAt(groupAt(digest, 0), 0)).toMatchObject({ ruleIndex: 297, sourceIndex: 0 });
    expect(ruleNoteText(ruleAt(groupAt(digest, 0), 0))).toBe(
      "packageRules[0] — matchUpdateTypes → minimumReleaseAge",
    );
  });

  test("preset rule descriptions are left to the simulator (PR 5)", () => {
    // `config:best-practices` alone carries hundreds; they would bury the
    // handful of sentences the card exists to show.
    expect(buildDescriptionDigest(withRule(BEST_PRACTICES), RULES)).toBeNull();
  });

  test("survives a rule body the final config no longer has", () => {
    const digest = digestOf(withRule(REPO), null);

    expect(ruleAt(groupAt(digest, 0), 0)).toMatchObject({
      selectors: "(not an object)",
      writes: [],
    });
  });

  test("a rule with no selectors says so rather than reading as unconditional", () => {
    const digest = digestOf(withRule(REPO), [{ description: ["x"], automerge: true }]);

    expect(ruleNoteText(ruleAt(groupAt(digest, 0), 0))).toBe(
      "packageRules[0] — (no match*/exclude* selectors) → automerge",
    );
  });
});

describe("the empty state", () => {
  test("a config with top-level prose and user rules has a description row", () => {
    const digest = digestOf(
      provenance({
        entries: entries([
          { value: "Dashboard.", via: BEST_PRACTICES },
          { value: "Pin digests.", via: BEST_PRACTICES },
          { value: "Dashboard.", via: DASHBOARD },
          { value: "My note.", via: REPO, node: "root" },
        ]),
        ruleDescriptions: [{ ruleIndex: 0, sourceIndex: 0, layer: REPO, values: ["Mine"] }],
      }),
      [{ matchUpdateTypes: ["major"] }],
    );

    expect(hasTopLevelDescriptions(digest)).toBe(true);
  });

  test("a digest whose every entry is a repeat still has a description row", () => {
    // The strings added nothing NEW, but the final `description` array still
    // holds them, so the row exists.
    const digest = digestOf(
      provenance({
        entries: entries([
          { value: "Dashboard.", via: BEST_PRACTICES },
          { value: "Dashboard.", via: DASHBOARD },
        ]),
      }),
    );

    expect(hasTopLevelDescriptions(digest)).toBe(true);
  });

  test("no descriptions anywhere means no card", () => {
    expect(buildDescriptionDigest(provenance())).toBeNull();
  });

  test("rule descriptions alone still produce a digest", () => {
    const digest = digestOf(
      provenance({
        ruleDescriptions: [{ ruleIndex: 0, sourceIndex: 0, layer: REPO, values: ["Mine"] }],
      }),
      [{ matchManagers: ["npm"], automerge: true }],
    );

    // No top-level `description` key at all: Renovate never hoists a
    // rule's prose, so there is no Effective config row to send a reader to.
    expect(hasTopLevelDescriptions(digest)).toBe(false);
  });

  test("carries the array members that are not text, and says so", () => {
    // Renovate WARNS about `{"description": ["Keep this.", 42]}` and keeps the
    // 42, which occupies index 1 of the final array. No group can show it, so a
    // card titled "What this config does" has to name it instead of dropping it.
    const digest = digestOf(
      provenance({
        entries: entries([{ value: "Keep this.", via: REPO, node: "root" }]),
        unattributed: [{ index: 1, value: 42 }],
      }),
    );

    expect(digest.unattributed).toBe(1);
    expect(unattributedNoteText(digest)).toBe(
      "1 member of the description array is not text, so no preset can be credited with it.",
    );
  });

  test("several non-text members read as several", () => {
    const digest = digestOf(
      provenance({
        entries: entries([{ value: "Keep this.", via: REPO, node: "root" }]),
        unattributed: [
          { index: 1, value: 42 },
          { index: 2, value: null },
        ],
      }),
    );

    expect(digest.unattributed).toBe(2);
    expect(unattributedNoteText(digest)).toBe(
      "2 members of the description array are not text, so no preset can be credited with them.",
    );
  });

  test("a well-formed config has no such note", () => {
    const digest = digestOf(
      provenance({ entries: entries([{ value: "Only prose.", via: REPO, node: "root" }]) }),
    );

    expect(digest.unattributed).toBe(0);
    expect(unattributedNoteText(digest)).toBe("");
  });

  test("a description array of nothing but non-text is still no card", () => {
    // There is no prose to summarize, so the card that would carry the note
    // does not exist — and nothing claims completeness in its absence.
    expect(
      buildDescriptionDigest(provenance({ unattributed: [{ index: 0, value: 42 }] })),
    ).toBeNull();
  });

  test("degraded rides through from the engine", () => {
    const digest = digestOf(
      provenance({
        entries: entries([{ value: "Something.", via: BEST_PRACTICES, approximate: true }]),
        degraded: true,
      }),
    );

    expect(digest.degraded).toBe(true);
  });
});
