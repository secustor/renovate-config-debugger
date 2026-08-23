import { useHoverCardClose } from "./hover-card-hooks";

/**
 * The way OUT of a hover card: a quiet link-button that takes the reader
 * somewhere else in the app — the preset tree, the full description array.
 *
 * It closes its own card before it jumps, and that is the whole reason this
 * exists as a component rather than three buttons. The jump switches tabs and
 * scrolls, pulling the page out from under a card that a POINTER opened — which
 * therefore never held focus, so there is no blur to take it down. Left
 * standing, the portalled card sits at its old viewport coordinates over the
 * new surface until the pointer leaves its box or the reader presses Escape,
 * pointing by then at something that is no longer under it.
 *
 * Three cards owed that sequence and each spelled it out (`DescriptionAttribution`,
 * `PresetReferenceCard`, `NodeDescriptions`), the last two with a comment
 * naming one of the others as the precedent. The wrapper element stays at the
 * call site: each card places its jump differently (a card row, a footer rule,
 * bare), and only the button is the same.
 */
export function HoverCardJump({
  label,
  className,
  onJump,
}: {
  /** The button's full text, arrow included — it is the label, not a caption. */
  label: string;
  /** Extra classes beside `btn-quiet`, when the card styles its own jump. */
  className?: string;
  onJump: () => void;
}) {
  const close = useHoverCardClose();
  return (
    <button
      type="button"
      className={className ? `btn-quiet ${className}` : "btn-quiet"}
      onClick={() => {
        close();
        onJump();
      }}
    >
      {label}
    </button>
  );
}
