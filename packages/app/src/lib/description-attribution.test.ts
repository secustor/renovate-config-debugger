import { describe, expect, test } from "vitest";
import type {
  DescriptionAttribution,
  DescriptionProvenance,
  PresetNode,
} from "@renovate-config-debugger/engine";
import {
  buildDescriptionCards,
  cardPathText,
  cardPositionText,
  type DescriptionCard,
  type DescriptionCards,
  descriptionCardsFor,
  PATH_SEGMENT_CAP,
} from "./description-attribution";
import {
  descriptionEntries,
  type DescriptionEntrySpec,
  descriptionProvenance,
  presetLayer,
  REPO_LAYER as REPO,
} from "@tools/test/description-provenance";

/**
 * Roadmap 069 (PR 5): the hover card's model. The engine's own tests (PR 1)
 * prove the attribution against the real 1,088-preset tree; what needs proving
 * here is what this module adds — the root-to-writer path (including the
 * elision that keeps a deep chain a path), the facts line, the repo config's
 * own sentences not masquerading as a preset, and above all the positional
 * guard, which is what stands between "hover a string" and "name the wrong
 * preset in a document that is not the array we indexed".
 */

/**
 * A member of the final array. A plain spec is an attributed string; a
 * `nonString` is one of the members Renovate warns about and keeps
 * (`{"description": ["a", 42]}`), which no preset wrote — it occupies a real
 * index all the same, which is the whole reason the cards are placed by index.
 */
type MemberSpec = DescriptionEntrySpec | { nonString: unknown };

function isNonString(spec: MemberSpec): spec is { nonString: unknown } {
  return "nonString" in spec;
}

/** The attributed members, each carrying the index it really occupies — a
 *  non-string neighbour holds one without contributing an entry. */
function entries(specs: MemberSpec[]): DescriptionAttribution[] {
  return descriptionEntries(
    specs.flatMap((spec, index) => (isNonString(spec) ? [] : [{ ...spec, index }])),
  );
}

function provenance(specs: MemberSpec[]): DescriptionProvenance {
  return descriptionProvenance({
    entries: entries(specs),
    unattributed: specs.flatMap((spec, index) =>
      isNonString(spec) ? [{ index, value: spec.nonString }] : [],
    ),
    finalLength: specs.length,
  });
}

/** The document the As-JSON view renders for these specs. */
function docFor(specs: MemberSpec[]): { description: unknown[] } {
  return { description: specs.map((spec) => (isNonString(spec) ? spec.nonString : spec.value)) };
}

/** A preset node, as `computeTreeStats` reads it: `input` is what its own
 *  contribution counts come from. */
function node(id: string, name: string, extra?: Partial<PresetNode>): PresetNode {
  return { id, name, state: "resolved", input: {}, resolved: {}, children: [], ...extra };
}

/** `(input config) › config:best-practices › docker:pinDigests`, with two
 *  packageRules on the leaf. */
function tree(): PresetNode {
  const pinDigests = node("p3", "docker:pinDigests", {
    input: { packageRules: [{ matchDatasources: ["docker"] }, { matchDatasources: ["orb"] }] },
  });
  const bestPractices = node("p2", "config:best-practices", { children: [pinDigests] });
  return node("root", "(input config)", { children: [bestPractices] });
}

function cardsOf(specs: MemberSpec[], root: PresetNode | null = tree()): DescriptionCards {
  return buildDescriptionCards(provenance(specs), root);
}

function at(cards: readonly (DescriptionCard | undefined)[], index: number): DescriptionCard {
  const card = cards[index];
  if (!card) {
    throw new Error(`expected a card at ${index}, got ${cards.length}`);
  }
  return card;
}

function firstCard(specs: MemberSpec[], root: PresetNode | null = tree()): DescriptionCard {
  return at(cardsOf(specs, root).cards, 0);
}

describe("buildDescriptionCards", () => {
  test("names the writing preset, the path it arrived by, and what else it sets", () => {
    const card = firstCard([
      {
        value: "Pin Docker digests.",
        node: { nodeId: "p3", name: "docker:pinDigests" },
        via: presetLayer("p2", "config:best-practices"),
      },
    ]);

    expect(card.layer).toEqual(presetLayer("p3", "docker:pinDigests"));
    expect(cardPathText(card)).toBe("(input config) › config:best-practices › docker:pinDigests");
    // The tree jump is offered because this node really is in this run's tree.
    expect(card.nodeId).toBe("p3");
    expect(cardPositionText(card)).toBe("Position 1 of 1 · also sets 2 packageRules");
  });

  test("the repo's own sentence is the repo config, not a preset named after the input", () => {
    const card = firstCard([
      { value: "Our house rules.", node: { nodeId: "root", name: "(input config)" }, via: REPO },
    ]);

    // The root is a config: no purple preset chip, no path, and no tree jump —
    // the tree never renders a row for it.
    expect(card.layer).toEqual(REPO);
    expect(cardPathText(card)).toBe("");
    expect(card.nodeId).toBeUndefined();
    expect(card.ownRules).toBeUndefined();
  });

  test("a string from a layer with no preset tree keeps its arrival layer", () => {
    const card = firstCard([{ value: "Org-wide policy.", via: { kind: "inherited" } }]);

    expect(card.layer).toEqual({ kind: "inherited" });
    expect(cardPathText(card)).toBe("");
  });

  test("carries the duplicate marker and the approximate flag through", () => {
    const { cards } = cardsOf([
      { value: "Enable Renovate Dependency Dashboard creation.", via: presetLayer("p2") },
      {
        value: "Enable Renovate Dependency Dashboard creation.",
        node: { nodeId: "p3", name: "docker:pinDigests" },
        via: presetLayer("p2"),
        approximate: true,
      },
    ]);

    expect(cardPositionText(at(cards, 0))).toBe("Position 1 of 2");
    expect(at(cards, 1).approximate).toBe(true);
    expect(cardPositionText(at(cards, 1))).toBe(
      "Position 2 of 2 · duplicate of #1 · also sets 2 packageRules",
    );
  });

  test("elides the middle of a path too deep to read, keeping both ends", () => {
    // A chain deeper than the cap: the extend the reader wrote and the preset
    // that wrote the sentence are what identify it, so those are what survive.
    const names = ["(input config)", "org:all", "org:base", "config:recommended", "a", "b", "c"];
    const root = names.reduceRight<PresetNode | undefined>(
      (child, name, i) =>
        node(i === 0 ? "root" : `n${i}`, name, child ? { children: [child] } : {}),
      undefined,
    );
    if (!root) {
      throw new Error("expected a tree");
    }

    const card = firstCard(
      [{ value: "Deep.", node: { nodeId: "n6", name: "c" }, via: REPO }],
      root,
    );
    expect(card.path).toHaveLength(PATH_SEGMENT_CAP);
    expect(cardPathText(card)).toBe("(input config) › org:all › … › a › b › c");
  });

  test("counts the positions of the REAL array, non-strings included", () => {
    // `{"description": ["A", 42, "B", "C"]}` — Renovate warns about the `42`
    // and keeps it, so it holds index 1 and "B" really is the third of four.
    const { cards, finalLength, unattributedIndices } = cardsOf([
      { value: "A", via: presetLayer("p2") },
      { nonString: 42 },
      { value: "B", via: presetLayer("p2") },
      { value: "C", via: presetLayer("p2") },
    ]);

    expect(finalLength).toBe(4);
    expect([...unattributedIndices]).toEqual([1]);
    // Three cards for four members, each carrying the index it really has.
    expect(cards.map((card) => card.index)).toEqual([0, 2, 3]);
    expect(cards.map(cardPositionText)).toEqual([
      "Position 1 of 4",
      "Position 3 of 4",
      "Position 4 of 4",
    ]);
  });

  test("works without a preset tree at all — the chip still names the writer", () => {
    const card = firstCard(
      [{ value: "Pin Docker digests.", node: { nodeId: "p3", name: "docker:pinDigests" } }],
      null,
    );

    expect(card.layer).toEqual(presetLayer("p3", "docker:pinDigests"));
    expect(card.path).toEqual([]);
    // Nothing to select in a tree this run does not have.
    expect(card.nodeId).toBeUndefined();
  });
});

describe("descriptionCardsFor", () => {
  const specs: MemberSpec[] = [
    { value: "Enable Renovate Dependency Dashboard creation.", via: presetLayer("p1") },
    { value: "Pin Docker digests.", via: presetLayer("p2") },
  ];

  test("attaches the cards to the document that IS the attributed array", () => {
    const attribution = cardsOf(specs);
    const placed = descriptionCardsFor({ ...docFor(specs), automerge: true }, attribution);

    expect(placed).toHaveLength(2);
    expect(at(placed ?? [], 1).value).toBe("Pin Docker digests.");
  });

  test("places the cards at their real indices and leaves the non-string bare", () => {
    const mixed: MemberSpec[] = [
      { value: "A", via: presetLayer("p1") },
      { nonString: 42 },
      { value: "B", via: presetLayer("p2") },
    ];
    const placed = descriptionCardsFor(docFor(mixed), cardsOf(mixed));

    // Indexed like the array the view prints, so element i asks for [i] —
    // and index 1, which no preset wrote, renders as plain JSON.
    expect(placed).toHaveLength(3);
    expect(at(placed ?? [], 0).value).toBe("A");
    expect(placed?.[1]).toBeUndefined();
    expect(at(placed ?? [], 2).value).toBe("B");
  });

  test("refuses a document whose description is a different array", () => {
    const attribution = cardsOf(specs);
    // The As-JSON view's keep-internal document: the presets are still
    // `extends` references, so their sentences are simply not in it.
    expect(descriptionCardsFor({ description: ["Pin Docker digests."] }, attribution)).toBeNull();
    // Same length, different order — value matching alone would have accepted
    // this and named the wrong preset for both strings.
    expect(
      descriptionCardsFor(
        { description: attribution.cards.toReversed().map((c) => c.value) },
        attribution,
      ),
    ).toBeNull();
    expect(descriptionCardsFor({ automerge: true }, attribution)).toBeNull();
    expect(descriptionCardsFor({ description: "a string" }, attribution)).toBeNull();
  });

  test("refuses a document that has a sentence where the non-string belongs", () => {
    const mixed: MemberSpec[] = [
      { value: "A", via: presetLayer("p1") },
      { nonString: 42 },
      { value: "B", via: presetLayer("p2") },
    ];
    // Right length, and every card's own index still matches — but the member
    // nobody wrote is a string here, so this is not the array we indexed and
    // the sentence at index 1 would wear another preset's name.
    expect(
      descriptionCardsFor({ description: ["A", "Something else.", "B"] }, cardsOf(mixed)),
    ).toBeNull();
  });

  test("refuses when there is no attribution to attach", () => {
    expect(descriptionCardsFor({ description: ["x"] }, null)).toBeNull();
    expect(descriptionCardsFor({ description: [] }, cardsOf([]))).toBeNull();
  });
});
