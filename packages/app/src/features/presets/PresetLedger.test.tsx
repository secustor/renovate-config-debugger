import type { PresetNode } from "@renovate-config-debugger/engine";
import { fireEvent, render, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PresetLedger } from "./PresetLedger";
import { presetNode as node, presetRoot as root } from "@tools/test/preset-nodes";

/**
 * Roadmap 082: the ledger's health box in its FAILED state — the one shape a
 * real offline run can never produce (nothing is fetched, so nothing fails),
 * which is why it is rendered here over a hand-built tree instead. What it
 * pins is the box's contract: the count and the docs link are readable with it
 * shut, the rows appear on the caret, and the 009 auth hint is on the header
 * line rather than buried in the expansion.
 */

function ledger(tree: PresetNode, onOpenNode = vi.fn()) {
  return {
    onOpenNode,
    view: render(<PresetLedger root={tree} onOpenTree={() => undefined} onOpenNode={onOpenNode} />),
  };
}

it("names the failed presets, and says which of them a sign-in would reach", () => {
  const { view, onOpenNode } = ledger(
    root([
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

  // The strip's error count is a pill, not prose (082).
  const strip = view.container.querySelector(".summary-strip");
  expect(strip?.querySelector(".pill-error")?.textContent).toBe("1 error");

  // Shut, the box still carries the count, the cache line, the sign-in hint
  // and the docs link.
  const box = view.container.querySelector<HTMLElement>(".ledger-health.failed");
  if (!box) {
    throw new Error("a failed expansion rendered no health box");
  }
  expect(box.textContent).toContain("✗ 1 error");
  expect(box.textContent).toContain("repeat occurrences served from cache");
  expect(box.textContent).toContain("signing in would reach the private ones");
  expect(within(box).getByRole("link", { name: "docs ↗" }).getAttribute("href")).toBe(
    "https://docs.renovatebot.com/config-presets/",
  );
  expect(box.querySelector(".ledger-error-rows")).toBeNull();

  // The caret opens the rows: the preset, the message, and where it came from.
  const toggle = within(box).getByRole("button", { expanded: false });
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const row = box.querySelector<HTMLElement>(".ledger-error-row");
  expect(row?.textContent).toContain("github>me/presets:security");
  expect(row?.textContent).toContain("Cannot find preset's package");
  expect(row?.querySelector(".ledger-error-via")?.textContent).toBe("via your preset");

  // And the row's token is the standard cross-link into the tree.
  fireEvent.click(within(row ?? box).getByRole("button", { name: "github>me/presets:security" }));
  expect(onOpenNode).toHaveBeenCalledTimes(1);
});

it("says a mistyped extends entry is the reader's own, and drops the auth hint", () => {
  const { view } = ledger(
    root([node("config:recomended", { state: "error", error: "preset not found" })]),
  );

  const box = view.container.querySelector<HTMLElement>(".ledger-health.failed");
  if (!box) {
    throw new Error("a failed expansion rendered no health box");
  }
  // Nothing here is sign-in-fixable, so the hint stays off.
  expect(box.textContent).not.toContain("signing in");
  fireEvent.click(within(box).getByRole("button", { expanded: false }));
  expect(box.querySelector(".ledger-error-via")?.textContent).toBe("in your config");
});

it("keeps the clean run's one-line strip", () => {
  const { view } = ledger(root([node("config:recommended")]));
  expect(view.container.querySelector(".ledger-health.failed")).toBeNull();
  expect(view.container.querySelector(".ledger-health")?.textContent).toContain(
    "Nothing failed, nothing redundant",
  );
  expect(view.container.querySelector(".summary-strip .pill-error")).toBeNull();
});
