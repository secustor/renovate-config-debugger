import { useEffect, useState } from "react";
import { modalKeyboardOwned, overlayKeyboardOwned } from "@/lib/escape-stack";
import { anyModifierHeld } from "@/lib/shortcuts";

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
// Roadmap 068 reuses this predicate as the bare-key guard for `useShortcut`
// and `useTabDigits`: without this list, a focused filter checkbox
// (EffectiveToolbar.tsx, PresetTree.tsx) silently swallowed `?`, `1`-`7` and
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
 * Module-private, because the consumer it was split out for is gone. 068 wrote
 * it as the ONE target the Escape ladder would yield to, and round three deleted
 * that call: the ladder reads `defaultPrevented` instead, which CodeMirror sets
 * on exactly the Escapes it acts on (`use-escape-layer.ts` records where that
 * was verified). Its one caller now is `isTextEditingTarget` below, which asks
 * it twice over — for the contenteditable itself, and for the non-text controls
 * the search panel renders inside it.
 */
function isEditorTarget(target: EventTarget | null): boolean {
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
  // jump-layer bare keys — 068 documents this as deliberate.
  if (tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  // Roadmap 068 review: a NON-text input still counts when it sits INSIDE the
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
 * 068's own `showPicker` on Enter) rather than as a side effect of typing, and
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

/**
 * Roadmap 075: the surface Home/End belongs to.
 *
 * The rule 016 wrote down is unchanged — Home/End move the surface the reader
 * is reading, never whichever small `overflow: auto` box happens to hold focus.
 * What changed is that in the v2 shell that surface is not always the document:
 * the two panes scroll themselves and the page does not scroll at all. So the
 * key goes to the PANE the gesture was made in, and to the document everywhere
 * else — the landing, the stacked layout below ~60rem, and any gesture made
 * outside a pane, all of which still scroll the page exactly as before.
 *
 * A pane that has nothing to scroll is not a target: on a short config the left
 * pane fits its content, and End inside it would otherwise do nothing at all
 * rather than fall through to the document, which is the "nothing happened"
 * outcome this hook exists to eliminate.
 */
const PANE_SELECTOR = ".config-col, .results-col";

function scrollablePaneFor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const pane = target.closest<HTMLElement>(PANE_SELECTOR);
  if (!pane || pane.scrollHeight <= pane.clientHeight) {
    return null;
  }
  return pane;
}

export function useHomeEndPageScroll(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Home" && e.key !== "End") {
        return;
      }
      // Shift+Home/End extends a selection and Ctrl+Home/End is the
      // Windows/Linux page-scroll convention — the shared predicate the results
      // tab strip's own arrow/Home/End handler asks too, so the two halves of
      // "who gets Home/End" cannot come apart.
      if (anyModifierHeld(e)) {
        return;
      }
      // Roadmap 068: a widget with its own Home/End semantics gets them. The
      // results tab strip is the first (ARIA tablist: Home/End = first/last
      // tab) and claims the key by calling `preventDefault`; anything that
      // doesn't claim it still scrolls the page, exactly as before.
      if (e.defaultPrevented) {
        return;
      }
      if (isTextEditingTarget(e.target)) {
        return;
      }
      // Roadmap 068: and a modal owns the keyboard outright. The `?` sheet's
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
      // Roadmap 068 review: and so does a popover or menu — the gate `e`, `r`
      // and `1`–`7` already take (`overlayKeyboardOwned`), for the reason they
      // take it: a key must not move the page under a layer the reader is
      // looking at. The rule-evidence card pays for it twice, since it
      // re-anchors on every scroll rather than closing: End scrolled its
      // `packageRules[N]` reference off the top of the window, and the card
      // followed it off screen.
      //
      // CLAIMED and then dropped, where the modal above stands aside — and the
      // difference is who would scroll if this declined the key. A modal
      // `<dialog>` is itself the scroll container the browser reaches for (the
      // `?` sheet's own overflowing rows), so declining hands End to the right
      // target. A popover or menu scrolls nothing: the evidence card is
      // `position: fixed` and the session menu `position: absolute` in the
      // header, so the browser would fall back to whatever scrollable box
      // happens to hold focus — the document, or one of the nested boxes this
      // hook exists to override.
      //
      // `ambient` is not an overlay: the simulator's return pill is furniture
      // to read past, and it stays up for a whole navigation detour (see
      // `overlayKeyboardOwned`), so page scroll keeps working under it.
      if (overlayKeyboardOwned()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const pane = scrollablePaneFor(e.target);
      if (pane) {
        pane.scrollTop = e.key === "End" ? pane.scrollHeight : 0;
        return;
      }
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
