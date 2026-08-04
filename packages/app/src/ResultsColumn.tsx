import { type ReactNode, type RefObject, useEffect, useMemo } from "react";
import type {
  ErrorFixResult,
  RuleAttribution,
  StageId,
  TraceEvent,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { AuthFailureBanner } from "@/components/AuthFailureBanner";
import { collectGithubAuthFailures } from "@/features/presets/tree-shared";
import { EffectiveConfig, type EffectiveStats } from "@/components/EffectiveConfig";
import type { AuthState } from "@/components/GithubAuthHint";
import { HypotheticalBanner } from "@/components/HypotheticalBanner";
import { MessagesPanel } from "@/components/MessagesPanel";
import { MigrationSteps } from "@/components/MigrationSteps";
import { OverviewTab } from "@/components/OverviewTab";
import { PresetTree } from "@/features/presets/PresetTree";
import { ResultsPanel, type ResultsTabDescriptor } from "@/components/ResultsPanel";
import { RuleSimulator } from "@/features/simulator/RuleSimulator";
import { StageDiff } from "@/components/StageDiff";
import { StageTimeline } from "@/components/StageTimeline";
import type { ResultsTabId } from "@/data/results-tabs";
import { motionScrollOptions } from "@/lib/motion";
import type { DigestClause } from "@/lib/run-digest";
import type { ErrorTranslationLib } from "@/platform/run";
import type { ShareSimulator } from "@/lib/share";
import { STAGE_EXPLAINERS, STAGE_LABELS } from "@/data/stage-copy";
import type { SimRequest } from "@/hooks/use-share-link";

/**
 * Everything the seven tab panels consume, handed down from App.tsx. All of
 * it is identity-stable across keystrokes (run results, memoized derivations
 * and latest-ref callbacks — the 032 contract), which is what lets the
 * `panels` memo below keep its element tree between renders.
 */
export interface ResultsColumnProps {
  // —— run result + refs ——
  result: TraceResult;
  /** The `.results-col` wrapper (owned by App), measured by the stacked-
   *  viewport scroll-into-view effect below. */
  resultsColRef: RefObject<HTMLDivElement | null>;
  /** Armed by App's onRun right before a result commits; consumed (and
   *  cleared) here once per run. */
  focusResultsRef: RefObject<boolean>;

  // —— tab shell (forwarded to ResultsPanel) ——
  tabs: ResultsTabDescriptor[];
  tab: ResultsTabId;
  onSelectTab: (tab: ResultsTabId) => void;
  backTab: ResultsTabId | null;
  onBack: () => void;

  // —— shared across tabs ——
  /** Consumed by: overview, pipeline, effective, simulator. */
  validateHasErrors: boolean;
  /** Consumed by: overview, pipeline. */
  jumpToTab: (tab: ResultsTabId) => void;
  /** Consumed by: pipeline (rewrite-count crosslink), rewrites. */
  migrateSteps: TraceEvent[];
  /** Consumed by: effective, simulator. */
  selectPresetNode: (nodeId: string) => void;
  /** Consumed by: simulator, problems. */
  focusEditorRepoIndex: (repoIndex: number) => void;
  /** Consumed by: simulator, problems. */
  errorLib: ErrorTranslationLib | null;

  // —— overview ——
  digest: DigestClause[];
  onWhereFrom: () => void;

  // —— pipeline ——
  selectedStage: StageId;
  onSelectStage: (stage: StageId) => void;
  deferredStage: StageId;

  // —— rewrites ——
  migrateStepperMounted: boolean;
  finalMigrated: unknown;
  migrationStepIndex: number;
  onMigrationStepChange: (index: number) => void;

  // —— presets ——
  onInject: (key: string, content: Record<string, unknown>) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  authState: AuthState;
  onSignIn: () => void;
  installUrl: string;
  /** Roadmap 009: re-runs the pipeline with the inputs currently on screen —
   *  the auth-failure banner's "Run again", for access granted mid-session. */
  onRunAgain: () => void;

  // —— effective ——
  onEffectiveStats: (stats: EffectiveStats) => void;
  effectiveFilterNonce: number;

  // —— simulator ——
  pendingRuleFocus: number | null;
  onRuleFocused: () => void;
  simRequest: SimRequest | null;
  onCopySimLink: (sim: ShareSimulator) => Promise<void>;
  /** Roadmap 044: the simulator's merge-stepper index (owned by App so a share
   *  link can restore it, exactly like `migrationStepIndex`). */
  mergeStepIndex: number;
  onMergeStepChange: (index: number) => void;

  // —— problems ——
  errorCount: number;
  warningCount: number;
  ruleProvenance: RuleAttribution[] | null | undefined;
  onJumpToSimRule: (index: number) => void;
  onApplyFix: (fix: ErrorFixResult) => void;
}

/**
 * Roadmap 031: the results half of the app as one lazily-loaded module —
 * `react-diff-view` + `diff` and every result-only component live behind
 * App.tsx's `React.lazy` boundary around this file, off the entry chunk.
 * Nothing here can render before a run, and a run necessarily downloads the
 * far larger engine chunk first, so the split is imperceptible.
 *
 * The boundary sits OUTSIDE the always-mounted tab shell (028): once the
 * first result mounts this column it never unmounts again (`result` never
 * returns to null, and a resolved `lazy` component never re-suspends), so
 * per-tab state keeps surviving tab switches exactly as before.
 */
/** Roadmap 028: the viewport below which the two panes stack (config on top,
 *  results below) — must stay in sync with index.css's `.app-split` media
 *  query, since the post-Run scroll-into-view only applies while stacked. */
const STACKED_VIEWPORT_QUERY = "(max-width: 60rem)";

/** Roadmap 028: how much of the stacked results pane has to be on screen for a
 *  Run to have visibly produced something. Below this, the run is landed on. */
const MIN_VISIBLE_RESULTS_PX = 200;

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="empty-note">{children}</p>;
}

export function ResultsColumn({
  result,
  resultsColRef,
  focusResultsRef,
  tabs,
  tab,
  onSelectTab,
  backTab,
  onBack,
  validateHasErrors,
  jumpToTab,
  migrateSteps,
  selectPresetNode,
  focusEditorRepoIndex,
  errorLib,
  digest,
  onWhereFrom,
  selectedStage,
  onSelectStage,
  deferredStage,
  migrateStepperMounted,
  finalMigrated,
  migrationStepIndex,
  onMigrationStepChange,
  onInject,
  selectedNodeId,
  onSelectNode,
  authState,
  onSignIn,
  installUrl,
  onRunAgain,
  onEffectiveStats,
  effectiveFilterNonce,
  pendingRuleFocus,
  onRuleFocused,
  simRequest,
  onCopySimLink,
  mergeStepIndex,
  onMergeStepChange,
  errorCount,
  warningCount,
  ruleProvenance,
  onJumpToSimRule,
  onApplyFix,
}: ResultsColumnProps) {
  // Roadmap 028: on a stacked (narrow) viewport the results pane sits below
  // the fold, so a Run would otherwise look like it did nothing — land on the
  // consequence (023's pattern). Lives HERE (not App) since 031: this effect
  // fires only after the lazily-loaded results content actually committed —
  // an App-side effect on `result` could run against the Suspense fallback
  // (a zero-height column) on the very first run. It still runs AFTER App's
  // preserve-scroll layout effect (layout effects flush before passive ones)
  // and only when the pane really is off-screen, so a scroll-preserving
  // re-run keeps the position it restored.
  useEffect(() => {
    if (!result || !focusResultsRef.current) {
      return;
    }
    focusResultsRef.current = false;
    const el = resultsColRef.current;
    if (!el || !window.matchMedia(STACKED_VIEWPORT_QUERY).matches) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    if (visible < MIN_VISIBLE_RESULTS_PX) {
      el.scrollIntoView(motionScrollOptions("start"));
    }
  }, [result, focusResultsRef, resultsColRef]);

  // Roadmap 009: one walk of the finished run's tree per result — the banner
  // below is the only consumer, and the tree is a per-run value, so this must
  // never be recomputed on a keystroke (032's contract) even though the walk
  // itself is cheap.
  const authFailures = useMemo(
    () => collectGithubAuthFailures(result.presetTree),
    [result.presetTree],
  );
  // Rendered by the tab shell above ALL panels rather than inside one: the
  // failure is a property of the run, and the tab a run lands on depends on
  // which stage errored — a preset-stage failure lands on Problems, so an
  // Overview-only banner would be exactly invisible in its own main case.
  const banner = useMemo(
    () => (
      <AuthFailureBanner
        failures={authFailures.failures}
        rateLimited={authFailures.rateLimited}
        authState={authState}
        onSignIn={onSignIn}
        installUrl={installUrl}
        onRunAgain={onRunAgain}
      />
    ),
    [authFailures, authState, onSignIn, installUrl, onRunAgain],
  );

  // Roadmap 032: the seven tab panels render RUN RESULTS — they change when a
  // run completes or a view-state jump lands, never while the user types. So
  // `content` (and every other per-keystroke value: `injected`,
  // `packageRuleOffsets`, the live share state) is deliberately absent from
  // these deps: every callback that needs such state reads it through the
  // latest-ref idiom in App.tsx (`onInject`, `focusEditorRepoIndex`,
  // `onApplyFix`, `onCopySimLink`). The element tree here keeps its identity
  // across keystrokes, so React bails out of reconciling all seven panels —
  // typing re-renders App (and this shell) and nothing below it.
  const panels = useMemo<Record<ResultsTabId, ReactNode>>(() => {
    return {
      overview: (
        <OverviewTab
          digest={digest}
          banner={validateHasErrors ? <HypotheticalBanner /> : null}
          onOpen={jumpToTab}
          onWhereFrom={onWhereFrom}
        />
      ),
      pipeline: (
        <>
          <StageTimeline result={result} selected={selectedStage} onSelect={onSelectStage} />
          <div className="card">
            <div className="card-title">
              Stage: {STAGE_LABELS[selectedStage]}
              <span className="card-title-hint"> — {STAGE_EXPLAINERS[selectedStage].plain}</span>
              {deferredStage !== selectedStage ? (
                <span className="rendering-note"> rendering…</span>
              ) : null}
            </div>
            {/* Roadmap 023: the presets/merge stages run on a config a real
                Renovate run would have already rejected — say so. */}
            {validateHasErrors && (deferredStage === "preset" || deferredStage === "merge") ? (
              <HypotheticalBanner />
            ) : null}
            {/* Roadmap 028: Pipeline always shows the whole-stage diff —
                the per-rewrite stepper is the Rewrites tab's job. */}
            {deferredStage === "migrate" && migrateSteps.length > 0 ? (
              <p className="stage-crosslink">
                {migrateSteps.length} rewrite{migrateSteps.length === 1 ? "" : "s"} applied ·{" "}
                <button type="button" className="linklike" onClick={() => jumpToTab("rewrites")}>
                  step through them one by one →
                </button>
              </p>
            ) : null}
            <StageDiff result={result} stage={deferredStage} />
          </div>
        </>
      ),
      rewrites: migrateStepperMounted ? (
        <div className="card">
          <div className="card-title">
            Rewrites
            <span className="card-title-hint">
              {" "}
              — the deprecated options Renovate rewrote, one at a time
            </span>
          </div>
          <MigrationSteps
            steps={migrateSteps}
            finalConfig={finalMigrated}
            index={migrationStepIndex}
            onIndexChange={onMigrationStepChange}
          />
        </div>
      ) : (
        <EmptyNote>No rewrites — this config already uses current option names.</EmptyNote>
      ),
      presets: result.presetTree?.children.length ? (
        <PresetTree
          result={result}
          onInject={onInject}
          selectedId={selectedNodeId}
          onSelectNode={onSelectNode}
          authState={authState}
          onSignIn={onSignIn}
          installUrl={installUrl}
        />
      ) : (
        <EmptyNote>
          No presets — this config has no <code>extends</code> entries to resolve.
        </EmptyNote>
      ),
      effective: result.finalConfig ? (
        <>
          {validateHasErrors ? <HypotheticalBanner /> : null}
          <EffectiveConfig
            result={result}
            onSelectPreset={selectPresetNode}
            onStats={onEffectiveStats}
            focusFilterNonce={effectiveFilterNonce}
          />
        </>
      ) : (
        <EmptyNote>
          No effective config — the pipeline did not get far enough to merge one.
        </EmptyNote>
      ),
      simulator: result.finalConfig ? (
        <RuleSimulator
          result={result}
          onSelectPreset={selectPresetNode}
          onJumpToEditor={focusEditorRepoIndex}
          focusRuleIndex={pendingRuleFocus}
          onRuleFocused={onRuleFocused}
          errorLib={errorLib}
          simRequest={simRequest}
          onCopySimLink={onCopySimLink}
          configInvalid={validateHasErrors}
          mergeStepIndex={mergeStepIndex}
          onMergeStepChange={onMergeStepChange}
        />
      ) : (
        <EmptyNote>Nothing to simulate — the pipeline produced no effective config.</EmptyNote>
      ),
      problems:
        errorCount + warningCount > 0 ? (
          <MessagesPanel
            result={result}
            ruleAttribution={ruleProvenance}
            onJumpToEditor={focusEditorRepoIndex}
            onJumpToSimRule={onJumpToSimRule}
            errorLib={errorLib}
            onApplyFix={onApplyFix}
          />
        ) : (
          <EmptyNote>
            No errors or warnings — Renovate accepted every option in this config.
          </EmptyNote>
        ),
    };
  }, [
    result,
    validateHasErrors,
    jumpToTab,
    migrateSteps,
    selectPresetNode,
    focusEditorRepoIndex,
    errorLib,
    digest,
    onWhereFrom,
    selectedStage,
    onSelectStage,
    deferredStage,
    migrateStepperMounted,
    finalMigrated,
    migrationStepIndex,
    onMigrationStepChange,
    onInject,
    selectedNodeId,
    onSelectNode,
    authState,
    onSignIn,
    installUrl,
    onEffectiveStats,
    effectiveFilterNonce,
    pendingRuleFocus,
    onRuleFocused,
    simRequest,
    onCopySimLink,
    mergeStepIndex,
    onMergeStepChange,
    errorCount,
    warningCount,
    ruleProvenance,
    onJumpToSimRule,
    onApplyFix,
  ]);

  return (
    <ResultsPanel
      tabs={tabs}
      active={tab}
      onSelect={onSelectTab}
      back={backTab}
      onBack={onBack}
      banner={banner}
      panels={panels}
    />
  );
}
