import { CodeText } from "@/components/CodeText";
import { HoverCardJump } from "@/components/HoverCardJump";
import {
  type DescLineWithMarker,
  type NodeDescriptionFacts,
  positionMarkerText,
  positionMarkerTitle,
  zipDescLines,
} from "@/lib/tree-descriptions";

/**
 * Roadmap 069 (PR 4): one node's description facts, rendered — the sentences
 * it wrote (with where they landed in the final `description` array when they
 * reached it), and the mute note on a node that silences descriptions below
 * it. A sentence Renovate dropped on merge reads exactly like the others,
 * minus the slot marker: wrapper and package-list presets shed their
 * description by design, so on the node itself it is simply what the preset
 * says about itself, and the drop mechanics stay on the blame ledger's footer.
 *
 * Two surfaces share this rendering so they cannot drift: the hover card on
 * the preset's name in the tree (`TreeRow`), and the detail panel's
 * Description entry (`PresetDetail`). The facts themselves come from
 * `lib/tree-descriptions.ts`, which is where every wording lives.
 */

function DescLineView({ item }: { item: DescLineWithMarker }) {
  const { line, marker } = item;
  return (
    <li className={`preset-desc-line desc-${line.kind}`}>
      {line.text ? (
        <span className="preset-desc-text">
          <CodeText text={line.text} />
        </span>
      ) : null}
      {line.note ? (
        <span className="preset-desc-note">
          <CodeText text={line.note} />
        </span>
      ) : null}
      {marker ? (
        <span className="preset-desc-pos" title={positionMarkerTitle(marker)}>
          {positionMarkerText(marker)}
        </span>
      ) : null}
    </li>
  );
}

export function NodeDescriptionLines({ facts }: { facts: NodeDescriptionFacts }) {
  return (
    <ul className="preset-desc-lines">
      {zipDescLines(facts).map((item) => (
        <DescLineView key={item.line.key} item={item} />
      ))}
    </ul>
  );
}

/**
 * The hover card's body: the lines, plus the jump to the array they landed in
 * (App plumbing permitting) — `HoverCardJump` owns the close-then-jump
 * sequence the tab switch demands.
 */
export function NodeDescriptionCard({
  facts,
  onShowOrder,
}: {
  facts: NodeDescriptionFacts;
  onShowOrder?: () => void;
}) {
  return (
    // `preset-desc-body` styles nothing — it is how `PresetTree.shimmed.test`
    // finds this card.
    <div className="preset-desc-body">
      <NodeDescriptionLines facts={facts} />
      {onShowOrder ? (
        <HoverCardJump
          label="Show the full description array →"
          className="preset-desc-order"
          onJump={onShowOrder}
        />
      ) : null}
    </div>
  );
}
