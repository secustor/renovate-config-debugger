/**
 * Roadmap 054 — the two motion-bearing gestures every cross-link in this app
 * makes: scroll the target into view, then flash it so the eye can find it.
 * Both were spelled out inline at each call site (013's rule focus, 047's
 * drawer jumps), which is how the scroll came to ignore
 * `prefers-reduced-motion` while the flash honored it in CSS only.
 *
 * DOM-touching but React-free, so it sits in lib/ next to `anchored-card.ts`.
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Must match the `.rcd-flash` animation's own duration in index.css. */
const FLASH_MS = 1600;

/** The OS-level "don't animate" preference, read at call time (a user can flip
 *  it mid-session, and these are one-shot gestures — nothing to subscribe to). */
export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * Scroll options for landing on a cross-link's target: smooth normally,
 * instant when the reader asked for less motion — the LANDING is the point,
 * and a long smooth scroll is exactly the vestibular trigger that preference
 * exists for.
 */
export function motionScrollOptions(block: ScrollLogicalPosition): ScrollIntoViewOptions {
  return { behavior: prefersReducedMotion() ? "auto" : "smooth", block };
}

/**
 * The same choice for a WINDOW scroll (`window.scrollTo`), which takes its own
 * options shape: the page-level jumps — back-to-top, and a results column that
 * scrolled itself into view — are the longest scrolls the app performs, so
 * they are the ones the preference matters most for.
 */
export function motionScrollToOptions(top: number): ScrollToOptions {
  return { top, behavior: prefersReducedMotion() ? "auto" : "smooth" };
}

/**
 * One pending removal per element. Roadmap 068 review: without this, a second
 * `flashTarget` call on the same element within `FLASH_MS` of the first left
 * both calls' `setTimeout`s racing to remove the same class — the first one
 * to fire won, stripping the highlight while the second flash should still
 * have been running (jump to the same rule twice, or a fix that re-lands on
 * the row it just landed on).
 */
const pendingRemovals = new WeakMap<Element, number>();

/**
 * The transient "you are here" flash. The animation itself lives in CSS
 * (`.rcd-flash`), including its reduced-motion form — a static highlight for
 * the same duration, so the target is still marked, just not animated.
 */
export function flashTarget(el: Element): void {
  const pending = pendingRemovals.get(el);
  if (pending !== undefined) {
    window.clearTimeout(pending);
  }
  // Adding a class an element already has is a no-op — it would not restart
  // `.rcd-flash`'s keyframe animation, so a second landing mid-flash needs the
  // class taken off and put back on to play from frame one again. Reading a
  // layout property between the two flushes the removal first; without it the
  // two `classList` calls coalesce into one style recalc and the animation
  // never restarts.
  el.classList.remove("rcd-flash");
  void el.getBoundingClientRect();
  el.classList.add("rcd-flash");
  pendingRemovals.set(
    el,
    window.setTimeout(() => {
      el.classList.remove("rcd-flash");
      pendingRemovals.delete(el);
    }, FLASH_MS),
  );
}

/**
 * Roadmap 068: the whole landing, including the half that was missing. Every
 * cross-link in this app scrolled and flashed its target and left FOCUS where
 * the user clicked from — so a keyboard user was moved visually while their
 * next Tab continued from the link they had just left, which reads as the jump
 * having silently failed.
 *
 * `preventScroll` because the scroll above already chose the framing; letting
 * focus scroll again would undo `motionScrollOptions`' block alignment. The
 * target must be focusable — the landing sites either are controls already
 * (a thread head is a `<button>`) or carry `tabIndex={-1}` for this.
 *
 * This is the ALL-THREE landing, and the callers that spell the steps out
 * instead are not copies of it (2026-08-11 review): App's preset-node landing
 * flashes for every activator but takes focus only from the ones the tab switch
 * displaced, and the simulator's card landing focuses a container it must not
 * flash and assigns the `tabIndex` in the same breath. Folding them in would
 * mean a flag per step — the same code with each caller's policy moved into the
 * argument list, and the reason for it left behind at the call site.
 */
export function landOnTarget(el: HTMLElement, block: ScrollLogicalPosition): void {
  el.scrollIntoView(motionScrollOptions(block));
  flashTarget(el);
  el.focus({ preventScroll: true });
}
