import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type GlossaryEntry, type TermId } from "@/data/glossary-data";
import { useMoveGatedHover } from "@/hooks/hover-gate";
import { type AnchorRect, anchoredCardStyle, anchorRectOf } from "@/lib/anchored-card";

/**
 * The hover/focus card UI for the glossary. The entries themselves live in
 * glossary-data.ts.
 */

interface CardState {
  entry: GlossaryEntry;
  pos: AnchorRect;
}

/** Module-level singleton so only one glossary card is ever open. */
let activeHide: (() => void) | null = null;

/**
 * Shared hover/focus behavior for an element that explains itself with a
 * floating card. Same interaction contract as the option hover docs: a grace
 * period lets the pointer travel into the card to click the docs link.
 */
function useHoverCard(entry: GlossaryEntry) {
  const [card, setCard] = useState<CardState | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  const hideNow = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setCard(null);
  }, []);

  const show = useCallback(
    (el: Element) => {
      if (activeHide && activeHide !== hideNow) {
        activeHide();
      }
      activeHide = hideNow;
      window.clearTimeout(hideTimer.current);
      setCard({ entry, pos: anchorRectOf(el) });
    },
    [entry, hideNow],
  );

  const hide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setCard(null), 250);
  }, []);

  const cancelHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
  }, []);

  // Roadmap 067: an element-scoped Escape that ACTS must also claim the key,
  // the way the repo-load form's does. React's listener sits on the root
  // container, below the ladder's document listener, so without the
  // `stopPropagation` one press would hide this card AND pop the topmost ladder
  // layer — typically the simulator's return pill, which the reader cannot even
  // see from here. With no card up there is nothing to claim, and the key
  // belongs to the ladder.
  //
  // Lives in the shared hook rather than on one anchor: `Term` had it and
  // `Explained` did not, which made Escape on a preset-source badge's card
  // destroy the return pill instead of the card the user was looking at.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Escape" || !card) {
        return;
      }
      e.stopPropagation();
      hideNow();
    },
    [card, hideNow],
  );

  // Scrolling moves the anchor out from under the fixed-position card; hide
  // rather than float a card pointing at nothing.
  useEffect(() => {
    if (!card) {
      return;
    }
    window.addEventListener("scroll", hideNow, { passive: true });
    return () => window.removeEventListener("scroll", hideNow);
  }, [card, hideNow]);

  return { card, show, hide, hideNow, cancelHide, onKeyDown };
}

function GlossaryCard({
  card,
  onEnter,
  onLeave,
}: {
  card: CardState;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { entry, pos } = card;
  const style = anchoredCardStyle(pos, 320, 200);
  // Roadmap 035: portalled to <body>. The coordinates above are viewport
  // coordinates, which only hold while no ancestor is a containing block for
  // fixed-position descendants — and CSS containment creates exactly that, so
  // the moment any ancestor gains `container-type` (035 gave the preset-tree
  // card one) an in-place card would silently re-anchor to it. The portal
  // makes the viewport-relative math structurally true instead of incidental.
  return createPortal(
    <div
      className="option-card glossary-card"
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="option-card-head">
        <code className="option-card-name">{entry.name}</code>
      </div>
      <p className="option-card-desc">{entry.plain}</p>
      {entry.url ? (
        <p className="option-card-row">
          <a href={entry.url} target="_blank" rel="noreferrer">
            Renovate docs ↗
          </a>
        </p>
      ) : null}
    </div>,
    document.body,
  );
}

interface TermProps {
  id: TermId;
  /** Visible text; defaults to the glossary entry's exact Renovate name. */
  children?: ReactNode;
}

/**
 * A Renovate term in running copy: dotted underline, and a hover/focus card
 * with the plain-language explanation plus a docs link. Keyboard reachable
 * (Tab to focus, Escape to dismiss).
 */
export function Term({ id, children }: TermProps) {
  const entry = GLOSSARY[id];
  const { card, show, hide, cancelHide, onKeyDown } = useHoverCard(entry);
  const moveGate = useMoveGatedHover<HTMLSpanElement>(show);
  return (
    <>
      <span
        className="term"
        tabIndex={0}
        onMouseEnter={moveGate.onMouseEnter}
        onMouseMove={moveGate.onMouseMove}
        onMouseLeave={() => {
          moveGate.onMouseLeave();
          hide();
        }}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={hide}
        onKeyDown={onKeyDown}
      >
        {children ?? entry.name}
      </span>
      {card ? <GlossaryCard card={card} onEnter={cancelHide} onLeave={hide} /> : null}
    </>
  );
}

interface ExplainedProps {
  entry: GlossaryEntry;
  /** Renders the anchor element; receives the hover/focus handlers to spread. */
  children: (handlers: {
    onMouseEnter: () => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseLeave: () => void;
    onFocus: (e: React.FocusEvent) => void;
    onBlur: () => void;
    /**
     * Escape dismisses the card (see `useHoverCard`). An anchor with a keydown
     * handler of its own must COMPOSE this one rather than let a later spread
     * decide which survives — `ProvenanceChip` is the clickable case, and it
     * would otherwise trade its Enter/Space for this or this for it.
     */
    onKeyDown: (e: React.KeyboardEvent) => void;
  }) => ReactNode;
}

/**
 * Attaches a glossary card to an arbitrary element (e.g. a stage chip that is
 * already a button). The child render-prop spreads the handlers on its anchor.
 */
export function Explained({ entry, children }: ExplainedProps) {
  const { card, show, hide, cancelHide, onKeyDown } = useHoverCard(entry);
  const moveGate = useMoveGatedHover(show);
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
      {card ? <GlossaryCard card={card} onEnter={cancelHide} onLeave={hide} /> : null}
    </>
  );
}
