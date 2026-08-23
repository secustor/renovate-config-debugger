import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { type AnchorRect, anchorRectOf, type AnchorSource } from "@/lib/anchored-card";
import { overlayKeyboardOwned } from "@/lib/escape-stack";

/**
 * The hover/focus behavior behind every floating card the app anchors to a
 * piece of text: the glossary's `Term`/`Explained` (016), and — roadmap 069
 * PR 5 — the attribution card on a `description` string in a JSON view.
 *
 * Hoisted out of `components/glossary.tsx` rather than copied: the singleton
 * below and the Escape ruling underneath it are the whole interaction contract,
 * and a second card type with its own copy of them would be a second contract.
 * The hook owns WHEN a card is up; what the card says is the caller's.
 *
 * A separate FILE from `hover-card.tsx`, colocated with it: a component module
 * that also exports a hook breaks Fast Refresh
 * (`react/only-export-components`), and the split is about the module, not the
 * folder — so the pair sits together, `-hooks` naming the half that holds the
 * behavior. The same split `option-docs.tsx` / `option-docs-hooks.ts` makes.
 */

/** Module-level singleton so only one hover card is ever open — of any kind. */
let activeHide: (() => void) | null = null;

/**
 * How long after a card opens a scroll is read as the SHOW's own scroll rather
 * than the reader's (see the scroll effect below). Long enough to cover the
 * `scrollIntoView` a browser fires when Tab lands on a partly-off-screen
 * anchor — which is queued before the card even paints — and short enough that
 * a wheel the reader turns right after hovering still takes the card down: a
 * wheel gesture emits events for far longer than this.
 *
 * Wall-clock rather than a frame count so it holds in a background tab (where
 * `requestAnimationFrame` does not run) and stays trivially testable with fake
 * timers.
 */
export const SHOW_SCROLL_GRACE_MS = 150;

function sameRect(a: AnchorRect, b: AnchorRect): boolean {
  return a.left === b.left && a.top === b.top && a.bottom === b.bottom;
}

export interface HoverCardControls {
  /** The anchor's viewport box while a card is up; `null` when none is. */
  anchor: AnchorRect | null;
  show: (el: AnchorSource) => void;
  hide: () => void;
  hideNow: () => void;
  cancelHide: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Shared hover/focus behavior for an element that explains itself with a
 * floating card. A grace period lets the pointer travel into the card (to click
 * a link inside it) without it vanishing.
 */
export function useHoverCard(): HoverCardControls {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  // The anchor ITSELF, not just the box it had: a scroll inside the grace
  // window re-reads it (see the scroll effect), which a stored rect cannot do.
  const anchorEl = useRef<AnchorSource | null>(null);
  const shownAt = useRef(0);

  const hideNow = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    anchorEl.current = null;
    setAnchor(null);
  }, []);

  const show = useCallback(
    (el: AnchorSource) => {
      if (activeHide && activeHide !== hideNow) {
        activeHide();
      }
      activeHide = hideNow;
      window.clearTimeout(hideTimer.current);
      anchorEl.current = el;
      shownAt.current = Date.now();
      // Same box as last time is the same card: the delegated diff hover
      // re-shows on every qualifying pointer move across ONE token, and a fresh
      // rect object there would re-render the card per move.
      const next = anchorRectOf(el);
      setAnchor((prev) => (prev && sameRect(prev, next) ? prev : next));
    },
    [hideNow],
  );

  const hide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setAnchor(null), 250);
  }, []);

  const cancelHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
  }, []);

  // Roadmap 068: an element-scoped Escape that ACTS must claim the key from the
  // ladder, or one press hides this card AND pops the topmost ladder layer —
  // typically the simulator's return pill, which the reader cannot even see from
  // here. With no card up there is nothing to claim, and the key belongs to the
  // ladder.
  //
  // `preventDefault`, NOT `stopPropagation`, and the difference is the whole
  // rule. Both stop the ladder (its document listener bails on
  // `defaultPrevented`), but React's `stopPropagation` also ends the native
  // event's journey at the root container, so it takes the press away from every
  // ANCESTOR element handler too — and this card can be inside one. A `Term`
  // renders in the repo-load panel, whose `<form>` closes the panel on Escape;
  // focusing that term always opens a card, so claiming by propagation left the
  // user pressing Escape twice to cancel a panel they had asked to cancel once.
  // Preventing the default claims exactly the listener that reads it and leaves
  // the ancestor free to act on the same press, which is the contract the editor
  // already keeps (see `lib/escape-stack.ts`).
  //
  // The other half, which the review after it found: a card the user did not
  // open cannot outrank a layer they did. This card opens on FOCUS, so Tabbing
  // onto a `ProvenanceChip` inside an open rule-evidence popover ALWAYS has one
  // up — claiming there made the popover undismissable by keyboard, every press
  // stopping at the tooltip. So the rule is not "act whenever there is a card"
  // but "act only when this card is the topmost thing between the reader and the
  // page": `overlayKeyboardOwned()` reports exactly when it is not (a popover or
  // a menu is over the page), and there the press goes to the ladder, which
  // dismisses the layer the user chose to open — and usually the anchor with it.
  //
  // The RANK is the right question here, and the ninth review pushed back on it:
  // `ambient` is excluded, so with the simulator return pill up a reader walking
  // a thread — who has a focus-opened tooltip at most stops — needs two presses
  // to dismiss the pill. That cost is real and it is the lesser one. Widening
  // this to "any layer at all" was tried and reverted: it means a press aimed at
  // the tooltip the reader is looking at instead destroys a pill they cannot see
  // from here, leaving the tooltip up — an invisible destructive action, which is
  // exactly what the sixth review fixed. A wasted keystroke is recoverable; a
  // silently destroyed way back is not. The two tests in `glossary.test.tsx` pin
  // both directions. That is the same ranking the ladder itself applies, asked
  // rather than joined: registering this card as a layer would make it a stack
  // entry that pushes and releases on every hover, and Escape would then dismiss
  // a card the pointer merely rested on instead of the pill the user is looking
  // at.
  //
  // Lives in the shared hook rather than on one anchor: `Term` had it and
  // `Explained` did not, which made Escape on a preset-source badge's card
  // destroy the return pill instead of the card the user was looking at.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Escape" || !anchor || overlayKeyboardOwned()) {
        return;
      }
      e.preventDefault();
      hideNow();
    },
    [anchor, hideNow],
  );

  // Scrolling moves the anchor out from under the fixed-position card; hide
  // rather than float a card pointing at nothing.
  //
  // CAPTURE, and that is the whole listener: a scroll event does not bubble, so
  // a bubble-phase window listener only ever hears the DOCUMENT scroll. Every
  // anchor this card serves lives inside a nested `overflow: auto` box — the
  // `pre.config-view` of a JSON view, the preset tree's windowed list — and
  // scrolling one of those left the card parked at its old viewport
  // coordinates, over a DIFFERENT sentence than the one it explains. Capture
  // runs window-first for any scroll in the tree, which is exactly the set of
  // scrolls that can move an anchor. `RuleEvidenceCard` repositions on the same
  // flag for the same reason. The remove must repeat `capture` or it does not
  // match the registration.
  //
  // Except the scroll the SHOW itself caused, which the review after it found:
  // Tab onto an anchor that is only partly in view and the browser scrolls it
  // into view, so the very listener this effect just registered hears that
  // scroll one frame after the card opened and closes it again — every anchor
  // not already fully visible was unreachable by keyboard. A scroll inside
  // `SHOW_SCROLL_GRACE_MS` of the show is therefore read as the show's own and
  // RE-ANCHORS instead of hiding: the anchor has just moved, so the card must
  // move with it or it points at whatever slid under its old coordinates —
  // which is the same failure, silently. Only the anchor's own box is re-read;
  // the singleton, Escape and pointer-grace semantics are untouched.
  useEffect(() => {
    if (!anchor) {
      return;
    }
    const onScroll = () => {
      const el = anchorEl.current;
      if (!el || Date.now() - shownAt.current >= SHOW_SCROLL_GRACE_MS) {
        hideNow();
        return;
      }
      const next = anchorRectOf(el);
      setAnchor((prev) => (prev && sameRect(prev, next) ? prev : next));
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, [anchor, hideNow]);

  return { anchor, show, hide, hideNow, cancelHide, onKeyDown };
}

/**
 * The open card's own dismissal, handed DOWN to its body.
 *
 * A card body that navigates the page out from under itself — the attribution
 * card's "Show in preset tree →" switches tabs — has to take the card with it:
 * a pointer-opened card never got focus, so there is no blur to close it, and
 * it stays fixed at its old coordinates over a view that is no longer the one
 * it describes. The body cannot reach `hideNow` through props, because
 * `HoverCardAnchor` takes its card as an eager `ReactNode` (a `() => ReactNode`
 * thunk is what `react/no-unstable-nested-components` rejects), so the handle
 * travels by context instead. Deliberately just the one function: it is the
 * only thing a body has any business doing to its own card.
 *
 * The default no-ops so a card body renders outside a portal (in a test, say)
 * without a provider.
 */
const HoverCardCloseContext = createContext<() => void>(() => {});

export const HoverCardCloseProvider = HoverCardCloseContext.Provider;

/** The current card's dismissal — see `HoverCardCloseProvider`. */
export function useHoverCardClose(): () => void {
  return useContext(HoverCardCloseContext);
}
