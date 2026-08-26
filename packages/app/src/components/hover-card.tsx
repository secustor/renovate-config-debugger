import { type ReactNode, useId } from "react";
import { createPortal } from "react-dom";
import { type HoverCardControls, HoverCardCloseProvider, useHoverCard } from "./hover-card-hooks";
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
  /**
   * The open card's id, so the anchor NAMES the thing it just revealed.
   * `undefined` while no card is up — the element it would point at is not
   * rendered then, and a dangling reference is worse than none.
   *
   * Without this the anchors were focusable elements with no role and no
   * relationship to anything: a screen reader landed on "npmToken", announced
   * that and stopped, while the card explaining it sat in a portal at the end
   * of `<body>` with nothing tying the two together. The card's text is a
   * DESCRIPTION of the anchor, which is precisely what this attribute is for.
   *
   * `aria-describedby` rather than `role="tooltip"` on the card: several of
   * these cards hold interactive content (the attribution card's tree jump,
   * links inside option docs), and a `tooltip` is specified as non-interactive
   * — claiming the role would promise a keyboard contract the widget does not
   * implement. `aria-details` would be the richer fit, but its AT support is
   * still thin where `aria-describedby` is universal.
   */
  "aria-describedby"?: string;
}

/**
 * The anchor half for the common case: a focusable run of text that reveals
 * its card on hover or focus.
 *
 * One component rather than the four hand-written copies this replaces
 * (`ExplainedText`, the JSON description span, the option-name span, and the
 * hover-card test's own fixture) — they were the same six attributes each
 * time, which is how three of them came to be focusable with no description
 * while the fourth was the one under test.
 */
export function HoverCardTextAnchor({
  className,
  handlers,
  children,
}: {
  className?: string;
  handlers: HoverCardHandlers;
  children: ReactNode;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the rule's remedy is "drop the tabIndex", which would take these cards away from keyboard users entirely: hover is the ONLY other way to open one. The honest fix it is reaching for is a role, and there is no right one — the anchor activates nothing on click (`tooltip`/`button` both promise a contract this does not implement), so what it owes the reader is a DESCRIPTION, which `aria-describedby` above now gives it. This is the single site in the app that makes text focusable; every other one is a real control.
    <span className={className} tabIndex={0} {...handlers}>
      {children}
    </span>
  );
}

/** The card's preferred width, and how much room it wants below the anchor
 *  before flipping above it (roughly its own height). */
const DEFAULT_WIDTH = 320;
const DEFAULT_FLIP_MARGIN = 200;

/**
 * The card half on its own: the `.option-card` plane, placed against whatever
 * box `controls` currently holds and portalled to `<body>` (see the header for
 * why the portal is not optional).
 *
 * Split out for the one card whose anchor is not an element this component
 * could render — the diff views' option-docs hover, which finds its `"key":`
 * token by caret hit-testing a `<pre>` full of plain text and anchors to a
 * `Range`. It drives `useHoverCard` itself and renders this; everything else
 * uses {@link HoverCardAnchor}, which is the two halves together. Both sit on
 * the same hook, so the singleton holds ACROSS them: opening either takes the
 * other down.
 */
export function HoverCardSurface({
  controls,
  className,
  id,
  width = DEFAULT_WIDTH,
  flipMargin = DEFAULT_FLIP_MARGIN,
  children,
}: {
  controls: HoverCardControls;
  /** Extra class on the `.option-card` surface. */
  className?: string;
  /** What the anchor's `aria-describedby` points at — see {@link
   *  HoverCardHandlers}. Optional for the one caller that has no anchor
   *  ELEMENT to carry the reference (the diff views' caret hit-testing). */
  id?: string;
  width?: number;
  flipMargin?: number;
  /** The card's body. Rendered only while the card is up. */
  children: ReactNode;
}) {
  const { anchor, hide, hideNow, cancelHide } = controls;
  if (!anchor) {
    return null;
  }
  return createPortal(
    // The card's body gets its own dismissal (`hover-card-hooks.ts`): an action
    // inside the card that moves the page — the attribution card's tree jump —
    // must close the card it was clicked in, and a pointer-opened card has no
    // blur to do that for it.
    <HoverCardCloseProvider value={hideNow}>
      <div
        id={id}
        className={className ? `option-card ${className}` : "option-card"}
        style={anchoredCardStyle(anchor, width, flipMargin)}
        onMouseEnter={cancelHide}
        onMouseLeave={hide}
      >
        {children}
      </div>
    </HoverCardCloseProvider>,
    document.body,
  );
}

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
  const controls = useHoverCard();
  const { show, hide, onKeyDown, anchor } = controls;
  const moveGate = useMoveGatedHover(show, openDelayMs);
  const cardId = useId();
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
        // Gated on the card actually being up: `HoverCardSurface` renders
        // nothing while `anchor` is null, so pointing at `cardId` then would
        // reference an element that does not exist.
        "aria-describedby": anchor ? cardId : undefined,
      })}
      <HoverCardSurface
        controls={controls}
        className={className}
        id={cardId}
        width={width}
        flipMargin={flipMargin}
      >
        {card}
      </HoverCardSurface>
    </>
  );
}
