import { useState } from "react";
import { Caret } from "@/components/Caret";
import { nf } from "@/lib/format";
import type { PinBucket } from "./pin-outcome";

/**
 * The funnel's skip buckets (Proposal F / "Skip Reason Funnel"): the rules the
 * card does not list one by one, collapsed BY REASON — "package not in the
 * rule's monorepo family", "replacement rules", "matcher on a different axis"
 * — one line per family or sample on expand, never one per rule. Every row
 * hands its identity to the probe below, which is where "show me that one"
 * gets answered.
 */

function BucketRows({ bucket, onProbe }: { bucket: PinBucket; onProbe: (query: string) => void }) {
  return (
    <div className="pin-bucket-rows">
      {bucket.rows.map((row) => (
        <div key={row.key} className="pin-bucket-row">
          <code className="pin-bucket-row-label">{row.label}</code>
          <span className="pin-bucket-row-note">{row.note}</span>
          <button
            type="button"
            className="btn-quiet pin-bucket-probe"
            onClick={() => onProbe(row.probeQuery)}
          >
            probe
          </button>
        </div>
      ))}
      {bucket.more === undefined ? null : <p className="pin-bucket-more">{bucket.more}</p>}
    </div>
  );
}

function BucketItem({ bucket, onProbe }: { bucket: PinBucket; onProbe: (query: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="pin-bucket-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Caret open={open} />
        <span className="pill pill-count">{nf.format(bucket.count)} skipped</span>
        <span className="pin-bucket-reason">{bucket.reason}</span>
        <span className="pin-bucket-source">{bucket.source}</span>
      </button>
      {open ? <BucketRows bucket={bucket} onProbe={onProbe} /> : null}
    </div>
  );
}

export function PinBucketList({
  buckets,
  onProbe,
}: {
  buckets: PinBucket[];
  onProbe: (query: string) => void;
}) {
  return (
    <div className="pin-buckets">
      {buckets.map((bucket) => (
        <BucketItem key={bucket.id} bucket={bucket} onProbe={onProbe} />
      ))}
    </div>
  );
}
