import { Fragment } from "react";
import type { SimulationResult } from "@renovate-config-visualizer/engine";
import { CopyButton } from "@/components/CopyButton";
import { Term } from "@/components/glossary";
import { OptionKey } from "@/components/option-docs";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import type { ConsumedBlock } from "./consumed-blocks";
import { previewValue } from "./rule-format";
import { SimConsumedBlock } from "./SimConsumedBlock";
import type { VerdictChange } from "./verdict-changes";
import type { VerdictSegment } from "./verdict-sentence";

/** Roadmap 012/040/046: one row of the verdict card's ledger — the option a
 *  rule set, its value, (when the update-type block supplied it) where it came
 *  from, the owning layer's provenance chip, and a jump into the merge
 *  timeline. Its own component since 040's depth ratchet. */
function VerdictKeyRow({
  change,
  fromUpdateType,
  updateType,
  onSelectPreset,
  onJumpToStep,
}: {
  change: VerdictChange;
  fromUpdateType: boolean;
  updateType?: string;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
}) {
  return (
    <li>
      <code>
        <OptionKey name={change.key} flagUnknown />
      </code>
      {change.present ? (
        <>
          {" = "}
          <span className="sim-verdict-value">{previewValue(change.value, 80)}</span>
          {fromUpdateType ? (
            <span className="sim-verdict-from">
              {" "}
              from the <Term id="updateType">{updateType}</Term> block
            </span>
          ) : null}
        </>
      ) : (
        <span className="sim-verdict-value removed"> removed</span>
      )}
      {change.layer ? (
        <span className="sim-verdict-origin">
          <ProvenanceChip layer={change.layer} onSelectPreset={onSelectPreset} />
        </span>
      ) : null}
      {change.stopIndex !== undefined && onJumpToStep !== undefined ? (
        <button
          type="button"
          className="sim-step-link"
          onClick={() => onJumpToStep(change.stopIndex as number)}
        >
          {change.stopLabel ?? "see the step"} →
        </button>
      ) : null}
    </li>
  );
}

/** Roadmap 046: the ledger of settings the rules genuinely changed — the
 *  verdict card's evidence, one row per key. */
function VerdictLedger({
  changes,
  flattened,
  onSelectPreset,
  onJumpToStep,
}: {
  changes: VerdictChange[];
  flattened: SimulationResult["flattened"];
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
}) {
  if (changes.length === 0) {
    return (
      <p className="sim-verdict-none">
        No rule changed anything for this dependency — the defaults apply.
      </p>
    );
  }
  return (
    <>
      <p className="sim-verdict-ledger-label">
        Changed by the rules — {changes.length} setting{changes.length === 1 ? "" : "s"}
      </p>
      <ul className="sim-verdict-keys">
        {changes.map((change) => (
          <VerdictKeyRow
            key={change.key}
            change={change}
            fromUpdateType={flattened.merged.some((m) => m.key === change.key)}
            updateType={flattened.updateType}
            onSelectPreset={onSelectPreset}
            onJumpToStep={onJumpToStep}
          />
        ))}
      </ul>
    </>
  );
}

/**
 * Roadmap 012/018/040/046: the answer first — the verdict CARD directly under
 * the Simulate button. An answer band (eyebrow naming the simulated update,
 * then the sentence with the modal verbs badged), the ledger of settings the
 * rules genuinely changed (with provenance and jumps into the merge timeline),
 * the consumed-blocks aside when an AUTHORED update-type block was consumed
 * without applying (047 — default-only consumption says nothing and renders
 * nothing), and a footer with the rule-list jump and the evidence-export
 * affordances (share link, A/B pinning).
 */
export function SimVerdictBlock({
  matchedCount,
  totalRules,
  segments,
  changes,
  flattened,
  consumed,
  flattenStopIndex,
  dep,
  onSelectPreset,
  onJumpToStep,
  onJumpToRules,
  copySimLink,
  pinned,
  onUnpin,
  onPin,
}: {
  matchedCount: number;
  totalRules: number;
  segments: VerdictSegment[];
  changes: VerdictChange[];
  flattened: SimulationResult["flattened"];
  /** Roadmap 047: authored update-type blocks flattening consumed without
   *  applying — empty on a run where only Renovate's own defaults were. */
  consumed: ConsumedBlock[];
  /** The flatten stop's position on the merge timeline, when it renders. */
  flattenStopIndex?: number;
  /** The simulated update, for the card's eyebrow line. */
  dep: { manager?: string; packageName?: string; currentValue?: string; newValue?: string } | null;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
  onJumpToRules: () => void;
  /** null when the host gave no share-link callback — no button then. */
  copySimLink: (() => Promise<void>) | null;
  pinned: boolean;
  onUnpin: () => void;
  onPin: () => void;
}) {
  const depName = [dep?.manager, dep?.packageName].filter(Boolean).join(" / ");
  const versions = dep?.currentValue
    ? `${dep.currentValue}${dep.newValue ? ` → ${dep.newValue}` : ""}`
    : "";
  return (
    <div className={`sim-verdict-block${matchedCount === 0 ? " none" : ""}`}>
      <div className="sim-verdict-band">
        <p className="sim-verdict-eyebrow">
          Simulation
          {depName ? ` · ${depName}` : ""}
          {versions ? ` · ${versions}` : ""}
        </p>
        <p className="sim-verdict-sentence">
          {segments.map((seg) =>
            // Content-keyed: the sentence grammar never repeats a segment
            // (subject, at most one of each modal, distinct clause texts).
            typeof seg === "string" ? (
              <Fragment key={`s:${seg}`}>{seg}</Fragment>
            ) : (
              <span
                key={`m:${seg.modal}`}
                className={`sim-modal-verb${seg.modal === "would not" ? " not" : ""}`}
              >
                {seg.modal}
              </span>
            ),
          )}
        </p>
      </div>
      <div className="sim-verdict-body">
        <VerdictLedger
          changes={changes}
          flattened={flattened}
          onSelectPreset={onSelectPreset}
          onJumpToStep={onJumpToStep}
        />
        {consumed.map((block) => (
          <SimConsumedBlock
            key={block.key}
            block={block}
            updateType={flattened.updateType}
            flattenStopIndex={flattenStopIndex}
            onSelectPreset={onSelectPreset}
            onJumpToStep={onJumpToStep}
          />
        ))}
      </div>
      <div className="sim-verdict-foot">
        <button type="button" className="sim-jump" onClick={onJumpToRules}>
          {matchedCount} of {totalRules} rule{totalRules === 1 ? "" : "s"} matched →
        </button>
        {/* Roadmap 018: evidence-export affordances on the verdict card —
            a reproducible link (form + auto-run encoded) and A/B pinning. */}
        <div className="sim-verdict-actions">
          {copySimLink ? (
            <CopyButton onCopy={copySimLink} label="Copy link with this simulation" />
          ) : null}
          {pinned ? (
            <button type="button" className="sim-verdict-action" onClick={onUnpin}>
              Unpin comparison
            </button>
          ) : (
            <button
              type="button"
              className="sim-verdict-action"
              onClick={onPin}
              title="Pin this result as A, edit the config, then simulate again to compare"
            >
              Pin result for comparison
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
