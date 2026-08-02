import type { CSSProperties } from "react";

/**
 * Roadmap 025/053: where a floating card anchored to an element goes. The
 * cards render `position: fixed` and are portalled to `<body>` (035), so the
 * numbers below are viewport coordinates; two rules matter and were duplicated
 * per card before this module: clamp the width to the VIEWPORT rather than to
 * a constant (a 340px card does not fit a 320px phone, roadmap 025), and flip
 * above the anchor when there isn't room beneath it.
 */

/** The anchor's viewport box — the three edges the placement needs. */
export interface AnchorRect {
  left: number;
  top: number;
  bottom: number;
}

export function anchorRectOf(el: Element): AnchorRect {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, bottom: rect.bottom };
}

/**
 * @param maxWidth the card's preferred width in px, clamped to the viewport
 * @param flipMargin how much room the card wants below the anchor before it
 *   flips above it — roughly the card's own height
 */
export function anchoredCardStyle(
  anchor: AnchorRect,
  maxWidth: number,
  flipMargin: number,
): CSSProperties {
  const width = Math.min(maxWidth, window.innerWidth - 32);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 16));
  const openUpward = anchor.bottom > window.innerHeight - flipMargin;
  return openUpward
    ? { left, bottom: window.innerHeight - anchor.top + 6, maxWidth: width }
    : { left, top: anchor.bottom + 6, maxWidth: width };
}
