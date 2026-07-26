import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import type { OptionDoc, OptionIndex } from "@renovate-config-visualizer/engine";
import { useMoveGatedHover } from "@/hooks/hover-gate";
import { OptionDocsContext, useOptionDocs } from "@/hooks/option-docs-hooks";

/**
 * Inline documentation for renovate options (roadmap 003): a context carrying
 * the option index plus one floating hover card shared by every config
 * rendering. The index comes from the engine (renovate's own metadata) and is
 * loaded after the first pipeline run, when the heavy engine chunk is already
 * in memory.
 */

interface CardState {
  name: string;
  doc?: OptionDoc;
  anchor: { left: number; top: number; bottom: number };
}

export function OptionDocsProvider({
  index,
  children,
}: {
  index: OptionIndex | null;
  children: ReactNode;
}) {
  const [card, setCard] = useState<CardState | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  const cancelHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
  }, []);

  const hide = useCallback(() => {
    // grace period so the pointer can travel into the card (to click the
    // docs link) without it vanishing
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setCard(null), 250);
  }, []);

  const show = useCallback(
    (name: string, rect: DOMRect) => {
      if (!index) {
        return;
      }
      window.clearTimeout(hideTimer.current);
      setCard((prev) => {
        const anchor = { left: rect.left, top: rect.top, bottom: rect.bottom };
        if (prev?.name === name && Math.abs(prev.anchor.top - anchor.top) < 1) {
          return prev;
        }
        return { name, doc: index.options.get(name), anchor };
      });
    },
    [index],
  );

  const value = useMemo(() => ({ index, show, hide, cancelHide }), [index, show, hide, cancelHide]);

  return (
    <OptionDocsContext.Provider value={value}>
      {children}
      {card ? <OptionCard card={card} onEnter={cancelHide} onLeave={hide} /> : null}
    </OptionDocsContext.Provider>
  );
}

/** Renders `code` spans in renovate's markdown-ish description strings. */
function md(text: string): ReactNode {
  // Roadmap 041 — index keys, deliberately: this array is ONE string split on
  // backticks, so slot i is always the same span of the same string and the
  // odd/even parity is what decides `<code>` vs plain text. Parts repeat, and
  // insertion/reorder cannot happen; there is no other identity to key on.
  return text.split(/`([^`]*)`/g).map((part, i) =>
    // oxlint-disable-next-line react/no-array-index-key -- see above
    i % 2 === 1 ? <code key={i}>{part}</code> : part,
  );
}

function OptionCard({
  card,
  onEnter,
  onLeave,
}: {
  card: CardState;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { doc, name, anchor } = card;
  // Clamp to the viewport, not just a fixed constant — a 340px card doesn't
  // fit an under-340px viewport (roadmap 025).
  const width = Math.min(340, window.innerWidth - 32);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 16));
  const openUpward = anchor.bottom > window.innerHeight - 280;
  const style: React.CSSProperties = openUpward
    ? { left, bottom: window.innerHeight - anchor.top + 6, maxWidth: width }
    : { left, top: anchor.bottom + 6, maxWidth: width };

  return (
    <div className="option-card" style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="option-card-head">
        <code className="option-card-name">{name}</code>
        {doc ? <span className="badge type">{doc.type}</span> : null}
        {doc?.subType ? <span className="badge type">of {doc.subType}</span> : null}
        {doc?.globalOnly ? <span className="badge global">self-hosted only</span> : null}
        {doc?.experimental ? <span className="badge experimental">experimental</span> : null}
        {doc?.deprecationMsg ? <span className="badge deprecated">deprecated</span> : null}
        {doc?.advancedUse ? <span className="badge advanced">advanced</span> : null}
      </div>
      {doc ? (
        <>
          <p className="option-card-desc">{md(doc.description)}</p>
          {doc.deprecationMsg ? (
            <p className="option-card-deprecation">{md(doc.deprecationMsg)}</p>
          ) : null}
          {doc.experimentalDescription ? (
            <p className="option-card-desc">{md(doc.experimentalDescription)}</p>
          ) : null}
          {doc.default !== undefined && doc.default !== null ? (
            <p className="option-card-row">
              <strong>Default:</strong> <code>{truncate(JSON.stringify(doc.default), 100)}</code>
            </p>
          ) : null}
          {doc.allowedValues?.length ? (
            <p className="option-card-row">
              <strong>Allowed:</strong> {doc.allowedValues.join(", ")}
            </p>
          ) : null}
          {doc.supportedManagers?.length ? (
            <p className="option-card-row">
              <strong>Managers:</strong> {truncate(doc.supportedManagers.join(", "), 120)}
            </p>
          ) : null}
          {doc.supportedPlatforms?.length ? (
            <p className="option-card-row">
              <strong>Platforms:</strong> {doc.supportedPlatforms.join(", ")}
            </p>
          ) : null}
          {doc.parents?.length && !doc.parents.includes(".") ? (
            <p className="option-card-row">
              <strong>Only valid inside:</strong> {doc.parents.join(", ")}
            </p>
          ) : null}
          <p className="option-card-row">
            <a href={doc.url} target="_blank" rel="noreferrer">
              docs.renovatebot.com ↗
            </a>
          </p>
        </>
      ) : (
        <p className="option-card-desc unknown-note">
          Not a Renovate configuration option — possibly a typo.
        </p>
      )}
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

interface OptionKeyProps {
  name: string;
  /** Whether unknown keys should be flagged (i.e. this object is config-shaped) */
  flagUnknown: boolean;
}

/** An option key in a read-only config rendering: styled + hover card. */
export function OptionKey({ name, flagUnknown }: OptionKeyProps) {
  const { index, show, hide } = useOptionDocs();
  const doc = index?.options.get(name);
  const unknown = index !== null && !doc && flagUnknown;
  let className = "opt-key";
  if (doc) {
    className += " known";
    if (doc.deprecationMsg) {
      className += " deprecated";
    }
    if (doc.experimental) {
      className += " experimental";
    }
  } else if (unknown) {
    className += " unknown";
  }
  const interactive = Boolean(doc) || unknown;
  const moveGate = useMoveGatedHover<HTMLSpanElement>((el) =>
    show(name, el.getBoundingClientRect()),
  );
  return (
    <span
      className={className}
      onMouseEnter={interactive ? moveGate.onMouseEnter : undefined}
      onMouseMove={interactive ? moveGate.onMouseMove : undefined}
      onMouseLeave={
        interactive
          ? () => {
              moveGate.onMouseLeave();
              hide();
            }
          : undefined
      }
    >
      {name}
    </span>
  );
}
