import { Fragment } from "react";
import { Term } from "@/components/glossary";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import type { ConsumedBlock } from "./consumed-blocks";

/** Roadmap 047: the aside itself — one line per authored block that didn't
 *  apply, naming its own keys, its source preset when that is unambiguous,
 *  and why it stayed inert. */
export function SimConsumedBlock({
  block,
  updateType,
  flattenStopIndex,
  onSelectPreset,
  onJumpToStep,
}: {
  block: ConsumedBlock;
  updateType?: string;
  flattenStopIndex?: number;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
}) {
  return (
    <p className="sim-consumed-note">
      <span className="sim-consumed-glyph">⊘</span> Your <code>{block.key}</code> block
      {block.keys.length > 0 || block.layer ? (
        <>
          {" ("}
          {block.keys.map((key, i) => (
            <Fragment key={key}>
              {i > 0 ? ", " : null}
              <code>{key}</code>
            </Fragment>
          ))}
          {block.layer ? (
            <>
              {block.keys.length > 0 ? ", " : null}
              from <ProvenanceChip layer={block.layer} onSelectPreset={onSelectPreset} />
            </>
          ) : null}
          {")"}
        </>
      ) : null}{" "}
      didn&apos;t apply —{" "}
      {updateType === undefined ? (
        <>
          no <Term id="updateType">updateType</Term> is set; fill the version pair or pick one to
          see it apply.
        </>
      ) : (
        <>
          this is a <code>{updateType}</code> update.
        </>
      )}
      {flattenStopIndex !== undefined && onJumpToStep !== undefined ? (
        <>
          {" "}
          <button
            type="button"
            className="sim-step-link"
            onClick={() => onJumpToStep(flattenStopIndex)}
          >
            see the flatten step →
          </button>
        </>
      ) : null}
    </p>
  );
}
