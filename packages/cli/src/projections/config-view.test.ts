import { describe, expect, test } from "vitest";
import { globalOnlyOptionNames } from "@renovate-config-debugger/engine";
import {
  collapseDeltas,
  collapseDescriptionDelta,
  collapseDescriptionDiff,
  collapseDiffs,
  type ConfigScope,
  deltaLine,
  mergedLine,
  parseConfigScope,
  parseKeys,
  projectConfig,
  projectKeySet,
} from "./config-view";

/**
 * Roadmap 070. Pure — no pipeline run: the whole point of the module is that
 * the projection is decidable from the document plus Renovate's option
 * metadata.
 */

/** A globalOnly option: no packageRule can read or write it, and Renovate
 *  itself strips the class from a repo config. */
const GLOBAL_ONLY = "onboardingConfig";

const CONFIG = {
  automerge: true,
  groupName: "react monorepo",
  labels: ["deps"],
  [GLOBAL_ONLY]: { extends: ["config:recommended"] },
};

describe("projectConfig", () => {
  test("the globalOnly class goes by default, and the view says how many", () => {
    expect(globalOnlyOptionNames().has(GLOBAL_ONLY)).toBe(true);
    const { config, view } = projectConfig(CONFIG, { scope: "package-rules" });
    expect(Object.keys(config)).toEqual(["automerge", "groupName", "labels"]);
    expect(view).toEqual({ scope: "package-rules", keys: 3, droppedGlobalOnly: 1 });
  });

  test("`full` keeps everything and reports nothing dropped", () => {
    const { config, view } = projectConfig(CONFIG, { scope: "full" });
    expect(Object.keys(config)).toEqual(Object.keys(CONFIG));
    expect(view).toEqual({ scope: "full", keys: 4 });
  });

  test("keys selects, and names what the document does not have", () => {
    const { config, view } = projectConfig(CONFIG, {
      scope: "package-rules",
      keys: ["automerge", "minimumReleaseAge"],
    });
    expect(config).toEqual({ automerge: true });
    expect(view.withheld).toEqual([{ key: "minimumReleaseAge", reason: "absent" }]);
    expect(view.keys).toBe(1);
  });

  /** The additive-only decision, pinned: `keys` may only ever narrow what
   *  `scope` left, so one parameter never both narrows and widens. */
  test("keys cannot resurrect a key the scope removed — it says why it is gone", () => {
    const { config, view } = projectConfig(CONFIG, {
      scope: "package-rules",
      keys: [GLOBAL_ONLY],
    });
    expect(config).toEqual({});
    expect(view.withheld).toEqual([{ key: GLOBAL_ONLY, reason: "global-only" }]);
  });

  test("widening is configScope's job, and it works", () => {
    const { config, view } = projectConfig(CONFIG, { scope: "full", keys: [GLOBAL_ONLY] });
    expect(Object.keys(config)).toEqual([GLOBAL_ONLY]);
    expect(view.withheld).toBeUndefined();
  });

  /** The invariant every axis is composable under: whatever you ask for, you
   *  get a SUBSET of what you would have got by asking for nothing. */
  test("every projection is a subset of its input, and of the default answer", () => {
    const scopes: ConfigScope[] = ["package-rules", "full"];
    const keySets = [
      undefined,
      [],
      ["automerge"],
      [GLOBAL_ONLY],
      ["automerge", GLOBAL_ONLY, "nope"],
      Object.keys(CONFIG),
    ];
    for (const scope of scopes) {
      const wide = projectConfig(CONFIG, { scope });
      for (const keys of keySets) {
        const { config, view } = projectConfig(CONFIG, {
          scope,
          ...(keys ? { keys } : {}),
        });
        for (const [key, value] of Object.entries(config)) {
          expect(CONFIG).toHaveProperty(key, value);
          expect(wide.config).toHaveProperty(key, value);
        }
        expect(view.keys).toBe(Object.keys(config).length);
        expect(view.keys).toBeLessThanOrEqual(wide.view.keys);
      }
    }
  });
});

/**
 * Replay-03 (2 MCP sessions): a comparison delta only lists keys that DIFFER,
 * so a requested key that is the same on both sides is not in it — and
 * `absent` for it read as "not in the config" about an option both configs
 * hold. `unchanged` is how the comparison names that case `identical`.
 */
describe("projectKeySet withheld reasons", () => {
  test("a key the documents carry but the delta does not is `identical`, not `absent`", () => {
    const { view } = projectKeySet(
      ["groupName"],
      { scope: "package-rules", keys: ["groupName", "labels", "minimumReleaseAge", GLOBAL_ONLY] },
      new Set(["labels"]),
    );
    expect(view.withheld).toEqual([
      { key: "labels", reason: "identical" },
      { key: "minimumReleaseAge", reason: "absent" },
      { key: GLOBAL_ONLY, reason: "global-only" },
    ]);
  });

  test("`global-only` still wins over `identical` — the scope is why it is gone", () => {
    const { view } = projectKeySet(
      [],
      { scope: "package-rules", keys: [GLOBAL_ONLY] },
      new Set([GLOBAL_ONLY]),
    );
    expect(view.withheld).toEqual([{ key: GLOBAL_ONLY, reason: "global-only" }]);
  });
});

describe("collapseDescriptionDiff", () => {
  const before = ["Pin Docker digests.", "Separate major releases."];

  test("collapses an append into exactly what it appended", () => {
    const collapsed = collapseDescriptionDiff({
      key: "description",
      before,
      after: [...before, "Group react packages."],
    });
    expect(collapsed).toEqual({
      key: "description",
      collapsed: "append",
      beforeLength: 2,
      afterLength: 3,
      added: ["Group react packages."],
    });
  });

  test("a replacement stays verbatim — both sides are the answer there", () => {
    const diff = { key: "description", before, after: ["Something else entirely."] };
    expect(collapseDescriptionDiff(diff)).toBe(diff);
  });

  test("a non-array value stays verbatim", () => {
    const diff = { key: "description", before: "a string", after: "another string" };
    expect(collapseDescriptionDiff(diff)).toBe(diff);
  });

  test("an empty before stays verbatim — collapsing would save nothing", () => {
    const diff = { key: "description", before: [], after: ["The first sentence."] };
    expect(collapseDescriptionDiff(diff)).toBe(diff);
  });

  test("only description collapses — a labels reader wants the list", () => {
    const diff = { key: "labels", before: ["deps"], after: ["deps", "upstream"] };
    expect(collapseDescriptionDiff(diff)).toBe(diff);
  });

  test("a rule's own extra fields ride through the collapse", () => {
    const collapsed = collapseDiffs([
      { key: "description", before, after: [...before, "And this."], ruleIndex: 3 },
    ]);
    expect(collapsed[0]).toMatchObject({ ruleIndex: 3, collapsed: "append" });
  });

  /** The comparison names its two sides `a`/`b` — it has no chronology — so
   *  the same append has to collapse under that spelling too, with the delta's
   *  own fields (`kind`, `inA`, `aInherited`) riding through untouched. */
  test("a comparison delta collapses on a/b, keeping its own fields", () => {
    const collapsed = collapseDeltas([
      {
        key: "description",
        kind: "documentation",
        a: before,
        b: [...before, "And this."],
        inA: true,
        inB: true,
      },
    ]);
    expect(collapsed[0]).toMatchObject({
      kind: "documentation",
      inA: true,
      inB: true,
      collapsed: "append",
      added: ["And this."],
    });
  });

  test("collapsing an append is an order of magnitude smaller than the diff", () => {
    // The measured shape: `mergeChildConfig` concatenates `description` on
    // nearly every merge, so a best-practices rule re-embeds ~24 sentences
    // twice. One sentence is what the step actually did.
    const long = Array.from({ length: 24 }, (_, i) => `Sentence number ${i} of a preset body.`);
    const diff = { key: "description", before: long, after: [...long, "The one this rule added."] };
    const verbatim = JSON.stringify(diff).length;
    const collapsed = JSON.stringify(collapseDescriptionDiff(diff)).length;
    expect(collapsed * 10).toBeLessThan(verbatim);
  });
});

describe("rendering", () => {
  const collapsedMerge = collapseDescriptionDiff({
    key: "description",
    before: ["One.", "Two."],
    after: ["One.", "Two.", "Three."],
  });
  const collapsedDelta = collapseDescriptionDelta({
    key: "description",
    a: ["One.", "Two."],
    b: ["One.", "Two.", "Three."],
  });

  test("a collapsed diff renders what it added, not both arrays", () => {
    expect(deltaLine(collapsedDelta)).toBe(
      'description: 2 entries + 1 appended (now 3) — ["Three."]',
    );
    expect(mergedLine(collapsedMerge)).toBe('description += 1 of 3 entries: ["Three."]');
  });

  test("an ordinary delta renders a → b", () => {
    expect(deltaLine({ key: "groupName", a: undefined, b: "react monorepo" })).toBe(
      'groupName: (unset) → "react monorepo"',
    );
    expect(mergedLine({ key: "groupName", before: undefined, after: "react monorepo" })).toBe(
      'groupName = "react monorepo"',
    );
  });

  /** Replay-02 N8: a value NO merge step wrote is a Renovate default. Rendered
   *  bare it asserts a setting the config never carried. */
  test("an inherited side says so instead of asserting a value", () => {
    expect(
      deltaLine({ key: "automerge", a: false, b: true, inA: true, inB: true, aInherited: true }),
    ).toBe("automerge: false (default in A) → true");
  });
});

describe("flag parsing", () => {
  test("--keys takes --select's comma grammar", () => {
    expect(parseKeys("automerge, labels ,")).toEqual(["automerge", "labels"]);
    expect(parseKeys(undefined)).toBeUndefined();
    // "no keys" is never what someone typing a flag meant.
    expect(parseKeys(" , ")).toBeUndefined();
  });

  test("--config-scope names the values that exist", () => {
    expect(parseConfigScope("full", "--config-scope")).toBe("full");
    expect(() => parseConfigScope("global", "--config-scope")).toThrow(/package-rules\|full/);
  });
});
