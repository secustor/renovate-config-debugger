import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimModalKeyboard, ESCAPE_PRIORITY, pushEscapeLayer } from "@/lib/escape-stack";
import { isTextEditingTarget, mayOwnNativePopup, useHomeEndPageScroll } from "./scroll-ergonomics";

/**
 * Roadmap 068 — `isTextEditingTarget` is shared by the 016 Home/End page-scroll
 * guard and the bare-key jump layer (`useShortcut`, `useTabDigits`), and
 * `mayOwnNativePopup` is what the Escape ladder yields to. Both need real DOM
 * elements (`instanceof HTMLElement`, `.tagName`, `.closest`), which the
 * node-environment `unit` project doesn't have — hence `.test.tsx` here, to land
 * in the jsdom `render` project.
 *
 * The editor half is module-private and is exercised through
 * `isTextEditingTarget`, its only caller — see the note on it.
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
    // Roadmap 068 regression: a focused filter checkbox (EffectiveConfig.tsx,
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

  it("counts a NON-text input inside the editor — the search panel's toggles", () => {
    // Roadmap 068 review: `basicSetup` installs `searchKeymap` and the sheet
    // advertises ⌘F, and `@codemirror/search` renders match-case, regexp and
    // by-word as checkboxes INSIDE `.cm-editor`. Without falling through to the
    // editor check, End scrolled the editor off screen and `1`-`7` switched the
    // results tab while the user was mid-search.
    const cmRoot = document.createElement("div");
    cmRoot.className = "cm-editor";
    const toggle = input("checkbox");
    cmRoot.appendChild(toggle);
    expect(isTextEditingTarget(toggle)).toBe(true);
    // …and the same checkbox outside the editor still isn't typing, which is
    // the filter-checkbox case above.
    expect(isTextEditingTarget(input("checkbox"))).toBe(false);
  });

  it("counts the CodeMirror editor and its descendants as typing", () => {
    // `isContentEditable` itself is jsdom's own concern (unsupported in this
    // jsdom version, which is a jsdom limitation, not app behavior) — the
    // `.cm-editor` ancestor check below is what this codebase can assert.
    const cmRoot = document.createElement("div");
    cmRoot.className = "cm-editor";
    const cmChild = document.createElement("div");
    cmRoot.appendChild(cmChild);
    expect(isTextEditingTarget(cmChild)).toBe(true);
    expect(isTextEditingTarget(cmRoot)).toBe(true);
  });

  it("rejects non-element targets and plain elements", () => {
    expect(isTextEditingTarget(null)).toBe(false);
    expect(isTextEditingTarget(document.createElement("button"))).toBe(false);
    expect(isTextEditingTarget(window)).toBe(false);
  });
});

describe("mayOwnNativePopup", () => {
  it("counts an input wired to a datalist, whose popup the page cannot see", () => {
    // The simulator's `datasource` / `manager` fields (047). Escape there
    // dismisses the native suggestions and Enter accepts one, so the Escape
    // ladder and the form both stand aside rather than guess whether the popup
    // is up — nothing in the page can find out.
    const el = input("text");
    el.setAttribute("list", "datasources");
    expect(mayOwnNativePopup(el)).toBe(true);
  });

  it("counts nothing else — a plain field's Escape still reaches the ladder", () => {
    // The constraint round three established: yielding for "any text input" is
    // what left the return pill and the session menu undismissable from a form
    // field. A `<select>` is excluded deliberately too: its popup opens only on
    // a deliberate act, never as a side effect of typing.
    expect(mayOwnNativePopup(input("text"))).toBe(false);
    expect(mayOwnNativePopup(document.createElement("select"))).toBe(false);
    expect(mayOwnNativePopup(document.createElement("textarea"))).toBe(false);
    expect(mayOwnNativePopup(null)).toBe(false);
    expect(mayOwnNativePopup(window)).toBe(false);
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
    // Roadmap 068: with the `?` sheet open, End belongs to the sheet's own
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

  it("claims the key and scrolls nothing while a popover or menu is up", () => {
    // 2026-08-11 review: the same gate `e`, `r` and `1`–`7` take. CLAIMED,
    // unlike the modal case above — a popover scrolls nothing itself, so
    // merely declining End would hand the page scroll straight back to the
    // browser's default.
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HomeEndHarness />);
    const release = pushEscapeLayer(() => undefined, ESCAPE_PRIORITY.popover);

    const claimed = !fireEvent.keyDown(window, { key: "End" });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(claimed).toBe(true);

    release();
    fireEvent.keyDown(window, { key: "End" });
    expect(scrollTo).toHaveBeenCalledOnce();
    scrollTo.mockRestore();
  });

  it("scrolls the PANE the gesture was made in, not the page (roadmap 075)", () => {
    // The v2 shell's panes are the scrollers and the document does not move at
    // all, so the rule 016 wrote down — Home/End move the surface the reader is
    // reading — has to name that surface rather than always the page.
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HomeEndHarness />);
    const pane = document.createElement("div");
    pane.className = "results-col";
    const button = document.createElement("button");
    pane.appendChild(button);
    document.body.appendChild(pane);
    // jsdom lays nothing out, so the "is there anything to scroll?" test has to
    // be answered explicitly — which is also the case this asserts: a pane that
    // overflows takes the key.
    Object.defineProperty(pane, "scrollHeight", { configurable: true, value: 2_000 });
    Object.defineProperty(pane, "clientHeight", { configurable: true, value: 500 });

    fireEvent.keyDown(button, { key: "End" });
    expect(pane.scrollTop).toBe(2_000);
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: "Home" });
    expect(pane.scrollTop).toBe(0);
    expect(scrollTo).not.toHaveBeenCalled();

    // A pane with nothing to scroll is not a target: the key falls through to
    // the document rather than doing nothing at all.
    Object.defineProperty(pane, "scrollHeight", { configurable: true, value: 500 });
    fireEvent.keyDown(button, { key: "End" });
    expect(scrollTo).toHaveBeenCalledOnce();

    pane.remove();
    scrollTo.mockRestore();
  });

  it("keeps scrolling under an ambient layer — the simulator's return pill", () => {
    // The rank is the whole reason this asks `overlayKeyboardOwned()` rather
    // than "is any layer open": the pill is furniture to read past and stays up
    // for a whole navigation detour.
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<HomeEndHarness />);
    const release = pushEscapeLayer(() => undefined, ESCAPE_PRIORITY.ambient);

    fireEvent.keyDown(window, { key: "End" });
    expect(scrollTo).toHaveBeenCalledOnce();

    release();
    scrollTo.mockRestore();
  });
});
