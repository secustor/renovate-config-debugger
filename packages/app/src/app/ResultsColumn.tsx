import { type ReactNode, type RefObject, useEffect, useMemo, useState } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import { AuthFailureBanner } from "@/components/AuthFailureBanner";
import { collectGithubAuthFailures } from "@/lib/github-failure";
import { DependenciesPanel } from "@/features/dependencies/DependenciesPanel";
import { EffectiveConfig } from "@/features/effective-config/EffectiveConfig";
import { EmptyNote } from "@/components/EmptyNote";
import { HypotheticalBanner } from "@/components/HypotheticalBanner";
import { MessagesPanel } from "@/components/MessagesPanel";
import { OverviewPanel } from "@/features/overview/OverviewPanel";
import { PipelinePanel, type StageLayersProps } from "@/features/pipeline/PipelinePanel";
import {
  PresetReferenceProvider,
  type PresetReferenceValue,
} from "@/components/preset-reference-context";
import { PresetsPanel } from "@/features/presets/PresetsPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { TestsPanel } from "@/features/simulator/TestsPanel";
import { useRunView } from "@/app/run-view-context";
import { StaleResultsBanner } from "@/components/StaleResultsBanner";
import type { ResultsTabId } from "@/data/results-tabs";
import { motionScrollOptions } from "@/lib/motion";

/**
 * The keystroke-scoped remainder (roadmap 086). Everything RUN-scoped that
 * used to be handed down here comes through `useRunView()` now — this
 * interface holds only what is disqualified from that context: the values
 * that change while the user types (`resultsStale`, the layer texts and
 * parses), plus the run result itself (non-null by this column's mount
 * condition) and the two refs App owns.
 */
export interface ResultsColumnProps extends StageLayersProps {
  result: TraceResult;
  /** The `.results-col` wrapper (owned by App), measured by the stacked-
   *  viewport scroll-into-view effect below. */
  resultsColRef: RefObject<HTMLDivElement | null>;
  /** Armed by App's onRun right before a result commits; consumed (and
   *  cleared) here once per run. */
  focusResultsRef: RefObject<boolean>;
  /** The editor's text has diverged from the text `result` was computed from.
   *  The ONE prop here that changes on a keystroke — it feeds the `banner`
   *  memo and nothing else, deliberately not the `panels` memo below, whose
   *  032 contract is that typing reconciles none of the six panels. */
  resultsStale: boolean;
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

export function ResultsColumn({
  result,
  resultsColRef,
  focusResultsRef,
  resultsStale,
  globalText,
  onGlobalTextChange,
  inheritedText,
  onInheritedTextChange,
  globalParse,
  inheritedParse,
  inheritState,
}: ResultsColumnProps) {
  // Roadmap 086: the run-scoped view cluster — everything here changes on a
  // run or an in-results interaction, never on a keystroke (the context's
  // admission rule), so reading it keeps the 032 render counts untouched.
  const {
    tabs,
    tab,
    onSelectTab,
    onWalkTab,
    backTab,
    onBack,
    onJumpToTab,
    validateHasErrors,
    pipelinePhase,
    onSelectPipelinePhase,
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
    onRunAgain,
    onOverviewStats,
    onEffectiveStats,
    effectiveKeys,
    onShowDescriptionOrder,
    descriptionLedgerNonce,
    pins,
    onAddPin,
    onRemovePin,
    pendingRuleFocus,
    onRuleFocused,
    simRequest,
    onCopySimLink,
    onShare,
    mergeStepIndex,
    onMergeStepChange,
    repoDeps,
    onLoadRepoDeps,
    repoConnect,
    onPinDep,
    onOpenDepInSimulator,
    errorCount,
    warningCount,
    ruleProvenance,
    onJumpToSimRule,
    onApplyFix,
  } = useRunView();
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
  //
  // A latch, set during render rather than in an effect: the condition is the
  // whole trigger, and `validateHasErrors && !invalidSeen` converges after one
  // extra render pass and never fires again. As an effect the reserved height
  // arrived one committed frame after the banner it reserves space for.
  const [invalidSeen, setInvalidSeen] = useState(validateHasErrors);
  if (validateHasErrors && !invalidSeen) {
    setInvalidSeen(true);
  }

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
          onRunAgain={onRunAgain}
        />
      </>
    ),
    [resultsStale, validateHasErrors, invalidSeen, authFailures, authState, onSignIn, onRunAgain],
  );

  const presetReferences = useMemo<PresetReferenceValue>(
    () => ({ root: result.presetTree ?? null, onSelectPreset: selectPresetNode }),
    [result.presetTree, selectPresetNode],
  );

  // Roadmap 032: the six tab panels render RUN RESULTS — they change when a
  // run completes or a view-state jump lands, never while the user types. So
  // `content` (and every other per-keystroke value: `injected`,
  // `packageRuleOffsets`, the live share state) is deliberately absent from
  // these deps: every callback that needs such state reads it through the
  // latest-ref idiom in App.tsx (`onInject`, `focusEditorRepoIndex`,
  // `onApplyFix`, `onCopySimLink`). The element tree here keeps its identity
  // across keystrokes, so React bails out of reconciling all six panels —
  // typing re-renders App (and this shell) and nothing below it.
  const panels = useMemo<Record<ResultsTabId, ReactNode>>(() => {
    return {
      // Roadmap 083: the config in English, first in the strip. The panel owns
      // BOTH states — its own empty note when a run carries no author prose —
      // so there is no `EmptyNote` branch here: "this config documents nothing"
      // is something only the description derivation can know, and it knows it
      // asynchronously.
      overview: (
        <OverviewPanel
          result={result}
          onSelectPreset={selectPresetNode}
          onShowRawOrder={onShowDescriptionOrder}
          onStats={onOverviewStats}
        />
      ),
      tests: result.finalConfig ? (
        <TestsPanel
          result={result}
          pins={pins}
          onAddPin={onAddPin}
          onRemovePin={onRemovePin}
          onSelectPreset={selectPresetNode}
          onJumpToEditor={focusEditorRepoIndex}
          focusRuleIndex={pendingRuleFocus}
          onRuleFocused={onRuleFocused}
          errorLib={errorLib}
          simRequest={simRequest}
          onCopySimLink={onCopySimLink}
          onShare={onShare}
          mergeStepIndex={mergeStepIndex}
          onMergeStepChange={onMergeStepChange}
          repoDeps={repoDeps}
          onLoadRepoDeps={onLoadRepoDeps}
          repoConnect={repoConnect}
        />
      ) : (
        <EmptyNote>Nothing to test — the pipeline produced no effective config.</EmptyNote>
      ),
      // Roadmap 090: the tab leads with the phase picker now. The Config phase
      // is exactly what this panel always was; the Extract phase draws 087's
      // repository discovery — the same view the Dependencies tab renders as a
      // table, here as the three steps that produced it.
      pipeline: (
        <PipelinePanel
          phase={pipelinePhase}
          onSelectPhase={onSelectPipelinePhase}
          extract={repoDeps}
          repoConnect={repoConnect}
          onRetryExtract={onLoadRepoDeps}
          onOpenDependencies={() => onJumpToTab("deps")}
          result={result}
          selectedStage={selectedStage}
          onSelectStage={onSelectStage}
          deferredStage={deferredStage}
          effectiveKeys={effectiveKeys}
          migrateSteps={migrateSteps}
          migrateStepperMounted={migrateStepperMounted}
          finalMigrated={finalMigrated}
          migrationStepIndex={migrationStepIndex}
          onMigrationStepChange={onMigrationStepChange}
          globalText={globalText}
          onGlobalTextChange={onGlobalTextChange}
          inheritedText={inheritedText}
          onInheritedTextChange={onInheritedTextChange}
          globalParse={globalParse}
          inheritedParse={inheritedParse}
          inheritState={inheritState}
        />
      ),
      presets: result.presetTree?.children.length ? (
        <PresetsPanel
          result={result}
          onInject={onInject}
          selectedId={selectedNodeId}
          onSelectNode={onSelectNode}
          authState={authState}
          onSignIn={onSignIn}
          onShowDescriptionOrder={onShowDescriptionOrder}
        />
      ) : (
        <EmptyNote>
          No presets — this config has no <code>extends</code> entries to resolve.
        </EmptyNote>
      ),
      // Roadmap 083: the description digest that led this tab since 075 is the
      // Overview again, so the effective config stands alone — this tab answers
      // "what is the merged config", the Overview answers "what does it do".
      effective: result.finalConfig ? (
        <EffectiveConfig
          result={result}
          onSelectPreset={selectPresetNode}
          onStats={onEffectiveStats}
          focusDescriptionNonce={descriptionLedgerNonce}
        />
      ) : (
        <EmptyNote>
          No effective config — the pipeline did not get far enough to merge one.
        </EmptyNote>
      ),
      // Roadmap 089: the loaded repository's dependencies as the standard data
      // table. Not gated on `result.finalConfig` like its neighbours — what it
      // lists is a fact about the REPOSITORY, and a config the pipeline could
      // not merge does not make the repo's package files unreadable.
      deps: (
        <DependenciesPanel
          view={repoDeps}
          connect={repoConnect}
          onRetry={onLoadRepoDeps}
          onPin={onPinDep}
          onOpenInSimulator={onOpenDepInSimulator}
        />
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
    onJumpToTab,
    pipelinePhase,
    onSelectPipelinePhase,
    selectedStage,
    onSelectStage,
    deferredStage,
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
    onInject,
    selectedNodeId,
    onSelectNode,
    authState,
    onSignIn,
    onOverviewStats,
    onEffectiveStats,
    effectiveKeys,
    onShowDescriptionOrder,
    descriptionLedgerNonce,
    pins,
    onAddPin,
    onRemovePin,
    pendingRuleFocus,
    onRuleFocused,
    simRequest,
    onCopySimLink,
    onShare,
    mergeStepIndex,
    onMergeStepChange,
    repoDeps,
    onLoadRepoDeps,
    repoConnect,
    onPinDep,
    onOpenDepInSimulator,
    errorCount,
    warningCount,
    ruleProvenance,
    onJumpToSimRule,
    onApplyFix,
  ]);

  return (
    // Roadmap 081: every preset token under here explains itself from the same
    // two things — this run's tree and the app's one preset navigation. The
    // value is memoized on both, which are per-RUN identities (the tree object
    // is what `computeTreeStats` is cached on, and `selectPresetNode` is
    // identity-stable by construction), so typing in the editor never pushes a
    // new context value through the panels and the 032 render counts are
    // untouched.
    <PresetReferenceProvider value={presetReferences}>
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
    </PresetReferenceProvider>
  );
}
