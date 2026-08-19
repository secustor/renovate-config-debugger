import type { CSSProperties } from "react";
import { type LedgerTile, tileFractions, tileStrength } from "./ledger";

/**
 * Roadmap 075 (iteration 5b): the contribution mosaic — one tile per family of
 * things a source brought in, sized by how much of it each family IS. The
 * point is the proportion: `config:recommended` is not "1,084 presets", it is
 * "mostly monorepo grouping, plus a handful that set options".
 *
 * The tiles are also the card's selector: clicking one highlights the section
 * below that lists what the tile counts (the design's selection grammar —
 * accent outline on the tile, accent border on its section). The `routers ∅`
 * tile is deliberately NOT a control: pure `extends` routers contribute
 * nothing, so there is no section for it to open — it is there so the
 * proportions add up honestly.
 */

function tileClass(tile: LedgerTile, fraction: number, active: boolean): string {
  const strength = tile.kind === "family" ? ` s${tileStrength(fraction)}` : "";
  return `ledger-tile ledger-tile-${tile.kind}${strength}${active ? " active" : ""}`;
}

function TileBody({ tile }: { tile: LedgerTile }) {
  return (
    <>
      <span className="ledger-tile-label">{tile.label}</span>
      <span className="ledger-tile-detail">{tile.detail}</span>
    </>
  );
}

function MosaicTile({
  tile,
  fraction,
  active,
  onSelect,
}: {
  tile: LedgerTile;
  fraction: number;
  active: boolean;
  onSelect: (tile: LedgerTile) => void;
}) {
  const className = tileClass(tile, fraction, active);
  if (!tile.section) {
    return (
      <div className={className} title="Presets that only extend other presets">
        <TileBody tile={tile} />
      </div>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-pressed={active}
      // A narrow tile clips its own label — the proportions are the point, so
      // the full name lives in the tooltip rather than in a wider tile.
      title={`${tile.label} — ${tile.detail}`}
      onClick={() => onSelect(tile)}
    >
      <TileBody tile={tile} />
    </button>
  );
}

function MosaicRow({
  tiles,
  activeId,
  onSelect,
}: {
  tiles: LedgerTile[];
  activeId: string | null;
  onSelect: (tile: LedgerTile) => void;
}) {
  const fractions = tileFractions(tiles.map((tile) => tile.count));
  // Proportional tracks, computed from the real counts — the one place in this
  // view that has to be an inline style, since the numbers are per run.
  const style: CSSProperties = {
    gridTemplateColumns: fractions.map((f) => `${f.toFixed(4)}fr`).join(" "),
  };
  return (
    <div className="ledger-mosaic-row" style={style}>
      {tiles.map((tile, i) => (
        <MosaicTile
          key={tile.id}
          tile={tile}
          fraction={fractions[i] ?? 0}
          active={tile.id === activeId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function LedgerMosaic({
  rows,
  activeId,
  onSelect,
}: {
  rows: LedgerTile[][];
  activeId: string | null;
  onSelect: (tile: LedgerTile) => void;
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="ledger-mosaic">
      {rows.map((tiles) => (
        // Roadmap 041 — the row's identity is its first tile's, which is
        // stable per run: the rows are "the families" and "what they add up
        // to", built once by `tileRowsFor` and never reordered.
        <MosaicRow key={tiles[0]?.id} tiles={tiles} activeId={activeId} onSelect={onSelect} />
      ))}
    </div>
  );
}
