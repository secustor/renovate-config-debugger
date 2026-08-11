import { useEffect, useState } from "react";
import { modalKeyboardOwned } from "@/lib/escape-stack";

/**
 * Roadmap 016: `End` "lands on a blank over-scrolled viewport" (persona study
 * finding 7). Root cause: several cards nest their own scrollable box (the
 * preset tree, the preset detail panel, the effective config's key list —
 * each a fixed-`max-height`, `overflow: auto` region full of focusable
 * buttons). Browsers scroll the NEAREST SCROLLABLE ANCESTOR of the currently
 * focused element on Home/End, not the page — so after clicking a button
 * inside one of those boxes, Home/End silently scrolls that small box to its
 * own top/bottom instead of the page, which looks exactly like "nothing
 * happened" or "landed somewhere wrong" depending on where the box sits.
 * Fix: make the document the effective scroll container for Home/End
 * regardless of focus, the way a page with no nested scroll regions would
 * already behave — skipped for genuine text-editing contexts (inputs,
 * textareas, CodeMirror's contenteditable) where Home/End must keep moving
 * the text cursor, and for any modified key combo (e.g. shift-select).
 */
// `<input>` types that do NOT accept free text — a checkbox, radio or button
// input has no cursor and no type-ahead, so it must not count as "typing".
// Roadmap 067 reuses this predicate as the bare-key guard for `useShortcut`
// and `useTabDigits`: without this list, a focused filter checkbox
// (EffectiveConfig.tsx, PresetTree.tsx) silently swallowed `?`, `1`-`7` and
// `e`/`r` with no visible cause.
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * The narrow half: a rich-text surface — CodeMirror's contenteditable, or any
 * other `contenteditable` region — as opposed to a plain form control.
 *
 * Roadmap 067 needs the two apart. The Escape ladder must yield ONLY here,
 * because CodeMirror's `simplifySelection` runs on every press and neither
 * prevents the default nor stops propagating; a `<select>` or a text `<input>`
 * has no such handler, so the ladder is still free to dismiss a layer from one
 * (see `use-escape-layer.ts`). Home/End and the bare-key layer, meanwhile, need
 * the wide half below.
 */
export function isEditorTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target.closest(".cm-editor") !== null;
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (
    tag === "INPUT" &&
    !NON_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type.toLowerCase())
  ) {
    return true;
  }
  // A `<select>` has no free-text cursor either, but its native type-ahead
  // (jumping to an option by the letter typed) must keep winning over the
  // jump-layer bare keys — 067 documents this as deliberate.
  if (tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  // Roadmap 067 review: a NON-text input still counts when it sits INSIDE the
  // editor, which is why the branch above falls through here instead of
  // returning false. `basicSetup` installs `searchKeymap` and the `?` sheet
  // advertises ⌘F, and `@codemirror/search` renders its match-case, regexp and
  // by-word toggles as `<input type="checkbox">` within `.cm-editor` — so with
  // the search panel open and focus on one of them, End scrolled the whole page
  // (taking the editor off screen) and `1`–`7` switched the results tab and took
  // focus with it, abandoning the search in progress. The old `tag === "INPUT"`
  // short-circuit returned before this line, which is what kept it invisible.
  return isEditorTarget(target);
}

/**
 * Whether the browser MAY be drawing a popup of its own for this control —
 * today exactly a `<datalist>` combobox, which in this app is the simulator's
 * `datasource` and `manager` fields (047).
 *
 * "May", not "is": a native suggestion popup has no DOM presence, no CSS and no
 * events, so nothing in the page can ask whether it is open. It nevertheless
 * owns two keys while it is up, and they are two keys the app also wants —
 * Escape dismisses the suggestions, Enter accepts one. Since the state is
 * unknowable, the honest rule is to hand both keys to the control whenever a
 * popup COULD be there, and to pay for it in the one place it costs: from these
 * two fields Escape does not reach the Escape ladder (`use-escape-layer.ts`) and
 * Enter does not submit the form (`SimulatorForm.tsx`). Tabbing out of the field
 * restores both, and no other field in the app is affected — which is what
 * keeps the constraint round three established: Escape from a text field must
 * still dismiss a layer.
 *
 * A `<select>` is deliberately NOT counted, though its popup is just as
 * invisible. A select's list opens only on a deliberate act (Space, Alt+Down, or
 * 067's own `showPicker` on Enter) rather than as a side effect of typing, and
 * selects are everywhere in this app — counting them would recreate round one's
 * far-too-wide "yield to every form control" rule in order to cover a popup that
 * is almost never open when a key arrives.
 */
export function mayOwnNativePopup(target: EventTarget | null): boolean {
  // The ATTRIBUTE, not the resolved `list` element. The question is whether
  // this control is a combobox at all, and resolving the id would answer a
  // narrower one that buys nothing: `RegistryDatalist` renders its `<datalist>`
  // empty until the engine chunk arrives with the 81 datasource names, so a
  // resolved list is no evidence a popup can appear either.
  return target instanceof HTMLInputElement && target.hasAttribute("list");
}

export function useHomeEndPageScroll(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Home" && e.key !== "End") {
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }
      // Roadmap 067: a widget with its own Home/End semantics gets them. The
      // results tab strip is the first (ARIA tablist: Home/End = first/last
      // tab) and claims the key by calling `preventDefault`; anything that
      // doesn't claim it still scrolls the page, exactly as before.
      if (e.defaultPrevented) {
        return;
      }
      if (isTextEditingTarget(e.target)) {
        return;
      }
      // Roadmap 067: and a modal owns the keyboard outright. The `?` sheet's
      // rows overflow its `max-height` box, which `dialog:modal` makes
      // scrollable — so without this, End scrolled the INERT page behind the
      // dialog, the sheet's remaining rows stayed unreachable by a key the
      // sheet itself prints, and closing it revealed a page jumped to the
      // bottom. This is the gate `useShortcut` and `useTabDigits` get from
      // App's `keysLive`; this hook takes no props, so it asks the ladder's
      // own modal flag instead of growing a second one.
      if (modalKeyboardOwned()) {
        return;
      }
      e.preventDefault();
      window.scrollTo({
        top: e.key === "End" ? document.documentElement.scrollHeight : 0,
        behavior: "auto",
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/**
 * Roadmap 016: a back-to-top affordance for long results pages (persona
 * study finding 7) — the simpler, more robust alternative to a sticky
 * mini-toolbar. Visible once the page has scrolled past `threshold`.
 */
export function useBackToTopVisible(threshold = 480): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > threshold);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return visible;
}
