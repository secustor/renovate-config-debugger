import type { ReactNode } from "react";
import { GLOSSARY, type GlossaryEntry, type TermId } from "@/data/glossary-data";
import { HoverCardAnchor, type HoverCardHandlers, HoverCardTextAnchor } from "./hover-card";

/**
 * The hover/focus card UI for the glossary. The entries themselves live in
 * glossary-data.ts; the interaction (the one-card-at-a-time singleton, the
 * grace period, the Escape ruling) lives in `hover-card-hooks.ts`, which
 * roadmap 069 PR 5 hoisted out of here so the description attribution card
 * could inherit it rather than grow a second tooltip of its own.
 */

function GlossaryCard({ entry }: { entry: GlossaryEntry }) {
  return (
    <>
      <div className="option-card-head">
        <code className="option-card-name">{entry.name}</code>
      </div>
      <p>{entry.plain}</p>
      {entry.url ? (
        <p className="option-card-row">
          <a href={entry.url} target="_blank" rel="noreferrer">
            Renovate docs ↗
          </a>
        </p>
      ) : null}
    </>
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
  return (
    <ExplainedText entry={entry} className="term">
      {children ?? entry.name}
    </ExplainedText>
  );
}

/**
 * A glossary card on a plain inert SPAN — the shape eight of the app's nine
 * explainer anchors have (a badge, a stat, a note): focusable so the card is
 * keyboard-reachable, but not a control, because there is nothing to activate.
 *
 * The render-prop {@link Explained} stays for the ninth, whose anchor is a real
 * button with its own click behavior (the tree's duplicate chip). Every span
 * anchor goes through here instead: the render prop cost each site two JSX
 * depth levels — a standing fight with `jsx-max-depth` in `TreeRow` — to spell
 * out the same `tabIndex={0}` and handler spread.
 */
export function ExplainedText({
  entry,
  className,
  children,
}: {
  entry: GlossaryEntry;
  /** The anchor's classes. Carry `explained` (the dotted-underline affordance)
   *  unless the class already implies it, as `term` does. */
  className: string;
  children: ReactNode;
}) {
  return (
    <Explained entry={entry}>
      {(handlers) => (
        <HoverCardTextAnchor className={className} handlers={handlers}>
          {children}
        </HoverCardTextAnchor>
      )}
    </Explained>
  );
}

interface ExplainedProps {
  entry: GlossaryEntry;
  /** Renders the anchor element; receives the hover/focus handlers to spread. */
  children: (handlers: HoverCardHandlers) => ReactNode;
}

/**
 * Attaches a glossary card to an arbitrary element (e.g. a stage chip that is
 * already a button). The child render-prop spreads the handlers on its anchor.
 */
export function Explained({ entry, children }: ExplainedProps) {
  return (
    <HoverCardAnchor className="glossary-card" card={<GlossaryCard entry={entry} />}>
      {children}
    </HoverCardAnchor>
  );
}
