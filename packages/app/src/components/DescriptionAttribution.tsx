import { useHoverCardClose } from "@/hooks/hover-card";
import {
  cardPathText,
  cardPositionText,
  type DescriptionCard,
  WROTE_THIS,
} from "@/lib/description-attribution";
import { APPROXIMATE_NOTE } from "@/lib/tree-descriptions";
import { HoverCardAnchor } from "./hover-card";
import { layerClass, layerLabel } from "./provenance-layer";

/**
 * Roadmap 069 (PR 5): the attribution card on a `description` string, and the
 * string that anchors it.
 *
 * The card is the app's standard hover card (`HoverCardAnchor` — one open at a
 * time, focus-reachable, Escape-dismissible), carrying the three facts the
 * blame ledger prints in three columns: who wrote the sentence, the `extends`
 * path it arrived by, and where it landed in the array.
 *
 * The preset chip here is deliberately NOT a `ProvenanceChip`: that chip opens a
 * glossary card of its own, and the single-card singleton means opening it
 * closes the card it is standing in — taking itself with it. So the chip is
 * static (same class, same hue, no affordance) and the jump it would have
 * offered is the explicit link at the bottom instead.
 */

function AttributionCard({
  card,
  onSelectPreset,
}: {
  card: DescriptionCard;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const path = cardPathText(card);
  // Hoisted out of the JSX: read inside the click closure, `card.nodeId`
  // re-widens to `string | undefined`.
  const nodeId = card.nodeId;
  // The jump switches tabs, so the card must go with it. Nothing else would
  // take it: opened by pointer it never held focus, so there is no blur, and
  // the portalled card would sit at its old viewport coordinates over the
  // preset tree until the pointer left its box or the reader pressed Escape —
  // pointing, by then, at a sentence that is no longer under it.
  const closeCard = useHoverCardClose();
  return (
    <>
      <div className="option-card-head">
        <span className={`badge prov-layer ${layerClass(card.layer)}`}>
          {layerLabel(card.layer)}
        </span>
        <span className="desc-attr-head">{WROTE_THIS}</span>
      </div>
      {path ? <p className="desc-attr-path">{path}</p> : null}
      <p className="option-card-row">{cardPositionText(card)}</p>
      {card.approximate ? <p className="option-card-row">{APPROXIMATE_NOTE}</p> : null}
      {nodeId && onSelectPreset ? (
        <p className="option-card-row">
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              closeCard();
              onSelectPreset(nodeId);
            }}
          >
            Show in preset tree →
          </button>
        </p>
      ) : null}
    </>
  );
}

/** The card's preferred width and flip margin — wider than a glossary card
 *  because the import path is one mono line that should not wrap twice. */
const CARD_WIDTH = 360;
const CARD_FLIP_MARGIN = 220;

/**
 * One string of a rendered `description` array: the JSON literal exactly as
 * `ConfigJson` would have printed it, plus the hover/focus affordance. Keyboard
 * reachable, so the attribution is not pointer-only — the card's own jump link
 * is (it lives in a portal), which is why the link is an extra rather than the
 * only way to the same node.
 */
export function DescriptionValue({
  card,
  onSelectPreset,
}: {
  card: DescriptionCard;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <HoverCardAnchor
      className="desc-attr-card"
      width={CARD_WIDTH}
      flipMargin={CARD_FLIP_MARGIN}
      card={<AttributionCard card={card} onSelectPreset={onSelectPreset} />}
    >
      {(handlers) => (
        <span className="json-desc" tabIndex={0} {...handlers}>
          {JSON.stringify(card.value)}
        </span>
      )}
    </HoverCardAnchor>
  );
}
