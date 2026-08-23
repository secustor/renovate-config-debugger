import type { ReactNode } from "react";
import type { ProvenanceLayer } from "@renovate-config-debugger/engine";
import { ApproximateMark } from "./DescriptionApprox";
import { PresetName } from "./PresetName";
import { ProvenanceChip } from "./ProvenanceChip";

/**
 * THE "who wrote this" cell. Four surfaces answer that question — the
 * Overview's topic rows, the blame ledger's lines, the same ledger's dropped
 * footnote, and the effective config's cascade steps — and each of them used to
 * hand-build the same three decisions: mark it when the attribution is a guess,
 * render a preset as the standard `PresetName` token (081: "purple = preset,
 * everywhere"), and fall back to the layer's `ProvenanceChip` when the writer is
 * not a preset at all. The four agreed on the rule and drifted on the details —
 * one of them rendered a preset as a `ProvenanceChip` literal, which is the
 * single exception 081 exists to forbid.
 *
 * What the four genuinely differ about stays props, because the differences are
 * real: WHICH preset counts as the writer (the leaf node, the enclosing node,
 * the `writtenBy` originator, the direct extend) is derived per surface from
 * data only that surface has, and what the `≈` names alongside it follows from
 * that choice. This component takes the answers; it does not re-derive them.
 *
 * The jump is `nodeId`-gated rather than `onSelectPreset`-gated: a preset with
 * no row in the resolution tree — the root node, which is the input config and
 * not a preset — must render as an inert token, or the cell offers "show it in
 * the preset tree" and selects a node that never renders.
 */
export interface SourcePreset {
  /** The preset as the config writes it — `config:recommended`, `github>a/b`. */
  name: string;
  /**
   * Its node in this run's tree. `undefined` for a writer the tree has no row
   * for (the root), which makes the token inert — see above.
   */
  nodeId?: string;
}

export function LayerSource({
  preset,
  layer,
  approximate = false,
  approximateName,
  className,
  onSelectPreset,
  children,
}: {
  /** The preset that wrote it, when the writer IS one. Wins over `layer`. */
  preset?: SourcePreset | null;
  /** The arrival layer, worn as a chip when there is no preset to name. */
  layer?: ProvenanceLayer | null;
  /** The engine attributed this by degrading to an enclosing node (069). */
  approximate?: boolean;
  /** What the `≈`'s title names as the approximated thing — the token beside
   *  it, whatever that resolved to. The two must never disagree. */
  approximateName?: string;
  /**
   * The cell's own wrapper class. Omitted renders no wrapper at all: the
   * cascade step puts its token straight into the step's head row, beside a
   * verb and two badges that are its siblings, so a wrapper there would be a
   * box around one third of a line.
   */
  className?: string;
  onSelectPreset?: (nodeId: string) => void;
  /** Anything the cell says AFTER the token — the dropped row's reason. */
  children?: ReactNode;
}) {
  const nodeId = preset?.nodeId;
  const body = (
    <>
      {approximate ? <ApproximateMark name={approximateName} /> : null}
      {preset ? (
        <PresetName
          name={preset.name}
          nodeId={nodeId}
          onClick={
            nodeId !== undefined && onSelectPreset ? () => onSelectPreset(nodeId) : undefined
          }
        />
      ) : layer ? (
        <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} />
      ) : null}
      {children}
    </>
  );
  return className === undefined ? body : <span className={className}>{body}</span>;
}
