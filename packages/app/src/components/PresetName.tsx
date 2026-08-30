import { useMemo, type ReactNode } from "react";
import { presetReferenceFacts } from "@/lib/preset-reference";
import { CopyButton } from "./CopyButton";
import { HoverCardAnchor, type HoverCardHandlers } from "./hover-card";
import { HOVER_INTENT_DELAY_MS } from "./hover-gate";
import { usePresetReference } from "./preset-reference-context";
import { PresetReferenceCard } from "./PresetReferenceCard";

/**
 * Roadmap 081: THE preset reference. Every place the app names a preset —
 * built-in or hosted, a static mention in prose or a control that jumps to the
 * node — renders this, and therefore wears the same purple mono token at the
 * same size with the same hover card behind it.
 *
 * Before this there were six hand-written `className="preset-token"` sites and
 * three other renderings of the same idea (a muted mono label with a `title`, a
 * bare `<code>` in a sentence, a heading with a size override of its own). They
 * agreed on the hue and on nothing else: the class set no `font-size`, so the
 * token was whatever its surroundings were — 0.7rem in one card, 0.85rem in
 * another, 0.95rem in the detail heading — and none of them had a card.
 *
 * The design's rule is "purple = preset, everywhere", which is only true if
 * there is one component to be everywhere.
 */

/** The design's card: 300px, and roughly its own height's worth of room
 *  before it flips above the token. */
const CARD_WIDTH = 300;
const CARD_FLIP_MARGIN = 150;

export interface PresetNameProps {
  /** The preset as the config writes it — `config:recommended`, `github>acme/x`. */
  name: string;
  /**
   * The node in the current run's tree, when the reference has one. It is what
   * unlocks the hover card and its jump; a name with no node (a preset that did
   * not resolve, a token rendered with no run behind it) is simply inert.
   */
  nodeId?: string;
  /**
   * Makes the token a control. What it DOES differs per site — the ledger strip
   * scrolls to a card, an option row jumps to the tree — so it stays a prop
   * while the card's own "show the full tree →" is always the app's canonical
   * preset navigation.
   */
  onClick?: () => void;
  /** The detail panel's title: the same token, at heading weight and size. */
  heading?: boolean;
  /**
   * Suppresses the hover card on a token that already IS the thing the card
   * previews (the detail panel's own heading).
   */
  noCard?: boolean;
  /**
   * The shell-wide hover-copy affordance (Review-steps turn 17, variant 17a):
   * one copy icon, on every inline value, everywhere. On by default; a caller
   * turns it off only where the token renders INSIDE another element's own
   * `<button>` — the ledger card header's toggle, a family row's toggle —
   * where a second button would be invalid HTML nested inside the first, and
   * the click would double as that button's whole-surface activation.
   */
  showCopy?: boolean;
}

/**
 * The token itself. `<button>` when it acts, `<code>` when it does not — and
 * `<code>` deliberately, because several inert tokens render INSIDE another
 * button (the ledger's card header toggle, a rule-family row) where a nested
 * button would be invalid HTML and a `tabIndex` would invent a tab stop in the
 * middle of someone else's control.
 */
function PresetToken({
  name,
  onClick,
  heading,
  handlers,
}: {
  name: string;
  onClick?: () => void;
  heading?: boolean;
  handlers?: HoverCardHandlers;
}) {
  const className = heading ? "preset-token preset-token-heading" : "preset-token";
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} {...handlers}>
        {name}
      </button>
    );
  }
  return (
    <code className={className} {...handlers}>
      {name}
    </code>
  );
}

/**
 * The hover-revealed copy icon beside a token. Absolutely positioned (CSS) so
 * it reserves no layout space while hidden — a dense ledger or tree row must
 * not reflow when the pointer arrives — and stays in the tab order so a
 * keyboard user who focuses it sees it too, via `:focus-within` on the wrap
 * rather than `:hover` alone.
 *
 * It copies the FULL `name` — the string the config actually writes, never a
 * truncated display form — and the click is stopped from bubbling past this
 * slot: the token's own `onClick` is a sibling, not a parent, so it is never
 * at risk here, but a caller that goes on to embed the pair inside some other
 * clickable row stays safe by construction rather than by convention.
 */
function PresetNameCopy({ name }: { name: string }) {
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- not a control itself, just a stop on the one real button inside it: it keeps a copy click from bubbling into some future ancestor row's own `onClick`, which is exactly why it carries no role or keyboard contract of its own.
    <span className="preset-name-copy-slot" onClick={(e) => e.stopPropagation()}>
      <CopyButton
        className="preset-name-copy"
        iconOnly
        label="Copy preset name"
        getText={() => name}
      />
    </span>
  );
}

export function PresetName({
  name,
  nodeId,
  onClick,
  heading,
  noCard,
  showCopy = true,
}: PresetNameProps) {
  const { root, onSelectPreset } = usePresetReference();
  // Cheap (the walk behind it is cached on the tree object), but it runs on
  // every render of every token on screen, and the ledger puts dozens on one
  // page — so it is memoized on the three things that can change it.
  const facts = useMemo(
    () => (noCard || !root || !nodeId ? null : presetReferenceFacts(root, nodeId)),
    [noCard, root, nodeId],
  );

  const token = (handlers?: HoverCardHandlers): ReactNode => (
    <PresetToken name={name} onClick={onClick} heading={heading} handlers={handlers} />
  );

  const wrap = (inner: ReactNode): ReactNode =>
    showCopy ? (
      <span className="preset-name-wrap">
        {inner}
        <PresetNameCopy name={name} />
      </span>
    ) : (
      inner
    );

  if (!facts) {
    return wrap(token());
  }
  return wrap(
    <HoverCardAnchor
      className="preset-ref-card"
      width={CARD_WIDTH}
      flipMargin={CARD_FLIP_MARGIN}
      openDelayMs={HOVER_INTENT_DELAY_MS}
      card={<PresetReferenceCard facts={facts} onSelect={onSelectPreset} />}
    >
      {token}
    </HoverCardAnchor>,
  );
}
