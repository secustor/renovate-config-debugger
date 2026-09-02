import { useEffect, useState } from "react";
import { modalKeyboardOwned, overlayKeyboardOwned } from "@/lib/escape-stack";
import { isTextEditingTarget } from "@/lib/keyboard-target";
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
 * The target predicates that answer "is this typing?" live in
 * `@/lib/keyboard-target`, shared with the bare-key layer and Escape ladder.
 */

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

/** Scroll depth (px) past which the back-to-top affordance appears. */
const BACK_TO_TOP_THRESHOLD_PX = 480;

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
      // `keysLive` (`app/use-keyboard-landings.ts`); this hook takes no props,
      // so it asks the ladder's own modal flag instead of growing a second one.
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
 * mini-toolbar. Visible once the page has scrolled past
 * BACK_TO_TOP_THRESHOLD_PX.
 */
export function useBackToTopVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > BACK_TO_TOP_THRESHOLD_PX);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return visible;
}
