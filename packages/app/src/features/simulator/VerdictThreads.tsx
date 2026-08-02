import { useState } from "react";
import type { ProvenanceLayer } from "@renovate-config-visualizer/engine";
import { OptionKey } from "@/components/option-docs";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { previewValue } from "./rule-format";
import { ThreadBody } from "./ThreadBody";
import type { ThreadModel } from "./verdict-threads";

/**
 * Roadmap 053 (variant A): the verdict card's ledger IS the trace. Collapsed,
 * it reads as the 046 ledger did — the settings the rules changed, their final
 * values, where each came from — but every row expands into that key's own
 * causal thread (`ThreadBody`), so the three grains the 047 layout re-stated
 * (ledger, per-rule applied list, step diff) collapse into one place per fact.
 *
 * Rows share the list's columns via `subgrid`, so values start on one common
 * edge instead of wherever the key happens to end.
 */

/** The key cell: the disclosure caret plus the option name, with its docs
 *  hover card intact (`OptionKey` is a plain span, safe inside the button). */
function ThreadHeadKey({ name, open }: { name: string; open: boolean }) {
  return (
    <span className="sim-thread-key">
      <span className="sim-thread-caret">{open ? "▾" : "▸"}</span>{" "}
      <code>
        <OptionKey name={name} flagUnknown />
      </code>
    </span>
  );
}

/** The value cell: what the config ends up with, and — the case the 046 ledger
 *  made invisible — a badge when more than one stop wrote this key. */
function ThreadHeadValue({ thread }: { thread: ThreadModel }) {
  return (
    <span className="sim-thread-value">
      {thread.present ? (
        <span className="sim-thread-final">{previewValue(thread.finalValue, 80)}</span>
      ) : (
        <span className="sim-thread-final removed">removed</span>
      )}
      {thread.writerCount > 1 ? (
        <span className="badge count sim-thread-writers">{thread.writerCount} writers</span>
      ) : null}
    </span>
  );
}

/** The origin cell — kept as a cell even when empty so the column holds. */
function ThreadHeadOrigin({
  layer,
  onSelectPreset,
}: {
  layer?: ProvenanceLayer;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <span className="sim-thread-origin">
      {layer ? <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} /> : null}
    </span>
  );
}

/** One thread: the collapsed head button, and the body it discloses.
 *  Expansion is local and uncontrolled — a re-simulation replaces the rows and
 *  collapses them, which is the honest state for a new run's evidence. */
function ThreadRow({
  thread,
  onSelectPreset,
  onJumpToStep,
}: {
  thread: ThreadModel;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`sim-thread${open ? " open" : ""}`}>
      <button
        type="button"
        className="sim-thread-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ThreadHeadKey name={thread.key} open={open} />
        <ThreadHeadValue thread={thread} />
        <ThreadHeadOrigin layer={thread.winner?.layer} onSelectPreset={onSelectPreset} />
      </button>
      {open ? (
        <ThreadBody thread={thread} onSelectPreset={onSelectPreset} onJumpToStep={onJumpToStep} />
      ) : null}
    </li>
  );
}

export function VerdictThreads({
  threads,
  onSelectPreset,
  onJumpToStep,
}: {
  threads: ThreadModel[];
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
}) {
  return (
    <ul className="sim-thread-list">
      {threads.map((thread) => (
        <ThreadRow
          key={thread.key}
          thread={thread}
          onSelectPreset={onSelectPreset}
          onJumpToStep={onJumpToStep}
        />
      ))}
    </ul>
  );
}
