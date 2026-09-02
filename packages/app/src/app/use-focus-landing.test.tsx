import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type FocusLanding, useFocusLanding } from "./use-focus-landing";

/**
 * Roadmap 068, 2026-08-11 review — the hook's own half of the landing rules:
 * WHICH `input` events count as "the config being run has changed since".
 * `lib/focus-landing.test.ts` covers the decisions themselves; this covers the
 * document listener that feeds them, which needs real elements (`instanceof
 * Element`, `.closest`) and so lands in the jsdom `render` project.
 */

function mount(): FocusLanding {
  return renderHook(() => useFocusLanding()).result.current;
}

/**
 * Arms a landing from `from`, then types into `target` — focusing it first,
 * since that is what typing into a form control entails and is exactly what the
 * focus half of `landingWanted` reads. Reports whether the landing still ran.
 * `budgetMs: 0` with `thisFrame` keeps it synchronous: the target already exists.
 */
function landsAfterTypingIn(target: HTMLElement, from: HTMLElement): boolean {
  const api = mount();
  from.focus();
  const ticket = api.arm();
  target.focus();
  fireEvent.input(target);
  const land = vi.fn();
  api.whenReady({ ticket, find: () => from, land, budgetMs: 0, thisFrame: true });
  return land.mock.calls.length > 0;
}

/** A field, in the document and focusable — which is what makes typing in it
 *  visible to the focus test the way CodeMirror's caret is not. */
function fieldIn(parent: HTMLElement, tag: "input" | "textarea", className = ""): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  parent.appendChild(el);
  return el;
}

function editorContent(): HTMLElement {
  const root = document.createElement("div");
  root.className = "cm-editor";
  document.body.appendChild(root);
  const content = document.createElement("div");
  content.className = "cm-content";
  // jsdom has no contenteditable support, and it is beside the point here: what
  // the listener asks is whether the event came from inside `.cm-editor`.
  content.tabIndex = -1;
  root.appendChild(content);
  return content;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useFocusLanding", () => {
  it("abandons the landing when the editor's document was typed into", () => {
    // The case the counter exists for: ⌘⇧⏎ from the editor, then a character
    // while the run resolves. Focus never moved, so this is the only signal.
    const content = editorContent();
    expect(landsAfterTypingIn(content, content)).toBe(false);
  });

  it("abandons it when a 008 layer box was typed into — same run, same staleness", () => {
    // `globalConfig` / `inheritedConfig` are part of the run App assembles
    // (`lib/run-inputs.ts`), so an edit there dates the results exactly as an
    // edit to the config document does.
    const layer = fieldIn(document.body, "textarea", "layer-editor");
    expect(landsAfterTypingIn(layer, layer)).toBe(false);
  });

  it("keeps it when the typing was not the config the run describes", () => {
    // 2026-08-11 review: the simulator's `packageName`, the repo-load form's
    // repo box, a host field — none of them is text any run read, and cancelling
    // on them degraded ⌘⇧⏎ to a plain ⌘⏎ with nothing said. Armed FROM the field
    // and typed into without leaving, which is the only shape the focus test
    // cannot already see.
    const depField = fieldIn(document.body, "input");
    expect(landsAfterTypingIn(depField, depField)).toBe(true);
  });

  it("still stands down when the user moved to another field to type", () => {
    // The reviewer's own repro path, and it needs no counter: putting focus in
    // the dep field is what `landingWanted`'s focus test reads.
    const editor = editorContent();
    const depField = fieldIn(document.body, "input");
    expect(landsAfterTypingIn(depField, editor)).toBe(false);
  });

  it("keeps counting a pointer press anywhere — that question is not about text", () => {
    const api = mount();
    const ticket = api.arm();
    fireEvent.pointerDown(document.body);
    const land = vi.fn();
    api.whenReady({
      ticket,
      find: () => document.body,
      land,
      budgetMs: 0,
      thisFrame: true,
    });
    expect(land).not.toHaveBeenCalled();
  });
});
