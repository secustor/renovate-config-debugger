import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { pinAddFocusTarget } from "./pin-add-dom";

/**
 * Whether the new-pin card is open, and where focus lands when it opens.
 *
 * Two state slots, a ref and a DOM effect, consumed at five call sites — and
 * they are one question, not four things: "is the card showing, and if it just
 * started showing, what should the reader be looking at?" Held apart in
 * `AddTestBox` they were four of its eleven state slots and read as unrelated
 * bookkeeping.
 *
 * The nonce is the part that has to be seen with the rest to make sense. It is
 * not a counter anyone reads — it exists so that OPENING is distinguishable
 * from BEING open, because focus must move on the former and never on the
 * latter.
 */

export interface PinCardOpen {
  /** Whether the card is showing. */
  open: boolean;
  /** Attach to the card element — the focus fallback searches inside it. */
  cardRef: RefObject<HTMLDivElement | null>;
  /** A user-initiated open: shows the card AND moves focus into it. */
  openCard: () => void;
  /** Collapse back to the ghost row. */
  closeCard: () => void;
}

/**
 * @param pinCount how many tests are pinned. With none, the card is FORCED
 * open — the empty state's call to action must point at a form that is on
 * screen — and once pins exist it is open only while the reader HOLDS it open.
 * Deriving `open` rather than storing it keeps that invariant across PROP
 * changes and not just at mount: a share link's pins arriving over a live
 * session collapse the card back to the ghost, and removing the last pin
 * brings it back.
 */
export function usePinCardOpen(pinCount: number): PinCardOpen {
  const [userOpen, setUserOpen] = useState(false);
  /**
   * Bumped by `openCard`. Focus moves into the card only on a USER-initiated
   * open — never on mount, because a tab switch must not steal focus, and a
   * boolean cannot tell the two apart.
   */
  const [focusNonce, setFocusNonce] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusNonce === 0) {
      return;
    }
    // On the Manual tab the target is the form's first input (which
    // `pinAddFocusTarget` also scrolls to); on the other tabs it falls back to
    // the card's first input, else the active tab — the ghost button is
    // unmounting, and focus must not drop to the body.
    const manual = pinAddFocusTarget();
    if (manual === null) {
      cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    const target =
      manual ??
      cardRef.current?.querySelector<HTMLElement>(".pin-repo-search input") ??
      cardRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
      null;
    target?.focus({ preventScroll: true });
  }, [focusNonce]);

  const openCard = useCallback(() => {
    setUserOpen(true);
    setFocusNonce((nonce) => nonce + 1);
  }, []);

  const closeCard = useCallback(() => {
    setUserOpen(false);
  }, []);

  return { open: pinCount === 0 || userOpen, cardRef, openCard, closeCard };
}
