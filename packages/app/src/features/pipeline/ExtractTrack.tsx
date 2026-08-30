import type { ExtractNode, ExtractNodeId } from "./extract-phase";

/**
 * Roadmap 090 — the Extract phase's own three-step track: match managers,
 * scan files, extract deps.
 *
 * Deliberately the stage rail's grammar (a dot on a line, a name, a delta
 * under it) and deliberately NOT `StageRail` itself: that component is typed
 * on the engine's `StageId` and reads a `TraceResult` for its glyphs, neither
 * of which exists here — extraction is not a pipeline stage. What is shared is
 * what should be: the geometry and the glyph, through the rail's own classes,
 * so the two tracks cannot drift apart visually.
 */

function ExtractTrackNode({
  node,
  selected,
  onSelect,
}: {
  node: ExtractNode;
  selected: boolean;
  onSelect: (id: ExtractNodeId) => void;
}) {
  return (
    <li className="stage-rail-node">
      <button
        type="button"
        className={`stage-rail-btn${selected ? " selected" : ""}`}
        data-extract-node={node.id}
        aria-pressed={selected}
        aria-label={`${node.label}: ${node.outcome}`}
        onClick={() => onSelect(node.id)}
      >
        <span className="stage-rail-glyph clean" aria-hidden="true" />
        <span className="stage-rail-label">{node.label}</span>
        <span className={`stage-rail-delta ${node.metaTone}`} aria-hidden="true">
          {node.meta}
        </span>
      </button>
    </li>
  );
}

export function ExtractTrack({
  nodes,
  selected,
  onSelect,
}: {
  nodes: readonly ExtractNode[];
  selected: ExtractNodeId;
  onSelect: (id: ExtractNodeId) => void;
}) {
  return (
    <ol className="stage-rail" aria-label="Extraction steps">
      {nodes.map((node) => (
        <ExtractTrackNode
          key={node.id}
          node={node}
          selected={node.id === selected}
          onSelect={onSelect}
        />
      ))}
    </ol>
  );
}
