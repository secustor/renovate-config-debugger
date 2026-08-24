import { useEffect, useRef } from "react";

/**
 * Roadmap 025: hover cards opened on plain `mouseenter` also open when
 * scrolled content merely slides an anchor under an already-stationary
 * cursor — the browser fires `mouseenter` for the element that ends up
 * under the pointer regardless of whether the pointer itself moved. That
 * synthesized hover then sits there occluding whatever the user actually
 * scrolled to see, since nothing moves it away again.
 *
 * `mousemove` only fires on genuine input-device motion, so gating the
 * "show" call behind the first `mousemove` after `mouseenter` — rather than
 * `mouseenter` itself — treats a pure-scroll hover as (correctly) not a
 * hover. A real hover still opens instantly for any user: the pointer
 * essentially always wobbles by a pixel the moment it lands.
 *
 * Roadmap 081 adds `delayMs`, the hover-INTENT half of the same question: the
 * gate above decides whether a hover happened, this decides whether the reader
 * meant it. It defaults to 0, so every card that existed before opens exactly
 * as instantly as it did — the delay is opt-in per anchor rather than a global
 * change of feel, because the two kinds of anchor differ. A glossary term or a
 * described tree row is a marked, isolated affordance the reader aims at; a
 * preset token is one of a whole strip of them in a sentence, and instant
 * opening there flickers a card per token as the pointer crosses the line.
 */
/**
 * Roadmap 081: the app's hover-intent delay, in ms — the design sheet's 0.4s.
 * One value, here rather than beside its first caller, so a second anchor that
 * wants a delay wears the same one instead of picking its own.
 */
export const HOVER_INTENT_DELAY_MS = 400;

export function useMoveGatedHover<T extends Element = Element>(
  onShow: (el: T) => void,
  delayMs = 0,
): {
  onMouseEnter: () => void;
  onMouseMove: (e: React.MouseEvent<T>) => void;
  onMouseLeave: () => void;
} {
  const moved = useRef(false);
  const openTimer = useRef<number | undefined>(undefined);

  // The pointer can leave by the anchor UNMOUNTING (a re-run replaces the
  // tree while a token is hovered), which fires no `mouseleave` — so the
  // pending open has to be cancelled here too or it shows a card for an
  // element that is no longer in the document.
  useEffect(() => () => window.clearTimeout(openTimer.current), []);

  return {
    onMouseEnter: () => {
      moved.current = false;
    },
    onMouseMove: (e) => {
      if (moved.current) {
        return;
      }
      moved.current = true;
      if (delayMs <= 0) {
        onShow(e.currentTarget);
        return;
      }
      // `currentTarget` is nulled once React recycles the synthetic event, so
      // the element is captured now rather than read inside the timeout.
      const el = e.currentTarget;
      window.clearTimeout(openTimer.current);
      openTimer.current = window.setTimeout(() => onShow(el), delayMs);
    },
    onMouseLeave: () => {
      moved.current = false;
      window.clearTimeout(openTimer.current);
    },
  };
}
