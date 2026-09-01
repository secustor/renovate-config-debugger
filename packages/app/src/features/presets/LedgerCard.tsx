import { useState } from "react";
import { type LedgerSection, ledgerCardId, type LedgerSource, type LedgerTile } from "./ledger";
import { LedgerFamilies } from "./LedgerFamilies";
import { LedgerMosaic } from "./LedgerMosaic";
import { LedgerOptions } from "./LedgerOptions";
import { Caret } from "@/components/Caret";
import { PresetName } from "@/components/PresetName";
import { plural } from "@/lib/format";

/**
 * Roadmap 075 (iteration 5b): one card per top-level `extends` entry — the
 * ledger's unit. The header states what the entry IS (whose preset, how much
 * it brought, where it is documented); the body states what it DID.
 *
 * The big Renovate built-in starts folded: `config:recommended` is the
 * 1,100-preset firehose, and opening the ledger inside it would reproduce
 * exactly the wall the ledger exists to replace.
 */

function SourcePill({ source }: { source: LedgerSource }) {
  if (source.builtIn) {
    return (
      <span className="pill pill-muted" title="A preset that ships inside Renovate itself">
        Renovate built-in
      </span>
    );
  }
  return (
    <span className="pill pill-preset" title={`Fetched: ${source.kind}`}>
      your preset
    </span>
  );
}

/** The header's toggle: everything about the source except its docs link,
 *  which cannot live inside a button. */
function LedgerCardToggle({
  source,
  open,
  onToggle,
}: {
  source: LedgerSource;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="ledger-head-toggle" aria-expanded={open} onClick={onToggle}>
      <Caret open={open} />
      {/* Inert: this token lives inside the header's own toggle button — a
          nested button would be invalid HTML, so the copy affordance is off. */}
      <PresetName name={source.name} nodeId={source.nodeId} showCopy={false} />
      <SourcePill source={source} />
      <span className="ledger-head-counts">
        {source.failed
          ? "— did not resolve"
          : `— ${plural(source.presets, "preset")} · ${plural(
              source.optionKeys,
              "option",
            )} · ${plural(source.rules, "rule")}`}
      </span>
    </button>
  );
}

function LedgerCardBody({
  source,
  activeTile,
  onSelectTile,
  onOpenNode,
}: {
  source: LedgerSource;
  activeTile: LedgerTile | null;
  onSelectTile: (tile: LedgerTile) => void;
  onOpenNode: (nodeId: string) => void;
}) {
  const section: LedgerSection | null = activeTile?.section ?? null;
  return (
    <div className="ledger-body">
      <LedgerMosaic
        rows={source.tileRows}
        activeId={activeTile?.id ?? null}
        onSelect={onSelectTile}
      />
      <LedgerOptions
        options={source.options}
        active={section === "options"}
        onOpenNode={onOpenNode}
      />
      <LedgerFamilies
        families={source.families}
        ownRules={source.ownRules}
        totalRules={source.rules}
        active={section === "rules"}
        activeFamilyId={activeTile?.nodeId ?? null}
        onOpenNode={onOpenNode}
      />
    </div>
  );
}

export function LedgerCard({
  source,
  open,
  onToggle,
  onOpenNode,
}: {
  source: LedgerSource;
  /** Owned by the ledger — a new run shuts every card. */
  open: boolean;
  onToggle: () => void;
  /** Opens a preset's node — i.e. switches to the tree, selected on it. */
  onOpenNode: (nodeId: string) => void;
}) {
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const tiles = source.tileRows.flat();
  const activeTile = tiles.find((tile) => tile.id === activeTileId) ?? null;
  return (
    <div
      className={`card ledger-card${source.failed ? " failed" : ""}`}
      id={ledgerCardId(source.nodeId)}
    >
      <div className="ledger-head">
        <LedgerCardToggle source={source} open={open} onToggle={onToggle} />
        <a className="ledger-docs" href={source.docsUrl} target="_blank" rel="noreferrer">
          docs ↗
        </a>
      </div>
      {open && source.failed ? <p className="empty-note">{source.error}</p> : null}
      {open && !source.failed ? (
        <LedgerCardBody
          source={source}
          activeTile={activeTile}
          // Clicking the selected tile again clears the highlight — the
          // selection is a lens, and a lens has to come off.
          onSelectTile={(tile) => setActiveTileId((id) => (id === tile.id ? null : tile.id))}
          onOpenNode={onOpenNode}
        />
      ) : null}
    </div>
  );
}
