import { nf } from "@/lib/format";
import type { PinChip } from "./pin-outcome";

/**
 * Roadmap 075 (iteration 6): a pin's outcome as the standard pills — what the
 * rules DID to this update (grouped, automerge, or the honest "default
 * behavior"), then the neutral count of how many rules it took to get there.
 */
export function PinChips({
  chips,
  matched,
  total,
}: {
  chips: PinChip[];
  matched: number;
  total: number;
}) {
  return (
    <div className="pin-chips">
      {chips.map((chip) => (
        <span key={chip.label} className={`pill pill-${chip.tone}`}>
          {chip.label}
        </span>
      ))}
      <span className="pill pill-count">
        {nf.format(matched)} of {nf.format(total)} rules
      </span>
    </div>
  );
}
