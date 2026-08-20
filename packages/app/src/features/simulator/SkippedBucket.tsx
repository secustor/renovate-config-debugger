import { nf } from "@/lib/format";
import { useState } from "react";
import type { PinBucket } from "./pin-outcome";

/**
 * Roadmap 075 (iteration 6): one count-bucket of rules a pin card does not list
 * — "412 rules from config:recommended that didn’t match". Opening it shows a
 * few of them by index, which is enough to take the question into the simulator
 * (where the full rule list, its filters and its clause evidence live); the
 * card itself deliberately never grows a second rules drawer.
 */
export function SkippedBucket({ bucket }: { bucket: PinBucket }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pin-bucket">
      <button
        type="button"
        className="pin-bucket-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="caret">{open ? "▾" : "▸"}</span>
        <strong>{nf.format(bucket.count)}</strong> {bucket.label}
      </button>
      {open ? (
        <p className="pin-bucket-samples">
          {bucket.samples.map((index) => (
            <code key={index}>packageRules[{index}]</code>
          ))}
          {bucket.count > bucket.samples.length ? <span className="pin-bucket-more">…</span> : null}
        </p>
      ) : null}
    </div>
  );
}
