import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { HoverCardCloseProvider, useHoverCard } from "./hover-card-hooks";
import { useMoveGatedHover } from "./hover-gate";
import { anchoredCardStyle } from "@/lib/anchored-card";

/**
 * The app's one hover-card affordance, as a primitive: an anchor that spreads
 * hover/focus handlers onto whatever element the caller renders, plus the card
 * itself on the shared `.option-card` plane, portalled to `<body>`.
 *
 * Roadmap 035: portalled deliberately. The placement math is in VIEWPORT
 * coordinates, which only hold while no ancestor is a containing block for
 * fixed-position descendants — and CSS containment creates exactly that, so the
 * moment any ancestor gains `container-type` (035 gave the preset-tree card one)
 * an in-place card would silently re-anchor to it.
 *
 * Roadmap 069 PR 5 generalised this out of `glossary.tsx`, where it was a card
 * that could only say a `GlossaryEntry`: the description attribution card names
 * a preset, prints an import path and offers a jump, and the alternative to a
 * shared anchor was a second bespoke tooltip with its own focus and Escape
 * semantics. `Term`/`Explained` are now this component with a glossary body.
 */

/** The handlers an anchor must spread to open/close its card. */
export interface HoverCardHandlers {
  onMouseEnter: () => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onFocus: (e: React.FocusEvent) => void;
  onBlur: () => void;
  /**
   * Escape dismisses the card while this card is the topmost thing over the
   * page — see `useHoverCard` for what it stands aside for. An anchor with a
   * keydown handler of its own must COMPOSE this one rather than let a later
   * spread decide which survives — `ProvenanceChip` is the clickable case,
   * and it would otherwise trade its Enter/Space for this or this for it.
   */
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/** The card's preferred width, and how much room it wants below the anchor
 *  before flipping above it (roughly its own height). */
const DEFAULT_WIDTH = 320;
const DEFAULT_FLIP_MARGIN = 200;

export function HoverCardAnchor({
  card,
  className,
  width = DEFAULT_WIDTH,
  flipMargin = DEFAULT_FLIP_MARGIN,
  openDelayMs = 0,
  children,
}: {
  /** The card's body. Rendered only while the card is up. */
  card: ReactNode;
  /** Extra class on the `.option-card` surface. */
  className?: string;
  width?: number;
  flipMargin?: number;
  /**
   * Roadmap 081: hover-intent delay before the card opens, in ms. 0 (the
   * default, and every anchor that predates 081) opens on the first genuine
   * pointer move. See `useMoveGatedHover` for why this is per-anchor.
   *
   * Applies to the POINTER only — a focus is already an explicit act, and
   * making a keyboard user hold a stop for four tenths of a second before the
   * card they Tabbed to appears would be a delay with nothing to prevent.
   */
  openDelayMs?: number;
  /** Renders the anchor element; receives the handlers to spread. */
  children: (handlers: HoverCardHandlers) => ReactNode;
}) {
  const { anchor, show, hide, hideNow, cancelHide, onKeyDown } = useHoverCard();
  const moveGate = useMoveGatedHover(show, openDelayMs);
  return (
    <>
      {children({
        onMouseEnter: moveGate.onMouseEnter,
        onMouseMove: moveGate.onMouseMove,
        onMouseLeave: () => {
          moveGate.onMouseLeave();
          hide();
        },
        onFocus: (e) => show(e.currentTarget),
        onBlur: hide,
        onKeyDown,
      })}
      {anchor
        ? createPortal(
            // The card's body gets its own dismissal (`hover-card-hooks.ts`):
            // an action inside the card that moves the page — the attribution
            // card's tree jump — must close the card it was clicked in, and a
            // pointer-opened card has no blur to do that for it.
            <HoverCardCloseProvider value={hideNow}>
              <div
                className={className ? `option-card ${className}` : "option-card"}
                style={anchoredCardStyle(anchor, width, flipMargin)}
                onMouseEnter={cancelHide}
                onMouseLeave={hide}
              >
                {card}
              </div>
            </HoverCardCloseProvider>,
            document.body,
          )
        : null}
    </>
  );
}
