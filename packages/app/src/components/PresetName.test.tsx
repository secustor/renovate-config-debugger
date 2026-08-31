import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordClipboardWrites } from "@tools/test/clipboard";
import { presetNodeById as node } from "@tools/test/preset-nodes";
import { ROOT_NODE_ID } from "@/lib/preset-tree-stats";
import { HOVER_INTENT_DELAY_MS } from "./hover-gate";
import { PresetName } from "./PresetName";
import { PresetReferenceProvider } from "./preset-reference-context";

/**
 * Roadmap 081: the one preset token, and the one card behind it.
 *
 * The chain and the counts are derived by `lib/preset-reference.ts` and pinned
 * there; what this file covers is everything that only exists once the token is
 * on a page — that both shapes render the same token, that the card opens on
 * intent rather than on contact, that it never repeats the name of the token it
 * is anchored to, and that its tree link goes through the app's navigation
 * after closing the card it was clicked in.
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** root → config:recommended → group:monorepos → monorepo:react */
const DEEP = node("p4", "monorepo:react");
const GROUP = node("p3", "group:monorepos", [DEEP]);
const RECOMMENDED = node("p1", "config:recommended", [node("p2", ":dependencyDashboard"), GROUP]);
const TREE = node(ROOT_NODE_ID, "(your config)", [RECOMMENDED]);

function renderToken(props: {
  name: string;
  nodeId?: string;
  onClick?: () => void;
  showCopy?: boolean;
}) {
  const onSelectPreset = vi.fn();
  const view = render(
    <PresetReferenceProvider value={{ root: TREE, onSelectPreset }}>
      <PresetName {...props} />
    </PresetReferenceProvider>,
  );
  return { ...view, onSelectPreset };
}

/** A genuine pointer hover: the move gate wants a `mousemove`, and 081's
 *  hover-intent delay wants the pointer to still be there afterwards. */
function hover(anchor: HTMLElement) {
  fireEvent.mouseEnter(anchor);
  fireEvent.mouseMove(anchor);
}

function card(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".preset-ref-card");
}

describe("the token itself", () => {
  it("is an inert <code> with no handler, and a button with one", () => {
    const { container } = renderToken({ name: "config:recommended", nodeId: "p1" });
    const inert = container.querySelector("code.preset-token");
    expect(inert?.textContent).toBe("config:recommended");
    // Inert tokens render inside other buttons (the ledger's header toggle), so
    // they must not be focusable — that would be a tab stop inside a control.
    expect(inert?.hasAttribute("tabindex")).toBe(false);

    cleanup();
    const onClick = vi.fn();
    const clickable = renderToken({ name: "config:recommended", nodeId: "p1", onClick });
    fireEvent.click(clickable.getByRole("button", { name: "config:recommended" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(clickable.container.querySelector("button.preset-token")).not.toBeNull();
  });
});

describe("the standard hover card", () => {
  it("waits for hover intent before opening, and drops a hover that leaves", () => {
    const { getByRole } = renderToken({
      name: "config:recommended",
      nodeId: "p1",
      onClick: vi.fn(),
    });
    const anchor = getByRole("button", { name: "config:recommended" });

    hover(anchor);
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_DELAY_MS - 1);
    });
    expect(card()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(card()).not.toBeNull();

    cleanup();
    const again = renderToken({ name: "config:recommended", nodeId: "p1", onClick: vi.fn() });
    const second = again.getByRole("button", { name: "config:recommended" });
    hover(second);
    fireEvent.mouseLeave(second);
    act(() => {
      vi.advanceTimersByTime(HOVER_INTENT_DELAY_MS);
    });
    expect(card()).toBeNull();
  });

  it("opens on keyboard focus without the pointer's delay", () => {
    const { getByRole } = renderToken({
      name: "config:recommended",
      nodeId: "p1",
      onClick: vi.fn(),
    });

    fireEvent.focus(getByRole("button", { name: "config:recommended" }));

    expect(card()).not.toBeNull();
  });

  it("states a top-level extend's chain and what it drags in", () => {
    const { getByRole } = renderToken({
      name: "config:recommended",
      nodeId: "p1",
      onClick: vi.fn(),
    });
    fireEvent.focus(getByRole("button", { name: "config:recommended" }));

    const body = card();
    expect(body?.textContent).toContain("via");
    expect(body?.querySelector(".pill-accent")?.textContent).toBe("repo config");
    expect(body?.querySelector(".preset-ref-self")?.textContent).toBe("this preset");
    expect(body?.querySelector(".preset-ref-counts")?.textContent).toBe(
      "extends 2 presets directly, 3 after nesting · deepest chain 2 levels",
    );
  });

  it("walks the real ancestry of a nested preset, and never repeats its own name", () => {
    const { getByRole } = renderToken({ name: "monorepo:react", nodeId: "p4", onClick: vi.fn() });
    fireEvent.focus(getByRole("button", { name: "monorepo:react" }));

    const body = card();
    const chips = [...(body?.querySelectorAll(".preset-ref-via .pill") ?? [])].map(
      (el) => el.textContent,
    );
    expect(chips).toEqual(["repo config", "config:recommended", "group:monorepos"]);
    // The design's rule, and the reason the chain stops at the parent.
    expect(body?.textContent).not.toContain("monorepo:react");
    expect(body?.querySelector(".preset-ref-counts")?.textContent).toBe(
      "extends nothing — a leaf of the expansion",
    );
  });

  it("links into the tree through the app's own navigation, closing itself first", () => {
    const { getByRole, onSelectPreset } = renderToken({
      name: "group:monorepos",
      nodeId: "p3",
      onClick: vi.fn(),
    });
    fireEvent.focus(getByRole("button", { name: "group:monorepos" }));

    fireEvent.click(getByRole("button", { name: "show the full tree →" }));

    expect(onSelectPreset).toHaveBeenCalledWith("p3");
    // A pointer-opened card has no blur to take it down, and the click switches
    // tabs out from under it.
    expect(card()).toBeNull();
  });

  it("has no card for a name with no node behind it", () => {
    const { getByRole } = renderToken({ name: "github>acme/private", onClick: vi.fn() });

    fireEvent.focus(getByRole("button", { name: "github>acme/private" }));

    expect(card()).toBeNull();
  });
});

describe("the hover-copy affordance", () => {
  // Real timers here: the shared `CopyButton`'s own copied-state timing is
  // already pinned in `CopyButton.test.tsx`, and driving its async clipboard
  // write plus its transient-state flush through fake timers (needed by the
  // hover-intent tests above) would fight `waitFor`'s own polling.
  beforeEach(() => {
    vi.useRealTimers();
  });

  // This token's own contract is WHAT reaches the clipboard: the full name,
  // not the shortened text on screen. How long the button then reads "copied"
  // is `CopyButton`'s, pinned in its own test — re-asserting the revert here
  // cost a real 1.6s sleep for a claim this component does not make.
  it("copies the full name, not the shortened text on screen", async () => {
    const writes = recordClipboardWrites();
    const { getByRole } = renderToken({ name: "github>acme/renovate-config:security" });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Copy preset name" }));
    });

    expect(writes).toEqual(["github>acme/renovate-config:security"]);
    await waitFor(() => {
      expect(getByRole("button", { name: "Copy preset name" }).className).toContain("copied");
    });
  });

  it("does not trigger the token's own click behavior", async () => {
    recordClipboardWrites();
    const onClick = vi.fn();
    const { getByRole } = renderToken({ name: "config:recommended", nodeId: "p1", onClick });

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Copy preset name" }));
    });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("is off where the caller says the token sits inside another button", () => {
    const { queryByRole } = renderToken({
      name: "config:recommended",
      nodeId: "p1",
      showCopy: false,
    });

    expect(queryByRole("button", { name: "Copy preset name" })).toBeNull();
  });
});
