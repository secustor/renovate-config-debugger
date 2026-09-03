/**
 * Roadmap 075 (iteration 5): the Problems tab as fix-it cards. The translation
 * library itself is tested in the engine (`error-translations.test.ts`, next to
 * the module) — what this covers is the card the reader acts on: the summary
 * strip, the head that names the offending option and links its docs, the
 * suggested edit as a unified −/+ strip, and the one primary button that
 * applies it (roadmap 014's flow, which must survive the restyle intact).
 */
import {
  applyFixToText,
  findMentionedOption,
  runPipeline,
  translateMessage,
} from "@renovate-config-debugger/engine";
import { fireEvent, render, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ErrorTranslationLib } from "@/platform/run";
import { MessagesPanel } from "./MessagesPanel";

/** The real 014 library — the same three functions `loadErrorTranslationLib`
 *  hands the app once the engine chunk lands. */
const errorLib: ErrorTranslationLib = { translateMessage, findMentionedOption, applyFixToText };

function panelFor(content: string) {
  return runPipeline({ fileName: "renovate.json", content });
}

it("leads a clean run with the accepted verdict and no cards", async () => {
  const result = await panelFor(JSON.stringify({ labels: ["dependencies"] }));
  const view = render(
    <MessagesPanel result={result} errorCount={0} warningCount={0} errorLib={errorLib} />,
  );

  expect(view.container.querySelector(".summary-strip")?.textContent).toBe(
    "No problems — this config is accepted.",
  );
  expect(view.container.querySelectorAll(".problem-card")).toHaveLength(0);
});

it("gives each problem its own card, headed by severity, option and docs", async () => {
  const result = await panelFor(JSON.stringify({ automerge: "yes" }));
  const view = render(
    <MessagesPanel
      result={result}
      errorCount={result.errors.length}
      warningCount={result.warnings.length}
      errorLib={errorLib}
    />,
  );

  // The strip states the whole tab in one sentence, counts in ink.
  const strip = view.container.querySelector(".summary-strip");
  expect(strip?.textContent).toContain("1 error");
  expect(strip?.textContent).toContain("a real run would crash on the errors");
  expect(strip?.querySelector("strong")?.textContent).toBe("1 error");

  const cards = [...view.container.querySelectorAll<HTMLElement>(".problem-card")];
  expect(cards).toHaveLength(1);
  const card = cards[0];
  if (!card) {
    throw new Error("the run reported an error but rendered no card");
  }
  // Severity is a pill, not the colour of the whole paragraph.
  expect(within(card).getByText("error").className).toContain("pill-error");
  // The option the message names, straight off the 014 library.
  expect(card.querySelector(".problem-key")?.textContent).toBe("automerge");
  expect(card.querySelector<HTMLAnchorElement>(".problem-docs")?.href).toContain(
    "configuration-options",
  );
  // Renovate's own words are still there, unedited.
  expect(card.textContent).toContain("should be boolean");
  // …and this one has no automatic fix, which the card says rather than
  // leaving an empty space where a button would be.
  expect(card.textContent).toContain("No automatic fix");
  expect(within(card).queryByRole("button", { name: "Apply fix to editor" })).toBeNull();
});

it("renders a suggested edit as a unified diff behind one primary Apply button", async () => {
  const result = await panelFor(
    JSON.stringify({
      packageRules: [{ matchPackageNames: ["*", "lodash"], automerge: true }],
    }),
  );

  const onApplyFix = vi.fn();
  const view = render(
    <MessagesPanel
      result={result}
      errorCount={result.errors.length}
      warningCount={result.warnings.length}
      errorLib={errorLib}
      onApplyFix={onApplyFix}
    />,
  );

  const card = view.container.querySelector<HTMLElement>(".problem-card");
  if (!card) {
    throw new Error("the redundant-glob config reported no problem card");
  }
  expect(card.textContent).toContain("redundant");

  // Two lines, not an arrow: what goes, then what replaces it.
  const lines = [...card.querySelectorAll<HTMLElement>(".problem-diff-line")];
  expect(lines).toHaveLength(2);
  expect(lines[0]?.className).toContain("removed");
  expect(lines[0]?.textContent).toContain('"*"');
  expect(lines[1]?.className).toContain("added");
  expect(lines[1]?.textContent).not.toContain('"*"');

  // ONE primary button — the 075 standard, in place of 014's own ok-tinted one.
  const apply = within(card).getByRole("button", { name: "Apply fix to editor" });
  expect(apply.className).toContain("btn-primary");
  fireEvent.click(apply);
  expect(onApplyFix).toHaveBeenCalledTimes(1);
  expect(onApplyFix.mock.calls[0]?.[0]).toMatchObject({ path: expect.anything() });
});

/** The library is `null` until the engine chunk has loaded. The card must still
 *  render the message — degrading to "no explanation yet", never to nothing. */
it("renders the raw message before the translation library has loaded", async () => {
  const result = await panelFor(JSON.stringify({ automerge: "yes" }));
  const view = render(
    <MessagesPanel result={result} errorCount={1} warningCount={0} errorLib={null} />,
  );

  const card = view.container.querySelector<HTMLElement>(".problem-card");
  expect(card?.textContent).toContain("should be boolean");
  expect(card?.querySelector(".problem-key")).toBeNull();
  expect(card?.querySelector(".problem-docs")).toBeNull();
});
