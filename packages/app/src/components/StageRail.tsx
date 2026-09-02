import { useEffect, useMemo, useState } from "react";
import type { StageId, TraceResult } from "@renovate-config-debugger/engine";
import { Explained, Term } from "./glossary";
import type { HoverCardHandlers } from "./hover-card";
import { presetTreeSummary } from "@/lib/preset-tree-stats";
import { STAGE_EXPLAINERS, STAGE_LABELS, STAGE_SHORT_LABELS } from "@/data/stage-copy";
import { STAGE_IDS } from "@/lib/input-schemas";
import { prefersReducedMotion } from "@/lib/motion";
import { describeStageActivity, getStageActivity, type StageActivity } from "@/lib/stage-activity";
import { stageDelta, type StageDelta, type StageDeltaFacts } from "@/lib/stage-delta";
import type { TermId } from "@/data/glossary-data";
import { useSyncedReset } from "@/hooks/use-synced-reset";

/**
 * Roadmap 075 (v2, iteration 4) — the pipeline rail: one node per stage on a
 * single line, each carrying 024's status glyph, the stage's name and its
 * delta (`stage-delta.ts`). It replaced 046's chip timeline inside the Pipeline
 * tab; roadmap 094 retired that grammar's last consumer (the simulator's merge
 * stepper), so this rail is the app's one sequence rendering now.
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

/** What a preview node can wear: the live rail's own activity levels, plus
 *  the two states only the landing has — `preview` (the dimmed hollow dot of
 *  a stage the walk has not reached) and `lit` (a stage the walk has passed:
 *  ACCENT, deliberately not the rail's verdict green, because mid-run the app
 *  knows which stage Renovate's code is walking and nothing at all about how
 *  it came out). */
type GlyphLevel = StageActivity["level"] | "preview" | "lit";

/** The one glyph either rail draws (076 review): one element, one class
 *  vocabulary, so the preview cannot draw a node the live rail would draw
 *  differently — a walked node IS a rail node, minus the delta and the
 *  click. The only classes the preview adds are the two above, and `lit` is
 *  an activity color, never a verdict one. */
function StageGlyph({ level }: { level: GlyphLevel }) {
  return <span className={`stage-rail-glyph ${level}`} aria-hidden="true" />;
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
      <StageGlyph level={activity.level} />
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

/** One preview node: the same column, glyph and label as a live rail node
 *  (`StageGlyph` — 076 review: one glyph component, one class vocabulary),
 *  with no delta to report and nothing to click. Deliberately NOT the rail's
 *  `StageNodeButton`: a button that does nothing is a false affordance, and a
 *  disabled one would swallow the glossary hover these labels carry. */
function PreviewNode({
  stage,
  level,
  current,
}: {
  stage: StageId;
  level: GlyphLevel;
  current: boolean;
}) {
  const term = PREVIEW_TERMS[stage];
  return (
    <li className={`stage-rail-node${current ? " current" : ""}`}>
      <StageGlyph level={level} />
      <span className="stage-rail-label">
        {term ? <Term id={term}>{STAGE_SHORT_LABELS[stage]}</Term> : STAGE_SHORT_LABELS[stage]}
      </span>
    </li>
  );
}

/** Roadmap 075 (the landing transition): how fast the preview walks its own
 *  list while a run is in flight. Paced narration, not measurement — the
 *  engine reports nothing until it is finished. The design's pace: quick
 *  enough that the whole walk fits in the moment before the shell docks in.
 *  An uninterrupted walk is 1.28 s at this pace; `LANDING_WALK_CAP_MS`
 *  (`app/use-landing-walk.ts`) must stay comfortably above it. */
const RUNNING_STEP_MS = 160;

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
 * step would be screen-reader noise, and the Run button's "Running…" already
 * announces the state.
 *
 * Roadmap 076 review: `onWalkEnd` is the other half of the transition. The
 * narration IS the landing → shell handover (the design walks every stage,
 * THEN docks the results in), so App holds the FIRST result commit until this
 * fires — one step after the walk shows its last frame, or immediately when
 * reduced motion means there is no walk to wait for. A signal, not a timer in
 * App: the engine's first import blocks the main thread, which stalls the
 * interval here but not a wall-clock timeout there, and that skew is exactly
 * what cut the walk short.
 */
export function StageRailPreview({
  running,
  onWalkEnd,
  skippedStages,
}: {
  running: boolean;
  onWalkEnd: () => void;
  /** The stages this run will NOT walk — the two 008 layers when their config
   *  is absent, which is a fact about the run's INPUTS and so honestly known
   *  before it reports anything. The walk shows them with the rail's own
   *  hollow `skipped` glyph instead of claiming they ran (076 review — the
   *  design's walk draws exactly this distinction). */
  skippedStages: readonly StageId[];
}) {
  const [step, setStep] = useState(0);
  // Read once, at mount: the landing lives for exactly one screen, and this is
  // an OS preference, not something worth subscribing to for that long.
  const [reducedMotion] = useState(prefersReducedMotion);
  const stepping = running && !reducedMotion;
  // Every walk starts at its first frame. React's "adjust state when a prop
  // changes" idiom rather than a reset branch inside the interval effect: the
  // walk starting or stopping is the whole trigger, and the rail shows the first
  // frame in the render that observed it instead of a committed frame later.
  useSyncedReset(stepping, () => {
    setStep(0);
  });
  // The interval is the external system this effect exists for — nothing else.
  // `setStep` inside its callback fires per tick, long after the effect body.
  useEffect(() => {
    if (!stepping) {
      return;
    }
    const id = window.setInterval(() => {
      setStep((prev) => Math.min(prev + 1, LAST_STAGE_INDEX));
    }, RUNNING_STEP_MS);
    return () => window.clearInterval(id);
  }, [stepping]);
  useEffect(() => {
    // No walk under reduced motion, so nothing to hold the results for.
    if (running && reducedMotion) {
      onWalkEnd();
      return;
    }
    // The last frame (the ring on Merge, "merging…") gets one full step on
    // screen before the signal — the same beat every other frame had.
    if (stepping && step === LAST_STAGE_INDEX) {
      const id = window.setTimeout(onWalkEnd, RUNNING_STEP_MS);
      return () => window.clearTimeout(id);
    }
  }, [running, reducedMotion, stepping, step, onWalkEnd]);
  return (
    <div className={`stage-rail-preview${running ? " running" : ""}`}>
      <ol className="stage-rail preview" aria-label="The stages this run will walk">
        {STAGE_ORDER.map((stage, index) => {
          // A node the walk has passed wears what is knowable pre-run and no
          // more: the rail's hollow `skipped` glyph for a layer the inputs
          // lack, the accent `lit` otherwise — activity, never a verdict.
          // Merge stays unlit — only the real result may light the finish,
          // and by then this rail is gone.
          const lit = stepping && index <= step && index < LAST_STAGE_INDEX;
          const level = lit ? (skippedStages.includes(stage) ? "skipped" : "lit") : "preview";
          return (
            <PreviewNode
              key={stage}
              stage={stage}
              level={level}
              current={stepping && index === step}
            />
          );
        })}
      </ol>
      <p className="stage-rail-caption">{previewCaption(running, reducedMotion, step)}</p>
    </div>
  );
}
