import { type ReactNode, useCallback, useMemo, useState } from "react";
import type { OptionDoc, OptionIndex, OptionPlacement } from "@renovate-config-debugger/engine";
import { CodeText } from "./CodeText";
import { HoverCardAnchor, HoverCardSurface, HoverCardTextAnchor } from "./hover-card";
import { useHoverCard } from "./hover-card-hooks";
import { OptionDocsContext, useOptionDocs } from "./option-docs-hooks";
import type { AnchorSource } from "@/lib/anchored-card";
import { truncate } from "@/lib/truncate";

/**
 * Inline documentation for renovate options (roadmap 003): a context carrying
 * the option index, plus the two ways a card gets anchored to a key. The index
 * comes from the engine (renovate's own metadata) and is loaded after the first
 * pipeline run, when the heavy engine chunk is already in memory.
 *
 * The interaction is the app's shared one (`hover-card-hooks.ts`) — it was not
 * always. This module predates that hook and carried a second implementation of
 * the same idea: pointer-only, with its own grace timer, no singleton, no
 * Escape and no scroll re-anchoring. Two hover contracts in one app is one too
 * many, and the one a reader met on a Renovate option key was the weaker of
 * them — a keyboard user could not reach the docs at all.
 *
 * {@link OptionKey} is now a plain {@link HoverCardAnchor}. The DELEGATED half
 * cannot be: the diff views render JSON as text, so their keys are not elements
 * and the hover locates the token by caret hit-testing (`option-docs-hooks.ts`)
 * — that path drives the same hook here and renders {@link HoverCardSurface}
 * itself. Both sit on the hook's module-level singleton, so the two paths
 * remain what they were before this split: one card at a time.
 */

/** The option card is wider and taller than the app's default: an option's doc
 *  is a paragraph plus up to eight labelled rows. */
const CARD_WIDTH = 340;
const CARD_FLIP_MARGIN = 280;

export function OptionDocsProvider({
  index,
  children,
}: {
  index: OptionIndex | null;
  children: ReactNode;
}) {
  // WHICH option the delegated card is describing. The hook owns whether a card
  // is up and where; this is the only thing about it that is option-docs'.
  const [name, setName] = useState<string | null>(null);
  const controls = useHoverCard();
  const { show: showAt, hide } = controls;

  const show = useCallback(
    (next: string, target: AnchorSource) => {
      if (!index) {
        return;
      }
      setName(next);
      showAt(target);
    },
    [index, showAt],
  );

  const value = useMemo(() => ({ index, show, hide }), [index, show, hide]);

  return (
    <OptionDocsContext.Provider value={value}>
      {children}
      {name === null ? null : (
        <HoverCardSurface controls={controls} width={CARD_WIDTH} flipMargin={CARD_FLIP_MARGIN}>
          <OptionCardBody name={name} doc={index?.options.get(name)} />
        </HoverCardSurface>
      )}
    </OptionDocsContext.Provider>
  );
}

/**
 * Roadmap 072 — where the option may appear, always stated. Absence of a
 * `parents` declaration upstream is a statement ("usable anywhere"), not
 * missing data, so the unrestricted case gets a row of its own; the switch is
 * exhaustive so a new placement kind cannot be silently dropped here.
 */
function PlacementRow({ placement }: { placement: OptionPlacement }) {
  switch (placement.kind) {
    case "unrestricted":
      return (
        <p className="option-card-row">
          <strong>Usable anywhere:</strong> at the top level, and inside any container object.
        </p>
      );
    case "restricted":
      return (
        <p className="option-card-row">
          <strong>Only valid:</strong> {placementScope(placement)}
        </p>
      );
  }
}

function placementScope(placement: { parents: readonly string[]; topLevel: boolean }): string {
  const inside = placement.parents.length ? `inside ${placement.parents.join(", ")}` : "";
  if (placement.topLevel) {
    return inside ? `at the top level, or ${inside}` : "at the top level";
  }
  return inside || "nowhere Renovate names";
}

/** What an option's card SAYS — the `.option-card` surface around it is the
 *  shared one's, whichever of the two paths opened it. */
function OptionCardBody({ name, doc }: { name: string; doc?: OptionDoc }) {
  return (
    <>
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
          {/* Renovate's descriptions mark names with backticks, the same
              convention `CodeText` renders everywhere else in the app. */}
          <p>
            <CodeText text={doc.description} />
          </p>
          {doc.deprecationMsg ? (
            <p className="option-card-deprecation">
              <CodeText text={doc.deprecationMsg} />
            </p>
          ) : null}
          {doc.experimentalDescription ? (
            <p>
              <CodeText text={doc.experimentalDescription} />
            </p>
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
          <PlacementRow placement={doc.placement} />
          {doc.childOptions?.length ? (
            <p className="option-card-row">
              <strong>Contains:</strong> {truncate(doc.childOptions.join(", "), 120)} — plus any
              option with no placement restriction.
            </p>
          ) : null}
          {doc.patternMatch ? (
            <p className="option-card-row">
              <strong>Patterns:</strong> globs, or regexes written <code>/…/</code>; a leading{" "}
              <code>!</code> negates an entry.
            </p>
          ) : null}
          {doc.supportsTemplating ? (
            <p className="option-card-row">
              <strong>Templating:</strong> supported (<code>{"{{depName}}"}</code> and friends).
            </p>
          ) : null}
          <p className="option-card-row">
            <a href={doc.url} target="_blank" rel="noreferrer">
              docs.renovatebot.com ↗
            </a>
          </p>
        </>
      ) : (
        <p className="unknown-note">Not a Renovate configuration option — possibly a typo.</p>
      )}
    </>
  );
}

interface OptionKeyProps {
  name: string;
  /** Whether unknown keys should be flagged (i.e. this object is config-shaped) */
  flagUnknown: boolean;
}

/**
 * An option key in a read-only config rendering: styled, and — once the index
 * has something to say about it — the anchor of the app's standard hover card.
 *
 * `tabIndex={0}` is what makes the docs keyboard-reachable at all, and it is
 * the same inert-focusable-span shape every other explainer anchor in the app
 * wears (`ExplainedText`, the non-clickable `ProvenanceChip`): focusable
 * because there is something to read, not a control, because there is nothing
 * to activate. A key the index cannot explain stays a plain span with no
 * handlers and no tab stop — the card would say nothing, so there is nothing to
 * reach.
 */
export function OptionKey({ name, flagUnknown }: OptionKeyProps) {
  const { index } = useOptionDocs();
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
  if (!doc && !unknown) {
    return <span className={className}>{name}</span>;
  }
  return (
    <HoverCardAnchor
      width={CARD_WIDTH}
      flipMargin={CARD_FLIP_MARGIN}
      card={<OptionCardBody name={name} doc={doc} />}
    >
      {(handlers) => (
        <HoverCardTextAnchor className={className} handlers={handlers}>
          {name}
        </HoverCardTextAnchor>
      )}
    </HoverCardAnchor>
  );
}
