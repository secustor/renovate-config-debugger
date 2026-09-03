import type { StageId, TraceEvent, TraceResult } from "@renovate-config-debugger/engine";
import { EmptyNote } from "@/components/EmptyNote";
import { MigrationSteps } from "@/components/MigrationSteps";
import { StageRail } from "@/components/StageRail";
import { STAGE_LABELS } from "@/data/stage-copy";
import type { InheritLayerState } from "@/lib/inherit-probe";
import type { LayerParseResult } from "@/lib/input-schemas";
import { presetTreeSummary } from "@/lib/preset-tree-stats";
import { getStageActivity } from "@/lib/stage-activity";
import { stageHint } from "@/lib/stage-delta";
import { ExtractPhase } from "./ExtractPhase";
import { PhasePicker } from "./PhasePicker";
import type { PipelinePhase } from "./phases";
import { StageDiff } from "./StageDiff";
import { StageLayerEditor } from "./StageLayerEditor";
import type { RepoConnectOffer, RepoDepsView } from "@/types/repo";

/**
 * The Pipeline tab, as a slice.
 *
 * Five of the six results tabs delegated to a feature or a shared panel;
 * `pipeline` alone was assembled from raw parts inside `app/ResultsColumn.tsx`
 * — the rail, a stage card built from three file-local components, and the
 * rewrite stepper — which is why that shell file was 580 lines when its actual
 * job (banners, the panels record, the tab shell) is a fraction of that.
 *
 * The promotion rule diagnosed it mechanically, and this move is the fix that
 * diagnosis pointed at: `StageDiff` sat in the shared layer with exactly one
 * consumer, and `StageLayerEditor` sat in the EDITOR slice although its only
 * consumer was this card — a cross-slice edge that survived only because the
 * shell was the one doing the importing. Both were misfiled because there was
 * nowhere to file them. Now there is, and they live here.
 *
 * `StageRail` and `MigrationSteps` deliberately stay in `components/`: each has
 * a second consumer (`ConfigColumn`'s `StageRailPreview`, and `PresetDetail`),
 * so each is genuinely shared.
 */

/**
 * Roadmap 028/075: the Rewrites tab's card, now the migrate stage's own — the
 * deprecated options Renovate rewrote, one at a time. Mounted only while that
 * stage is selected; the index it steps through is App's (`migrationStepIndex`,
 * what a share link's `step` field carries), so leaving the stage and coming
 * back returns to the step the reader was on.
 */
function RewriteSteps({
  steps,
  finalConfig,
  index,
  onIndexChange,
}: {
  steps: TraceEvent[];
  finalConfig: unknown;
  index: number;
  onIndexChange: (index: number) => void;
}) {
  return (
    <div className="card">
      <div className="card-title">
        Rewrites
        <span className="card-title-hint">
          {" "}
          — the deprecated options Renovate rewrote, one at a time
        </span>
      </div>
      <MigrationSteps
        steps={steps}
        finalConfig={finalConfig}
        index={index}
        onIndexChange={onIndexChange}
      />
    </div>
  );
}

/**
 * Roadmap 075 (iteration 4): the stage card's header strip — the stage's name
 * and, muted beside it, what it DID this run (`stageHint`, the same derivation
 * the rail's delta renders as a number). What the stage IS stays in
 * `STAGE_EXPLAINERS`, one hover away on the rail node above.
 */
function StageCardHeader({
  result,
  stage,
  effectiveKeys,
  rendering,
}: {
  result: TraceResult;
  stage: StageId;
  effectiveKeys: number | null;
  rendering: boolean;
}) {
  const presetCount = presetTreeSummary(result.presetTree)?.resolved ?? 0;
  const hint = stageHint(stage, getStageActivity(result, stage), { presetCount, effectiveKeys });
  return (
    <div className="card-title">
      Stage: {STAGE_LABELS[stage]}
      <span className="card-title-hint"> — {hint}</span>
      {rendering ? <span className="rendering-note"> rendering…</span> : null}
    </div>
  );
}

/**
 * Roadmap 076: the layer editor a `global` / `inherit` stage card carries,
 * picked by stage. Its own component so the card's JSX stays a flat list —
 * and so the choice of which layer is being edited is made once, in one
 * place, rather than three times over in three ternaries.
 *
 * Driven by the SELECTED stage, not the deferred one: this is an input, and an
 * input that lags a click by a frame is an input that eats the first keystroke
 * typed into it.
 */
function StageLayerSlot({
  stage,
  globalText,
  onGlobalTextChange,
  inheritedText,
  onInheritedTextChange,
  globalParse,
  inheritedParse,
  inheritState,
}: StageLayersProps & { stage: StageId }) {
  if (stage === "global") {
    return (
      <StageLayerEditor
        kind="global"
        value={globalText}
        onChange={onGlobalTextChange}
        parse={globalParse}
      />
    );
  }
  if (stage === "inherit") {
    return (
      <StageLayerEditor
        kind="inherit"
        value={inheritedText}
        onChange={onInheritedTextChange}
        parse={inheritedParse}
        inheritState={inheritState}
      />
    );
  }
  return null;
}

/**
 * Roadmap 076 (design turn 18d): the two 008 merge layers are EDITED on the
 * stage nodes that report on them. App owns the text (a share link carries it,
 * the repo load's probe fills it) and the callbacks are identity-stable per the
 * 032 contract, so the panels memo above still keeps its element tree across
 * keystrokes.
 *
 * Named as an interface rather than passed as one object: the shell forwards
 * these seven straight through from `App`, and bundling them into a value it
 * would have to build per render is exactly how a memo's identity — and with
 * it 032's "typing reconciles no panel" contract — gets lost.
 */
export interface StageLayersProps {
  globalText: string;
  onGlobalTextChange: (value: string) => void;
  inheritedText: string;
  onInheritedTextChange: (value: string) => void;
  globalParse: LayerParseResult;
  inheritedParse: LayerParseResult;
  /** Roadmap 045: what the last inherited-config probe did, or null. */
  inheritState: InheritLayerState | null;
}

/**
 * Roadmap 090: the Config phase — everything this tab was before the picker
 * existed, unchanged and now behind the first segment. Its own component so
 * `PipelinePanel` is the phase switch and nothing else (and so the card's JSX
 * keeps its depth under the ratchet).
 */
function ConfigPhase({
  result,
  selectedStage,
  onSelectStage,
  deferredStage,
  effectiveKeys,
  migrateSteps,
  migrateStepperMounted,
  finalMigrated,
  migrationStepIndex,
  onMigrationStepChange,
  globalText,
  onGlobalTextChange,
  inheritedText,
  onInheritedTextChange,
  globalParse,
  inheritedParse,
  inheritState,
}: ConfigPhaseProps) {
  return (
    <>
      <StageRail
        result={result}
        selected={selectedStage}
        onSelect={onSelectStage}
        effectiveKeys={effectiveKeys}
      />
      <div className="card">
        <StageCardHeader
          result={result}
          stage={selectedStage}
          effectiveKeys={effectiveKeys}
          rendering={deferredStage !== selectedStage}
        />
        <StageLayerSlot
          stage={selectedStage}
          globalText={globalText}
          onGlobalTextChange={onGlobalTextChange}
          inheritedText={inheritedText}
          onInheritedTextChange={onInheritedTextChange}
          globalParse={globalParse}
          inheritedParse={inheritedParse}
          inheritState={inheritState}
        />
        <StageDiff result={result} stage={deferredStage} />
      </div>
      {/* Roadmap 075 (iteration 3): the Rewrites tab, folded in. The
          whole-stage diff above says WHAT migrate changed; the stepper says
          which rewrite did which part of it, which is the same question the
          retired tab existed to answer — one stage down, not one tab
          across. */}
      {deferredStage === "migrate" && migrateStepperMounted ? (
        <RewriteSteps
          steps={migrateSteps}
          finalConfig={finalMigrated}
          index={migrationStepIndex}
          onIndexChange={onMigrationStepChange}
        />
      ) : null}
      {/* Only for a migrate that actually ran clean: a skipped or errored stage
          has StageDiff's own message above, and this note would contradict it. */}
      {deferredStage === "migrate" &&
      !migrateStepperMounted &&
      result.stageStatus.migrate === "ok" ? (
        <EmptyNote>No rewrites — this config already uses current option names.</EmptyNote>
      ) : null}
    </>
  );
}

interface ConfigPhaseProps extends StageLayersProps {
  result: TraceResult;
  /**
   * The two stage identities are NOT interchangeable, and the split is the
   * point of this panel's wiring:
   *
   * `selectedStage` is what the user just clicked — it drives the rail's
   * selection and the layer editor, both of which are inputs, and an input that
   * lags a click by a frame eats the first keystroke typed into it.
   *
   * `deferredStage` lags under load (`useDeferredValue` in App) and drives the
   * expensive renders — the whole-stage diff and the rewrite stepper — so a
   * click paints the new selection immediately and the heavy body catches up.
   * `rendering` is exactly the window where the two disagree.
   */
  selectedStage: StageId;
  onSelectStage: (stage: StageId) => void;
  deferredStage: StageId;
  effectiveKeys: number | null;
  migrateSteps: TraceEvent[];
  migrateStepperMounted: boolean;
  finalMigrated: unknown;
  migrationStepIndex: number;
  onMigrationStepChange: (index: number) => void;
}

export interface PipelinePanelProps extends ConfigPhaseProps {
  /**
   * Roadmap 090: which of Renovate's phases is on screen. App's state rather
   * than this panel's, for one reason: opening the Extract phase is what
   * TRIGGERS repository discovery, and every results panel stays mounted (028)
   * — a panel-side trigger would fire for a tab nobody has looked at.
   */
  phase: PipelinePhase;
  onSelectPhase: (phase: PipelinePhase) => void;
  /** The loaded repository's extracted dependencies, and the three things the
   *  Extract phase does with them that are the shell's, not this tab's. */
  extract: RepoDepsView;
  repoConnect: RepoConnectOffer;
  onRetryExtract: () => void;
  onOpenDependencies: () => void;
}

export function PipelinePanel({
  phase,
  onSelectPhase,
  extract,
  repoConnect,
  onRetryExtract,
  onOpenDependencies,
  ...config
}: PipelinePanelProps) {
  return (
    <>
      <PhasePicker
        phase={phase}
        onSelectPhase={onSelectPhase}
        effectiveKeys={config.effectiveKeys}
        extract={extract}
      />
      {phase === "extract" ? (
        <ExtractPhase
          view={extract}
          connect={repoConnect}
          onRetry={onRetryExtract}
          onOpenDependencies={onOpenDependencies}
        />
      ) : (
        <ConfigPhase {...config} />
      )}
    </>
  );
}
