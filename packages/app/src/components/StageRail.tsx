import { useMemo } from "react";
import type { StageId, TraceResult } from "@renovate-config-debugger/engine";
import { Explained, Term } from "./glossary";
import type { HoverCardHandlers } from "./hover-card";
import { presetTreeSummary } from "./preset-tree-stats";
import { STAGE_EXPLAINERS, STAGE_LABELS, STAGE_SHORT_LABELS } from "@/data/stage-copy";
import { STAGE_IDS } from "@/lib/input-schemas";
import { describeStageActivity, getStageActivity, type StageActivity } from "@/lib/stage-activity";
import { stageDelta, type StageDelta, type StageDeltaFacts } from "@/lib/stage-delta";
import type { TermId } from "@/data/glossary-data";

/**
 * Roadmap 075 (v2, iteration 4) — the pipeline rail: one node per stage on a
 * single line, each carrying 024's status glyph, the stage's name and its
 * delta (`stage-delta.ts`). It replaces 046's chip timeline INSIDE the
 * Pipeline tab only: the chip grammar (`SequenceTimeline`) is still the
 * simulator's merge sequence, which is a variable-length path through
 * `packageRules`, not a fixed row of eight columns.
 *
 * The landing's static preview (iteration 2) is the same component in
 * `preview` mode rather than a second rail: one geometry, one set of glyph
 * shapes, one stylesheet block — so the teaser cannot drift from the thing it
 * is teasing.
 */

// Roadmap 033: the app's single stage list (satisfies-checked against the
// engine's exported STAGE_IDS), already in execution order.
const STAGE_ORDER: readonly StageId[] = STAGE_IDS;

/** The stages that name a Renovate concept carry its glossary card on the
 *  landing, where `STAGE_EXPLAINERS` (which describe a RUN's stage) would be
 *  talking about a run that has not happened yet. */
const PREVIEW_TERMS: Partial<Record<StageId, TermId>> = {
  global: "globalConfig",
  inherit: "inheritedConfig",
  migrate: "migration",
  massage: "massage",
  validate: "validation",
  preset: "preset",
};

/** The delta is glyph shorthand, so it is never spoken: its meaning reaches a
 *  screen reader through the button's accessible name instead. */
function StageNodeDelta({ delta }: { delta: StageDelta | null }) {
  return (
    <span className={`stage-rail-delta ${delta?.tone ?? "dim"}`} aria-hidden="true">
      {delta?.text ?? ""}
    </span>
  );
}

interface StageNodeButtonProps {
  stage: StageId;
  activity: StageActivity;
  delta: StageDelta | null;
  selected: boolean;
  onSelect: (stage: StageId) => void;
  handlers: HoverCardHandlers;
}

function StageNodeButton({
  stage,
  activity,
  delta,
  selected,
  onSelect,
  handlers,
}: StageNodeButtonProps) {
  const spoken = describeStageActivity(stage, STAGE_LABELS[stage], activity);
  return (
    <button
      type="button"
      className={`stage-rail-btn${selected ? " selected" : ""}`}
      data-stage={stage}
      aria-pressed={selected}
      aria-label={delta?.announce ? `${spoken}, ${delta.announce}` : spoken}
      onClick={() => onSelect(stage)}
      {...handlers}
    >
      <span className={`stage-rail-glyph ${activity.level}`} aria-hidden="true" />
      <span className="stage-rail-label">{STAGE_SHORT_LABELS[stage]}</span>
      <StageNodeDelta delta={delta} />
    </button>
  );
}

interface StageNodeProps {
  result: TraceResult;
  stage: StageId;
  facts: StageDeltaFacts;
  selected: boolean;
  onSelect: (stage: StageId) => void;
}

/** One live node. Its own component for the depth ratchet — and because the
 *  glossary card belongs to the node, not to the rail. */
function StageNode({ result, stage, facts, selected, onSelect }: StageNodeProps) {
  const activity = getStageActivity(result, stage);
  return (
    <li className="stage-rail-node">
      <Explained entry={STAGE_EXPLAINERS[stage]}>
        {(handlers) => (
          <StageNodeButton
            stage={stage}
            activity={activity}
            delta={stageDelta(stage, activity, facts)}
            selected={selected}
            onSelect={onSelect}
            handlers={handlers}
          />
        )}
      </Explained>
    </li>
  );
}

interface Props {
  result: TraceResult;
  selected: StageId;
  onSelect: (stage: StageId) => void;
  /** Keys in the effective config, or null while provenance is still being
   *  computed — the merge node's delta (see `stage-delta.ts`). */
  effectiveKeys: number | null;
}

export function StageRail({ result, selected, onSelect, effectiveKeys }: Props) {
  // The tree summary is cached per tree, and this is the same derivation the
  // Presets badge counts with — the rail quotes it, it does not recount.
  const presetCount = useMemo(
    () => presetTreeSummary(result.presetTree)?.resolved ?? 0,
    [result.presetTree],
  );
  const facts: StageDeltaFacts = { presetCount, effectiveKeys };
  return (
    <ol className="stage-rail" aria-label="Pipeline stages">
      {STAGE_ORDER.map((stage) => (
        <StageNode
          key={stage}
          result={result}
          stage={stage}
          facts={facts}
          selected={stage === selected}
          onSelect={onSelect}
        />
      ))}
    </ol>
  );
}

/** One preview node: the same column and the same glyph geometry, hollow and
 *  dimmed, with no delta to report and nothing to click. */
function PreviewNode({ stage }: { stage: StageId }) {
  const term = PREVIEW_TERMS[stage];
  return (
    <li className="stage-rail-node">
      <span className="stage-rail-glyph preview" aria-hidden="true" />
      <span className="stage-rail-label">
        {term ? <Term id={term}>{STAGE_SHORT_LABELS[stage]}</Term> : STAGE_SHORT_LABELS[stage]}
      </span>
    </li>
  );
}

/**
 * A static, dimmed preview of the rail above — the landing's promise that the
 * run is a sequence of named steps the reader will be able to walk. Not a
 * progress indicator: nothing here lights up until there is a run to light it.
 */
export function StageRailPreview() {
  return (
    <div className="stage-rail-preview">
      <ol className="stage-rail preview" aria-label="The stages this run will walk">
        {STAGE_ORDER.map((stage) => (
          <PreviewNode key={stage} stage={stage} />
        ))}
      </ol>
      <p className="stage-rail-caption">
        The run lights these up in order — the same stages you&apos;ll navigate afterwards.
      </p>
    </div>
  );
}
