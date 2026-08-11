import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY, type GlossaryEntry, type TermId } from "@/data/glossary-data";
import { useMoveGatedHover } from "@/hooks/hover-gate";
import { type AnchorRect, anchoredCardStyle, anchorRectOf } from "@/lib/anchored-card";
import { overlayKeyboardOwned } from "@/lib/escape-stack";

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
  // silently destroyed way back is not. The two tests below pin both directions.
  // That is the same ranking the ladder itself applies, asked rather than
  // joined: registering this card as a layer would make it a stack entry that
  // pushes and releases on every hover, and Escape would then dismiss a card the
  // pointer merely rested on instead of the pill the user is looking at.
  //
  // Lives in the shared hook rather than on one anchor: `Term` had it and
  // `Explained` did not, which made Escape on a preset-source badge's card
  // destroy the return pill instead of the card the user was looking at.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Escape" || !card || overlayKeyboardOwned()) {
        return;
      }
      e.preventDefault();
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
     * Escape dismisses the card while this card is the topmost thing over the
     * page — see `useHoverCard` for what it stands aside for. An anchor with a
     * keydown handler of its own must COMPOSE this one rather than let a later
     * spread decide which survives — `ProvenanceChip` is the clickable case,
     * and it would otherwise trade its Enter/Space for this or this for it.
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
