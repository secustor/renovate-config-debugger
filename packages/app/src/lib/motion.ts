/**
 * Roadmap 053 — the two motion-bearing gestures every cross-link in this app
 * makes: scroll the target into view, then flash it so the eye can find it.
 * Both were spelled out inline at each call site (013's rule focus, 047's
 * drawer jumps), which is how the scroll came to ignore
 * `prefers-reduced-motion` while the flash honored it in CSS only.
 *
 * DOM-touching but React-free, so it sits in lib/ next to `anchored-card.ts`.
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Must match the `.rcv-flash` animation's own duration in index.css. */
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
 * The transient "you are here" flash. The animation itself lives in CSS
 * (`.rcv-flash`), including its reduced-motion form — a static highlight for
 * the same duration, so the target is still marked, just not animated.
 */
export function flashTarget(el: Element): void {
  el.classList.add("rcv-flash");
  window.setTimeout(() => el.classList.remove("rcv-flash"), FLASH_MS);
}
