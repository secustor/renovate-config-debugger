import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimModalKeyboard } from "@/lib/escape-stack";
import { isEditorTarget, isTextEditingTarget, useHomeEndPageScroll } from "./scroll-ergonomics";

/**
 * Roadmap 067 — `isTextEditingTarget` is shared by the 016 Home/End page-scroll
 * guard and the bare-key jump layer (`useShortcut`, `useTabDigits`), and
 * `isEditorTarget` is the narrow half of it that the Escape ladder yields to.
 * Both need real DOM elements (`instanceof HTMLElement`, `.tagName`,
 * `.closest`), which the node-environment `unit` project doesn't have — hence
 * `.test.tsx` here, to land in the jsdom `render` project.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

function input(type?: string): HTMLInputElement {
  const el = document.createElement("input");
  if (type !== undefined) {
    el.type = type;
  }
  return el;
}

describe("isTextEditingTarget", () => {
  it("counts a free-text input as typing", () => {
    expect(isTextEditingTarget(input())).toBe(true); // no `type` = "text"
    expect(isTextEditingTarget(input("text"))).toBe(true);
    expect(isTextEditingTarget(input("password"))).toBe(true);
    expect(isTextEditingTarget(input("search"))).toBe(true);
    expect(isTextEditingTarget(input("email"))).toBe(true);
  });

  it("does NOT count a checkbox, radio or other non-text input as typing", () => {
    // Roadmap 067 regression: a focused filter checkbox (EffectiveConfig.tsx,
    // PresetTree.tsx) must not silently swallow `?`, `1`-`7` or `e`/`r`.
    expect(isTextEditingTarget(input("checkbox"))).toBe(false);
    expect(isTextEditingTarget(input("radio"))).toBe(false);
    expect(isTextEditingTarget(input("button"))).toBe(false);
    expect(isTextEditingTarget(input("submit"))).toBe(false);
    expect(isTextEditingTarget(input("range"))).toBe(false);
    expect(isTextEditingTarget(input("color"))).toBe(false);
  });

  it("keeps a checkbox eligible for the 016 Home/End page-scroll behaviour", () => {
    // Same predicate, opposite consumer: `useHomeEndPageScroll` bails out when
    // this returns true, so a focused checkbox must let Home/End scroll the
    // page rather than do nothing.
    expect(isTextEditingTarget(input("checkbox"))).toBe(false);
  });

  it("still counts textarea and select as typing", () => {
    expect(isTextEditingTarget(document.createElement("textarea"))).toBe(true);
    // A `<select>`'s native type-ahead must keep beating the bare-key layer.
    expect(isTextEditingTarget(document.createElement("select"))).toBe(true);
  });

  it("counts a descendant of the CodeMirror editor as typing", () => {
    // `isContentEditable` itself is jsdom's own concern (unsupported in this
    // jsdom version, which is a jsdom limitation, not app behavior) — the
    // `.cm-editor` ancestor check below is what this codebase can assert.
    const cmRoot = document.createElement("div");
    cmRoot.className = "cm-editor";
    const cmChild = document.createElement("div");
    cmRoot.appendChild(cmChild);
    expect(isTextEditingTarget(cmChild)).toBe(true);
  });

  it("rejects non-element targets and plain elements", () => {
    expect(isTextEditingTarget(null)).toBe(false);
    expect(isTextEditingTarget(document.createElement("button"))).toBe(false);
    expect(isTextEditingTarget(window)).toBe(false);
  });
});

describe("isEditorTarget", () => {
  it("counts the CodeMirror editor, whose Escape cannot be intercepted", () => {
    const cmRoot = document.createElement("div");
    cmRoot.className = "cm-editor";
    const cmChild = document.createElement("div");
    cmRoot.appendChild(cmChild);
    expect(isEditorTarget(cmChild)).toBe(true);
    expect(isEditorTarget(cmRoot)).toBe(true);
  });

  it("does NOT count form controls, so a layer stays dismissible from one", () => {
    // The regression this predicate exists to end: the Escape ladder yielded to
    // every text input and `<select>`, so the return pill could not be
    // dismissed while the caret sat in `packageName`, and the session menu
    // could not be closed from a filter select.
    expect(isEditorTarget(input())).toBe(false);
    expect(isEditorTarget(input("search"))).toBe(false);
    expect(isEditorTarget(document.createElement("textarea"))).toBe(false);
    expect(isEditorTarget(document.createElement("select"))).toBe(false);
    expect(isEditorTarget(null)).toBe(false);
    expect(isEditorTarget(window)).toBe(false);
  });
});

function HomeEndHarness() {
  useHomeEndPageScroll();
  return null;
}

describe("useHomeEndPageScroll", () => {
  it("scrolls the page on End", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HomeEndHarness />);

    fireEvent.keyDown(window, { key: "End" });
    expect(scrollTo).toHaveBeenCalledOnce();
    scrollTo.mockRestore();
  });

  it("stands aside while a modal owns the keyboard", () => {
    // Roadmap 067: with the `?` sheet open, End belongs to the sheet's own
    // overflowing row list. Scrolling here would move the INERT page behind the
    // dialog, and `preventDefault` would stop the dialog scrolling at all.
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HomeEndHarness />);
    const release = claimModalKeyboard();

    const claimed = !fireEvent.keyDown(window, { key: "End" });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(claimed).toBe(false);

    release();
    fireEvent.keyDown(window, { key: "Home" });
    expect(scrollTo).toHaveBeenCalledOnce();
    scrollTo.mockRestore();
  });
});
