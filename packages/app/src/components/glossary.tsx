import type { ReactNode } from "react";
import { GLOSSARY, type GlossaryEntry, type TermId } from "@/data/glossary-data";
import { HoverCardAnchor, type HoverCardHandlers } from "./hover-card";

/**
 * The hover/focus card UI for the glossary. The entries themselves live in
 * glossary-data.ts; the interaction (the one-card-at-a-time singleton, the
 * grace period, the Escape ruling) lives in `hooks/hover-card.ts`, which
 * roadmap 069 PR 5 hoisted out of here so the description attribution card
 * could inherit it rather than grow a second tooltip of its own.
 */

function GlossaryCard({ entry }: { entry: GlossaryEntry }) {
  return (
    <>
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
    <Explained entry={entry}>
      {(handlers) => (
        <span className="term" tabIndex={0} {...handlers}>
          {children ?? entry.name}
        </span>
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
