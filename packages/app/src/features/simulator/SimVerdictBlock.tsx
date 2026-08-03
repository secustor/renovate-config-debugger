import { Fragment } from "react";
import type { SimulationResult } from "@renovate-config-visualizer/engine";
import { CopyButton } from "@/components/CopyButton";
import type { ConsumedBlock } from "./consumed-blocks";
import type { RuleEvidence } from "./rule-evidence";
import { SimConsumedBlock } from "./SimConsumedBlock";
import type { ThreadModel } from "./verdict-threads";
import type { VerdictSegment } from "./verdict-sentence";
import { VerdictThreads } from "./VerdictThreads";

/**
 * Roadmap 053 (variant A): the two full-trace links the evidence drawers
 * demote to. The card answers the question; the drawers below it are where
 * someone goes to audit the whole run, so they get one quiet line — and "N of
 * M" is stated ONCE on the card, here.
 */
function VerdictTraceLinks({
  matchedCount,
  totalRules,
  replayStops,
  onJumpToRules,
  onJumpToReplay,
}: {
  matchedCount: number;
  totalRules: number;
  replayStops: number;
  onJumpToRules: () => void;
  onJumpToReplay?: () => void;
}) {
  return (
    <span className="sim-trace-links">
      Full trace:{" "}
      <button type="button" className="sim-jump" onClick={onJumpToRules}>
        {matchedCount} of {totalRules} rule{totalRules === 1 ? "" : "s"} matched
      </button>
      {onJumpToReplay ? " · " : null}
      {onJumpToReplay ? (
        <button type="button" className="sim-trace-jump" onClick={onJumpToReplay}>
          build replay, {replayStops} stop{replayStops === 1 ? "" : "s"}
        </button>
      ) : null}
    </span>
  );
}

/**
 * Roadmap 012/018/040/046/053: the answer first — the verdict CARD directly
 * under the Simulate button. An answer band (eyebrow naming the simulated
 * update, then the sentence with the modal verbs badged), the THREAD ledger of
 * settings the rules changed (053: each row expands into that key's own causal
 * story), the consumed-blocks aside when an AUTHORED update-type block was
 * consumed without applying (047 — default-only consumption says nothing and
 * renders nothing), and a footer with the two full-trace links and the
 * evidence-export affordances (share link, A/B pinning).
 */
export function SimVerdictBlock({
  matchedCount,
  totalRules,
  segments,
  threads,
  flattened,
  consumed,
  flattenStopIndex,
  replayStops,
  dep,
  onSelectPreset,
  onJumpToStep,
  onJumpToRules,
  onJumpToReplay,
  evidenceFor,
  onOpenRule,
  copySimLink,
  pinned,
  onUnpin,
  onPin,
}: {
  matchedCount: number;
  totalRules: number;
  segments: VerdictSegment[];
  /** Roadmap 053: one thread per setting the rules changed. */
  threads: ThreadModel[];
  flattened: SimulationResult["flattened"];
  /** Roadmap 047: authored update-type blocks flattening consumed without
   *  applying — empty on a run where only Renovate's own defaults were. */
  consumed: ConsumedBlock[];
  /** The flatten stop's position on the merge timeline, when it renders. */
  flattenStopIndex?: number;
  /** Roadmap 053: how many stops the build replay has, for its trace link. */
  replayStops: number;
  /** The simulated update, for the card's eyebrow line. */
  dep: { manager?: string; packageName?: string; currentValue?: string; newValue?: string } | null;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
  onJumpToRules: () => void;
  /** Roadmap 053: open the build replay where it currently stands — absent
   *  when this run has no timeline to open. */
  onJumpToReplay?: () => void;
  /** Roadmap 053 layer 3: the rule-evidence popover's model, and the jump its
   *  footer offers into the matched-rules drawer. */
  evidenceFor?: (ruleIndex: number) => RuleEvidence;
  onOpenRule?: (ruleIndex: number) => void;
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
        {threads.length === 0 ? (
          <p className="sim-verdict-none">
            No rule changed anything for this dependency — the defaults apply.
          </p>
        ) : (
          <VerdictThreads
            threads={threads}
            actions={{ onSelectPreset, onJumpToStep, evidenceFor, onOpenRule }}
          />
        )}
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
        <VerdictTraceLinks
          matchedCount={matchedCount}
          totalRules={totalRules}
          replayStops={replayStops}
          onJumpToRules={onJumpToRules}
          onJumpToReplay={onJumpToReplay}
        />
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
