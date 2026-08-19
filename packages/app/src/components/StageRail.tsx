import { useEffect, useMemo, useState } from "react";
import type { StageId, TraceResult } from "@renovate-config-debugger/engine";
import { Explained, Term } from "./glossary";
import type { HoverCardHandlers } from "./hover-card";
import { presetTreeSummary } from "./preset-tree-stats";
import { STAGE_EXPLAINERS, STAGE_LABELS, STAGE_SHORT_LABELS } from "@/data/stage-copy";
import { STAGE_IDS } from "@/lib/input-schemas";
import { prefersReducedMotion } from "@/lib/motion";
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
 *  dimmed, with no delta to report and nothing to click. `lit`/`current` are
 *  the landing transition's only additions (see `StageRailPreview`). */
function PreviewNode({ stage, lit, current }: { stage: StageId; lit: boolean; current: boolean }) {
  const term = PREVIEW_TERMS[stage];
  return (
    <li className={`stage-rail-node${current ? " current" : ""}`}>
      <span className={`stage-rail-glyph preview${lit ? " lit" : ""}`} aria-hidden="true" />
      <span className="stage-rail-label">
        {term ? <Term id={term}>{STAGE_SHORT_LABELS[stage]}</Term> : STAGE_SHORT_LABELS[stage]}
      </span>
    </li>
  );
}

/** Roadmap 075 (the landing transition): how fast the preview walks its own
 *  list while a run is in flight. Paced narration, not measurement — the
 *  engine reports nothing until it is finished. */
const RUNNING_STEP_MS = 450;

/** The last column. The run's own completion is what lights it, and by then
 *  the landing has unmounted — so the narration never claims it. */
const LAST_STAGE_INDEX = STAGE_ORDER.length - 1;

/** Stage NAMES only. Nothing here may claim a FINDING: mid-run the app knows
 *  which stage Renovate's code is walking and nothing whatever about what it
 *  is turning up there. */
const RUNNING_NOTES: Record<StageId, string> = {
  global: "starting Renovate's own code…",
  inherit: "applying inherited defaults…",
  parse: "parsing your file…",
  migrate: "migrating deprecated options…",
  massage: "normalizing shorthand…",
  validate: "validating options…",
  preset: "resolving presets…",
  merge: "merging the effective config…",
};

const IDLE_CAPTION =
  "The run lights these up in order — the same stages you'll navigate afterwards.";

/** What a reader who asked for less motion gets instead of the stepping: the
 *  same fact, said once. */
const REDUCED_MOTION_CAPTION = "Running Renovate's own code…";

function previewCaption(running: boolean, reducedMotion: boolean, step: number): string {
  if (!running) {
    return IDLE_CAPTION;
  }
  const stage = STAGE_ORDER[step];
  if (reducedMotion || stage === undefined) {
    return REDUCED_MOTION_CAPTION;
  }
  return RUNNING_NOTES[stage];
}

/**
 * The landing's rail. Idle it is a dimmed, inert preview — the promise that
 * the run is a sequence of named steps the reader will be able to walk.
 *
 * Roadmap 075 (the landing transition) gave it the other half: while a run is
 * in flight it walks its own stage list on an interval, so the wait is spent
 * looking at the thing the result will replace rather than at a spinner. It is
 * a NARRATION, not a progress bar — the engine is a single async call that
 * reports once, at the end — so it holds one stage short of the finish and
 * lets the real result light the merge node (by which point this component is
 * unmounted and the shell's dock-in has taken over).
 *
 * The stepping state is internal on purpose: the parent re-renders on every
 * keystroke, and the interval must belong to the rail rather than to App.
 * The caption deliberately carries no live region — a new sentence every
 * 450 ms would be screen-reader noise, and the Run button's "Running…" already
 * announces the state.
 */
export function StageRailPreview({ running }: { running: boolean }) {
  const [step, setStep] = useState(0);
  // Read once, at mount: the landing lives for exactly one screen, and this is
  // an OS preference, not something worth subscribing to for that long.
  const [reducedMotion] = useState(prefersReducedMotion);
  useEffect(() => {
    if (!running || reducedMotion) {
      setStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setStep((prev) => Math.min(prev + 1, LAST_STAGE_INDEX));
    }, RUNNING_STEP_MS);
    return () => window.clearInterval(id);
  }, [running, reducedMotion]);
  const stepping = running && !reducedMotion;
  return (
    <div className={`stage-rail-preview${running ? " running" : ""}`}>
      <ol className="stage-rail preview" aria-label="The stages this run will walk">
        {STAGE_ORDER.map((stage, index) => (
          <PreviewNode
            key={stage}
            stage={stage}
            lit={stepping && index <= step && index < LAST_STAGE_INDEX}
            current={stepping && index === step}
          />
        ))}
      </ol>
      <p className="stage-rail-caption">{previewCaption(running, reducedMotion, step)}</p>
    </div>
  );
}
