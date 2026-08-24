import { Fragment } from "react";
import type { SimulationResult } from "@renovate-config-debugger/engine";
import { CopyButton } from "@/components/CopyButton";
import type { ConsumedBlock } from "@/lib/consumed-blocks";
import type { VerdictSegment } from "@/lib/verdict-sentence";
import type { RuleEvidence } from "./rule-evidence";
import { SimConsumedBlock } from "./SimConsumedBlock";
import type { ThreadModel } from "./verdict-threads";
import { type ThreadNavigation, VerdictThreads } from "./VerdictThreads";
import { pluralWord } from "@/lib/format";

/**
 * Roadmap 054 (variant A): the two full-trace links the evidence drawers
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
        {matchedCount} of {totalRules} {pluralWord(totalRules, "rule")} matched
      </button>
      {onJumpToReplay ? " · " : null}
      {onJumpToReplay ? (
        <button type="button" className="sim-jump" onClick={onJumpToReplay}>
          build replay, {replayStops} {pluralWord(replayStops, "stop")}
        </button>
      ) : null}
    </span>
  );
}

/**
 * Roadmap 012/018/040/046/054: the answer first — the verdict CARD directly
 * under the Simulate button. An answer band (eyebrow naming the simulated
 * update, then the sentence with the modal verbs badged), the THREAD ledger of
 * settings the rules changed (054: each row expands into that key's own causal
 * story), the consumed-blocks aside when an AUTHORED update-type block was
 * consumed without applying (047 — default-only consumption says nothing and
 * renders nothing), and a footer with the two full-trace links and the
 * evidence-export affordance (the share link — roadmap 080 retired the A/B pin
 * that used to sit beside it).
 */
export function SimVerdictBlock({
  matchedCount,
  totalRules,
  segments,
  caveat,
  threads,
  threadNav,
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
}: {
  matchedCount: number;
  totalRules: number;
  segments: VerdictSegment[];
  /** Replay-02 R3: "N of your rules failed only because a field was left
   *  unset" — rendered right under the sentence, because the sentence is what
   *  gets screenshotted. Absent when every no-match lost on real data. */
  caveat?: string;
  /** Roadmap 054: one thread per setting the rules changed. */
  threads: ThreadModel[];
  /** Roadmap 054 layer 4: which threads are expanded, and where a jump out of
   *  one is recorded (the return pill's origin). */
  threadNav: ThreadNavigation;
  flattened: SimulationResult["flattened"];
  /** Roadmap 047: authored update-type blocks flattening consumed without
   *  applying — empty on a run where only Renovate's own defaults were. */
  consumed: ConsumedBlock[];
  /** The flatten stop's position on the merge timeline, when it renders. */
  flattenStopIndex?: number;
  /** Roadmap 054: how many stops the build replay has, for its trace link. */
  replayStops: number;
  /** The simulated update, for the card's eyebrow line. */
  dep: { manager?: string; packageName?: string; currentValue?: string; newValue?: string } | null;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
  onJumpToRules: () => void;
  /** Roadmap 054: open the build replay where it currently stands — absent
   *  when this run has no timeline to open. */
  onJumpToReplay?: () => void;
  /** Roadmap 054 layer 3: the rule-evidence popover's model, and the jump its
   *  footer offers into the matched-rules drawer. */
  evidenceFor?: (ruleIndex: number) => RuleEvidence;
  onOpenRule?: (ruleIndex: number) => void;
  /** null when the host gave no share-link callback — no button then. */
  copySimLink: (() => Promise<void>) | null;
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
        {caveat ? <p className="sim-verdict-caveat">⚠ {caveat}</p> : null}
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
            nav={threadNav}
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
        {/* Roadmap 018: the evidence-export affordance on the verdict card — a
            reproducible link (form + auto-run encoded). Roadmap 080 retired the
            A/B pin that used to sit beside it: keeping a descriptor across an
            edit is what a pinned test is, and config-vs-config diffing is
            `rcd compare`'s. */}
        <div className="sim-verdict-actions">
          {copySimLink ? (
            <CopyButton onCopy={copySimLink} label="Copy link with this simulation" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
