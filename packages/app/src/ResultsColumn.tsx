import { type ReactNode, type RefObject, useEffect, useMemo, useState } from "react";
import type {
  ErrorFixResult,
  RuleAttribution,
  StageId,
  TraceEvent,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { AuthFailureBanner } from "@/components/AuthFailureBanner";
import { collectGithubAuthFailures } from "@/features/presets/tree-shared";
import { DescriptionDigestCard } from "@/components/DescriptionDigestCard";
import { EffectiveConfig, type EffectiveStats } from "@/components/EffectiveConfig";
import type { AuthState } from "@/components/GithubAuthHint";
import { HypotheticalBanner } from "@/components/HypotheticalBanner";
import { MessagesPanel } from "@/components/MessagesPanel";
import { MigrationSteps } from "@/components/MigrationSteps";
import { PresetTree } from "@/features/presets/PresetTree";
import { ResultsPanel, type ResultsTabDescriptor } from "@/components/ResultsPanel";
import { RuleSimulator } from "@/features/simulator/RuleSimulator";
import { StageDiff } from "@/components/StageDiff";
import { StageRail } from "@/components/StageRail";
import { StaleResultsBanner } from "@/components/StaleResultsBanner";
import type { ResultsTabId } from "@/data/results-tabs";
import { motionScrollOptions } from "@/lib/motion";
import type { ErrorTranslationLib } from "@/platform/run";
import type { ShareSimulator } from "@/lib/share";
import { STAGE_LABELS } from "@/data/stage-copy";
import { getStageActivity } from "@/lib/stage-activity";
import { stageHint } from "@/lib/stage-delta";
import { presetTreeSummary } from "@/components/preset-tree-stats";
import type { SimRequest } from "@/hooks/use-share-link";

/**
 * Everything the five tab panels consume, handed down from App.tsx. All of
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
  /** Roadmap 068: the strip's arrows, which select without discarding the
   *  cross-link back trail (App's `walkToTab`). */
  onWalkTab: (tab: ResultsTabId) => void;
  backTab: ResultsTabId | null;
  onBack: () => void;
  /** The editor's text has diverged from the text `result` was computed from.
   *  The ONE prop here that changes on a keystroke — it feeds the `banner`
   *  memo and nothing else, deliberately not the `panels` memo below, whose
   *  032 contract is that typing reconciles none of the five panels. */
  resultsStale: boolean;

  // —— shared across tabs ——
  /** Roadmap 023/075: validation errors make everything after the parse stage
   *  hypothetical. Consumed by the run-level banner below — a property of the
   *  RUN, so it is stated once, above whichever panel is on screen. */
  validateHasErrors: boolean;
  /** Consumed by: effective (069's digest card), problems. */
  selectPresetNode: (nodeId: string) => void;
  /** Consumed by: tests, problems. */
  focusEditorRepoIndex: (repoIndex: number) => void;
  /** Consumed by: tests, problems. */
  errorLib: ErrorTranslationLib | null;

  // —— pipeline ——
  selectedStage: StageId;
  onSelectStage: (stage: StageId) => void;
  deferredStage: StageId;
  /** Roadmap 075 (iteration 3): the migrate stage's own rewrites, stepped
   *  through in place — the Rewrites tab's stepper, folded in. */
  migrateSteps: TraceEvent[];
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
  /** Roadmap 075 (iteration 4): keys in the effective config, or null until
   *  the browser has finished computing provenance — the merge node's delta on
   *  the pipeline rail, and the merge stage card's hint. Owned by App (which
   *  already holds it for the header digest) so both quote one number. */
  effectiveKeys: number | null;
  /** Roadmap 069: the digest card's "show raw order" link — lands on the
   *  `description` row's blame ledger. Since 075 the card sits at the top of
   *  THIS tab, so from there it is an in-tab landing; the preset tree (PR 4),
   *  whose `→ #16 of 24` position markers are the same jump from the other end,
   *  still crosses a tab boundary to get here. */
  onShowDescriptionOrder: () => void;
  /** Roadmap 069: bumped alongside the jump above, so the row is filtered to
   *  and expanded once the tab is on screen. */
  descriptionLedgerNonce: number;

  // —— tests ——
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
  /** Opens the Tests tab focused on one `packageRules` entry. */
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

export function ResultsColumn({
  result,
  resultsColRef,
  focusResultsRef,
  tabs,
  tab,
  onSelectTab,
  onWalkTab,
  backTab,
  onBack,
  resultsStale,
  validateHasErrors,
  selectPresetNode,
  focusEditorRepoIndex,
  errorLib,
  selectedStage,
  onSelectStage,
  deferredStage,
  migrateSteps,
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
  effectiveKeys,
  onShowDescriptionOrder,
  descriptionLedgerNonce,
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
  /**
   * Roadmap 023/075 (iteration 3): the hypothetical-run notice was rendered
   * three times over — once in the Overview's own banner slot, once inside the
   * pipeline's preset/merge stage card, once at the top of the effective config
   * and once inside the simulator card. It describes the RUN, not an
   * instrument: a config Renovate would refuse makes the resolved presets, the
   * merged config and every simulation hypothetical alike. With the Overview
   * retired it is stated once, in the run-level banner slot below, above
   * whichever panel is on screen — including Presets and Problems, which never
   * carried it.
   *
   * Replay-02 R1's reserved box moves here with it (it used to be the
   * simulator's `sim-banner-slot`): once the banner has been shown, the slot
   * keeps its height for the rest of the session (visibility, not unmount), so
   * an applied fix clearing the banner cannot shift the control the reader is
   * about to click out from under the pointer.
   */
  const [invalidSeen, setInvalidSeen] = useState(false);
  useEffect(() => {
    if (validateHasErrors) {
      setInvalidSeen(true);
    }
  }, [validateHasErrors]);

  // Rendered by the tab shell above ALL panels rather than inside one: every
  // banner here is a property of the run, and the tab a run lands on depends on
  // which stage errored — a preset-stage failure lands on Problems, so a
  // one-tab banner would be exactly invisible in its own main case.
  // `resultsStale` is the one keystroke-sensitive input in this file, and it
  // reaches exactly this memo: a divergent keystroke re-renders the banner and
  // nothing else, because `panels` below does not read it (roadmap 032).
  const banner = useMemo(
    () => (
      <>
        {resultsStale ? <StaleResultsBanner /> : null}
        {validateHasErrors || invalidSeen ? (
          <div className={`run-banner-slot${validateHasErrors ? "" : " ghost"}`}>
            <HypotheticalBanner />
          </div>
        ) : null}
        <AuthFailureBanner
          failures={authFailures.failures}
          rateLimited={authFailures.rateLimited}
          authState={authState}
          onSignIn={onSignIn}
          installUrl={installUrl}
          onRunAgain={onRunAgain}
        />
      </>
    ),
    [
      resultsStale,
      validateHasErrors,
      invalidSeen,
      authFailures,
      authState,
      onSignIn,
      installUrl,
      onRunAgain,
    ],
  );

  // Roadmap 032: the five tab panels render RUN RESULTS — they change when a
  // run completes or a view-state jump lands, never while the user types. So
  // `content` (and every other per-keystroke value: `injected`,
  // `packageRuleOffsets`, the live share state) is deliberately absent from
  // these deps: every callback that needs such state reads it through the
  // latest-ref idiom in App.tsx (`onInject`, `focusEditorRepoIndex`,
  // `onApplyFix`, `onCopySimLink`). The element tree here keeps its identity
  // across keystrokes, so React bails out of reconciling all five panels —
  // typing re-renders App (and this shell) and nothing below it.
  const panels = useMemo<Record<ResultsTabId, ReactNode>>(() => {
    return {
      tests: result.finalConfig ? (
        <RuleSimulator
          result={result}
          onSelectPreset={selectPresetNode}
          onJumpToEditor={focusEditorRepoIndex}
          focusRuleIndex={pendingRuleFocus}
          onRuleFocused={onRuleFocused}
          errorLib={errorLib}
          simRequest={simRequest}
          onCopySimLink={onCopySimLink}
          mergeStepIndex={mergeStepIndex}
          onMergeStepChange={onMergeStepChange}
        />
      ) : (
        <EmptyNote>Nothing to test — the pipeline produced no effective config.</EmptyNote>
      ),
      pipeline: (
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
          {deferredStage === "migrate" && !migrateStepperMounted ? (
            <EmptyNote>No rewrites — this config already uses current option names.</EmptyNote>
          ) : null}
        </>
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
          onShowDescriptionOrder={onShowDescriptionOrder}
        />
      ) : (
        <EmptyNote>
          No presets — this config has no <code>extends</code> entries to resolve.
        </EmptyNote>
      ),
      effective: result.finalConfig ? (
        <>
          {/* Roadmap 069/075: "What this config does" led the Overview and
              leads this tab now — it describes the merged config's own
              `description` field, and its "show raw order" link has always
              landed here, which makes that jump an in-tab landing. */}
          <DescriptionDigestCard
            result={result}
            onSelectPreset={selectPresetNode}
            onShowRawOrder={onShowDescriptionOrder}
          />
          <EffectiveConfig
            result={result}
            onSelectPreset={selectPresetNode}
            onStats={onEffectiveStats}
            focusDescriptionNonce={descriptionLedgerNonce}
          />
        </>
      ) : (
        <EmptyNote>
          No effective config — the pipeline did not get far enough to merge one.
        </EmptyNote>
      ),
      // Roadmap 075 (iteration 5): the panel owns BOTH states now — its summary
      // strip is the tab's lead sentence whether or not there is anything to
      // list, so the clean run no longer needs an empty note of its own.
      problems: (
        <MessagesPanel
          result={result}
          errorCount={errorCount}
          warningCount={warningCount}
          ruleAttribution={ruleProvenance}
          onJumpToEditor={focusEditorRepoIndex}
          onJumpToSimRule={onJumpToSimRule}
          errorLib={errorLib}
          onApplyFix={onApplyFix}
        />
      ),
    };
  }, [
    result,
    selectPresetNode,
    focusEditorRepoIndex,
    errorLib,
    selectedStage,
    onSelectStage,
    deferredStage,
    migrateSteps,
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
    effectiveKeys,
    onShowDescriptionOrder,
    descriptionLedgerNonce,
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
      onWalk={onWalkTab}
      back={backTab}
      onBack={onBack}
      banner={banner}
      panels={panels}
    />
  );
}
