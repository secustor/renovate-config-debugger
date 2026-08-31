import type { OptionDoc, OptionIndex } from "@renovate-config-debugger/engine";
import { fireEvent, render } from "@testing-library/react";
import { expect, test } from "vitest";
import { OptionDocsProvider, OptionKey } from "./option-docs";

/**
 * The option-docs card's INTERACTION, now that it is the app's shared one.
 *
 * This module used to carry a hover implementation of its own, written before
 * `hover-card-hooks.ts` existed: pointer-only, with no singleton and no
 * Escape. The card's content was covered (it is rendered from the engine's own
 * metadata and the engine tests that); what nothing pinned was the contract
 * around it, which is exactly what the migration changed. So the four deltas
 * are the tests — a keyboard user can reach the docs, Escape takes them down,
 * a second card replaces the first rather than joining it, and a key the index
 * has nothing to say about is not an affordance at all.
 */

function optionDoc(name: string, over: Partial<OptionDoc> = {}): OptionDoc {
  return {
    name,
    description: `What \`${name}\` does.`,
    type: "boolean",
    placement: { kind: "unrestricted" },
    url: `https://docs.renovatebot.com/configuration-options/#${name}`,
    ...over,
  };
}

const INDEX: OptionIndex = {
  containers: new Map(),
  options: new Map([
    ["automerge", optionDoc("automerge")],
    ["labels", optionDoc("labels", { type: "array", subType: "string" })],
  ]),
};

function scene() {
  return render(
    <OptionDocsProvider index={INDEX}>
      <OptionKey name="automerge" flagUnknown />
      <OptionKey name="labels" flagUnknown />
      <OptionKey name="typoo" flagUnknown />
      <OptionKey name="freeform" flagUnknown={false} />
    </OptionDocsProvider>,
  );
}

function card(): HTMLElement | null {
  return document.querySelector(".option-card");
}

test("a keyboard user can reach an option's docs, and read the same card a pointer gets", () => {
  const view = scene();
  const key = view.getByText("automerge");
  // Focusable at all — the whole reason the docs were unreachable before.
  expect(key.getAttribute("tabindex")).toBe("0");

  fireEvent.focus(key);
  const open = card();
  expect(open?.querySelector(".option-card-name")?.textContent).toBe("automerge");
  expect(open?.textContent).toContain("does.");
  expect(open?.querySelector("a")?.getAttribute("href")).toBe(
    "https://docs.renovatebot.com/configuration-options/#automerge",
  );
});

test("Escape takes the card down", () => {
  const view = scene();
  const key = view.getByText("labels");
  fireEvent.focus(key);
  expect(card()).not.toBeNull();
  // The type badges are the head's, unchanged by the migration.
  expect([...(card()?.querySelectorAll(".badge.type") ?? [])].map((b) => b.textContent)).toEqual([
    "array",
    "of string",
  ]);

  fireEvent.keyDown(key, { key: "Escape" });
  expect(card()).toBeNull();
});

test("one card at a time, across every anchor in the app", () => {
  const view = scene();
  // `fireEvent.focus` does not move `document.activeElement`, so the first
  // anchor never blurs: what closes its card is the shared singleton, which is
  // precisely what this module used to sit outside of.
  fireEvent.focus(view.getByText("automerge"));
  fireEvent.focus(view.getByText("labels"));

  const cards = document.querySelectorAll(".option-card");
  expect(cards).toHaveLength(1);
  expect(cards[0]?.querySelector(".option-card-name")?.textContent).toBe("labels");
});

test("flags a key the index does not know, and leaves a free-form one inert", () => {
  const view = scene();
  const typo = view.getByText("typoo");
  expect(typo.className).toContain("unknown");
  fireEvent.focus(typo);
  expect(card()?.textContent).toContain("possibly a typo");
  fireEvent.keyDown(typo, { key: "Escape" });

  // A key in an object Renovate does not validate is not an option at all —
  // no card to read, so no tab stop and no handlers.
  const free = view.getByText("freeform");
  expect(free.className).toBe("opt-key");
  expect(free.getAttribute("tabindex")).toBeNull();
  fireEvent.focus(free);
  expect(card()).toBeNull();
});
