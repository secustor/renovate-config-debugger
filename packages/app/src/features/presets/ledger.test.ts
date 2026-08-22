import type { PresetNode } from "@renovate-config-debugger/engine";
import { describe, expect, it } from "vitest";
import {
  computePresetLedger,
  familyNote,
  mergeOrder,
  presetDocsUrl,
  tileFractions,
  tileStrength,
} from "./ledger";

/**
 * Roadmap 075 (iteration 5b): the ledger's whole model, over hand-built trees.
 * Synthetic on purpose — the facts under test are structural (which child is a
 * family, which preset had the last word about a key), and a real
 * `config:recommended` run would assert Renovate's contents rather than this
 * module's arithmetic. The shapes mirror the real ones: a big internal source
 * with a dozen children, a small fetched one, a failed one.
 */

let nextId = 0;

function node(
  name: string,
  opts: {
    input?: Record<string, unknown>;
    children?: PresetNode[];
    kind?: string;
    state?: PresetNode["state"];
    error?: string;
  } = {},
): PresetNode {
  nextId++;
  return {
    id: `p${nextId}`,
    name,
    state: opts.state ?? "resolved",
    source: { presetSource: opts.kind ?? "internal" } as PresetNode["source"],
    input: opts.input ?? {},
    children: opts.children ?? [],
    ...(opts.error ? { error: { topic: "preset", message: opts.error } } : {}),
  };
}

function root(children: PresetNode[]): PresetNode {
  return { id: "root", name: "(input config)", state: "resolved", input: {}, children };
}

function tinyFamily(name: string, size: number): PresetNode {
  const kids = Array.from({ length: size }, (_, i) =>
    node(`${name}-kid${i}`, { input: { packageRules: [{ matchPackageNames: ["a"] }] } }),
  );
  return node(name, { children: kids });
}

describe("sources", () => {
  it("is one card per top-level extends entry, in tree order, failures included", () => {
    const model = computePresetLedger(
      root([
        node("config:recommended", { children: [node(":dependencyDashboard")] }),
        node("github>me/presets", { kind: "github", input: { labels: ["deps"] } }),
        node("local>org/repo", { kind: "local", state: "error", error: "dep not found" }),
      ]),
    );

    expect(model.sources.map((s) => s.name)).toEqual([
      "config:recommended",
      "github>me/presets",
      "local>org/repo",
    ]);
    expect(model.sources.map((s) => s.builtIn)).toEqual([true, false, false]);
    const failed = model.sources[2];
    expect(failed?.failed).toBe(true);
    expect(failed?.error).toBe("dep not found");
    // A failed source resolved nothing — it must not claim to have brought a
    // preset in.
    expect(failed?.presets).toBe(0);
    // Its numbers still come from the run's own walk, never a recount.
    expect(model.summary.errors).toBe(1);
  });

  it("opens a fetched source, folds a big built-in shut", () => {
    const model = computePresetLedger(
      root([
        node("config:recommended", {
          children: Array.from({ length: 30 }, (_, i) => node(`:preset${i}`)),
        }),
        node("github>me/presets", { kind: "github" }),
        node(":dependencyDashboard", { input: { dependencyDashboard: true } }),
      ]),
    );
    expect(model.sources.map((s) => s.defaultOpen)).toEqual([false, true, true]);
  });

  it("never opens with every card shut", () => {
    // The lone-source run: folding the firehose away would leave the tab
    // showing a strip and a closed card — an empty answer.
    const model = computePresetLedger(
      root([
        node("config:recommended", {
          children: Array.from({ length: 30 }, (_, i) => node(`:preset${i}`)),
        }),
      ]),
    );
    expect(model.sources[0]?.defaultOpen).toBe(true);
  });
});

describe("families", () => {
  it("names only the children that brought a family when there are many", () => {
    const model = computePresetLedger(
      root([
        node("config:recommended", {
          children: [
            tinyFamily("group:monorepos", 9),
            tinyFamily("replacements:all", 4),
            tinyFamily("workarounds:all", 2),
            ...Array.from({ length: 8 }, (_, i) =>
              node(`helpers:leaf${i}`, { input: { packageRules: [{ matchPackageNames: ["x"] }] } }),
            ),
          ],
        }),
      ]),
    );
    const source = model.sources[0];
    // Sorted by what each brought, and the single-preset leaves are not
    // families — they are counted by the aggregate tiles instead.
    expect(source?.families.map((f) => [f.name, f.presets])).toEqual([
      ["group:monorepos", 10],
      ["replacements:all", 5],
      ["workarounds:all", 3],
    ]);
    // The well-known ones carry a note; nothing else invents one.
    expect(source?.families[0]?.note).toBe("groups related packages into one pull request");
    expect(familyNote("mystery:thing")).toBeNull();
    // Rules not inside a family still get a tile, so the leaves are accounted.
    const rulesTile = source?.tileRows.flat().find((t) => t.kind === "rules");
    expect(rulesTile?.count).toBe(8);
    expect(source?.families[0]?.samples).toHaveLength(5);
  });

  it("gives every child a tile when a source has only a handful", () => {
    const model = computePresetLedger(
      root([
        node("github>me/presets", {
          kind: "github",
          children: [node("config:best-practices"), node("customManagers:dockerfileVersions")],
        }),
      ]),
    );
    expect(model.sources[0]?.families.map((f) => f.name)).toEqual([
      "config:best-practices",
      "customManagers:dockerfileVersions",
    ]);
    // Structure on one row, the aggregates that sum it up on the next.
    expect(model.sources[0]?.tileRows).toHaveLength(2);
  });
});

describe("option attribution", () => {
  it("credits the preset that had the LAST word in merge order", () => {
    // Renovate merges a preset's resolved `extends` left to right and then the
    // preset's own keys on top — so the parent beats its child, and a later
    // sibling beats an earlier one.
    const model = computePresetLedger(
      root([
        node("source", {
          input: { labels: ["from-source"] },
          children: [
            node("child:a", { input: { labels: ["from-a"], rangeStrategy: "bump" } }),
            node("child:b", { input: { rangeStrategy: "pin" } }),
          ],
        }),
      ]),
    );
    const options = model.sources[0]?.options ?? [];
    expect(options.map((o) => o.key)).toEqual(["labels", "rangeStrategy"]);
    const labels = options[0];
    expect(labels?.setterName).toBe("source");
    expect(labels?.value).toBe("[ 1 item ]");
    expect(labels?.alsoSetBy).toBe(1);
    expect(labels?.nested).toBe(false);
    // Later sibling wins over the earlier one.
    expect(options[1]?.setterName).toBe("child:b");
    expect(options[1]?.alsoSetBy).toBe(1);
  });

  it("marks a setter deeper than a direct child as nested, and ignores meta keys", () => {
    const model = computePresetLedger(
      root([
        node("source", {
          children: [
            node("wrapper", {
              input: { description: "a wrapper", $schema: "x", groupName: "g" },
              children: [node("deep", { input: { minimumReleaseAge: "3 days" } })],
            }),
          ],
        }),
      ]),
    );
    const options = model.sources[0]?.options ?? [];
    // `description`, `$schema` and `groupName` describe or group — they are
    // not options a reader is looking for here (the same test the digest's
    // "only N set options" applies).
    expect(options.map((o) => o.key)).toEqual(["minimumReleaseAge"]);
    expect(options[0]?.nested).toBe(true);
    expect(options[0]?.value).toBe('"3 days"');
  });

  it("counts pure extends routers and leaves a source that contributes nothing bare", () => {
    const model = computePresetLedger(
      root([node("router:only", { children: [node("router:inner")] })]),
    );
    const source = model.sources[0];
    expect(source?.options).toEqual([]);
    const tiles = source?.tileRows.flat() ?? [];
    expect(tiles.find((t) => t.kind === "options")).toBeUndefined();
    expect(tiles.find((t) => t.kind === "rules")).toBeUndefined();
    expect(tiles.find((t) => t.kind === "routers")?.count).toBe(2);
  });

  it("walks a subtree in merge order (post-order), not pre-order", () => {
    const tree = node("s", { children: [node("a", { children: [node("a1")] }), node("b")] });
    expect(mergeOrder(tree).map((n) => n.name)).toEqual(["a1", "a", "b", "s"]);
  });
});

describe("mosaic geometry", () => {
  it("keeps a tiny family clickable while staying proportional", () => {
    const fractions = tileFractions([900, 60, 20]);
    expect(fractions.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(fractions[0]).toBeGreaterThan(fractions[1] ?? 0);
    expect(fractions[2]).toBeGreaterThanOrEqual(0.12);
    // Degenerate inputs stay renderable rather than producing NaN widths.
    expect(tileFractions([0, 0])).toEqual([0.5, 0.5]);
    expect(tileFractions([])).toEqual([]);
    expect(tileFractions([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]).every((f) => f > 0)).toBe(true);
  });

  it("grades the fill by share", () => {
    expect(tileStrength(0.6)).toBe(3);
    expect(tileStrength(0.2)).toBe(2);
    expect(tileStrength(0.05)).toBe(1);
  });
});

describe("docs links", () => {
  it("anchors an internal preset on its group's page and sends the rest to config-presets", () => {
    expect(presetDocsUrl("group:monorepos", "internal")).toBe(
      "https://docs.renovatebot.com/presets-group/#groupmonorepos",
    );
    expect(presetDocsUrl(":dependencyDashboard", "internal")).toBe(
      "https://docs.renovatebot.com/presets-default/#dependencydashboard",
    );
    expect(presetDocsUrl("mergeConfidence:all-badges", "internal")).toBe(
      "https://docs.renovatebot.com/presets-mergeConfidence/#mergeconfidenceall-badges",
    );
    // Parameters name an INSTANCE of a preset; the preset itself is what the
    // docs page documents.
    expect(presetDocsUrl("group:foo(bar)", "internal")).toBe(
      "https://docs.renovatebot.com/presets-group/#groupfoo",
    );
    // A group the docs publish no page for, and anything fetched (somebody
    // else's repository, which no docs page describes), fall back honestly.
    expect(presetDocsUrl("nosuchgroup:thing", "internal")).toBe(
      "https://docs.renovatebot.com/config-presets/",
    );
    expect(presetDocsUrl("github>me/presets", "github")).toBe(
      "https://docs.renovatebot.com/config-presets/",
    );
  });
});

describe("error rows (roadmap 082)", () => {
  it("names every failed preset and where it came from", () => {
    const model = computePresetLedger(
      root([
        node("config:recommended", {
          children: [
            node("npm>@acme/shared", { kind: "npm", state: "error", error: "fetch failed" }),
          ],
        }),
        node("github>me/presets", {
          kind: "github",
          children: [
            node("github>me/presets:security", {
              kind: "github",
              state: "error",
              error: "Cannot find preset's package (github>me/presets:security)",
            }),
          ],
        }),
      ]),
    );

    expect(model.errors).toEqual([
      {
        nodeId: expect.any(String),
        name: "npm>@acme/shared",
        message: "fetch failed",
        // Its top-level entry is a Renovate built-in: nobody wrote this
        // reference in their config, a preset did.
        via: "extends",
        authFixable: false,
        rateLimited: false,
      },
      {
        nodeId: expect.any(String),
        name: "github>me/presets:security",
        message: "Cannot find preset's package (github>me/presets:security)",
        // Its top-level entry is a preset the reader hosts.
        via: "own",
        // Roadmap 009: a GitHub not-found IS the sign-in-fixable flavor.
        authFixable: true,
        rateLimited: false,
      },
    ]);
    // The rows and the headline count are the same walk seen twice.
    expect(model.errors).toHaveLength(model.summary.errors);
  });

  it("calls a failed top-level entry the reader's own, whatever its kind", () => {
    // The commonest single-error run there is: a typo in a built-in preset
    // name. Classifying by source kind alone would tell its author the name
    // "arrived through a preset's own extends", which is flatly false — they
    // typed it.
    const typo = computePresetLedger(
      root([node("config:recomended", { state: "error", error: "preset not found" })]),
    );
    expect(typo.errors[0]?.via).toBe("config");

    // Same rule for a fetched entry, plus the rate-limit flavor (009).
    const fetched = computePresetLedger(
      root([
        node("github>me/private", {
          kind: "github",
          state: "error",
          error: "dep not found - rate limit or missing token",
        }),
      ]),
    );
    expect(fetched.errors[0]?.via).toBe("config");
    expect(fetched.errors[0]?.rateLimited).toBe(true);
    expect(fetched.errors[0]?.authFixable).toBe(true);
  });

  it("is empty for a clean expansion", () => {
    const model = computePresetLedger(root([node("config:recommended")]));
    expect(model.errors).toEqual([]);
    expect(model.summary.errors).toBe(0);
  });
});
