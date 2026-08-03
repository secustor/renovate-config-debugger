import { memo, useCallback, useMemo } from "react";
import type { ProvenanceLayer, TraceResult } from "@renovate-config-visualizer/engine";
import { Term } from "@/components/glossary";
import { HypotheticalBanner } from "@/components/HypotheticalBanner";
import { RuleFramingText } from "@/components/rule-framing";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import type { ShareSimulator } from "@/lib/share";
import type { ErrorTranslationLib } from "@/platform/run";
import { ComparisonPanel } from "./ComparisonPanel";
import { consumedAuthoredBlocks } from "./consumed-blocks";
import { EMPTY_FORM, type FormState, hasMeaningfulInput } from "./form";
import { buildMergeStops } from "./merge-stops";
import { buildRuleEvidence } from "./rule-evidence";
import { SimMergeDrawer } from "./SimMergeDrawer";
import { SimMessages } from "./SimMessages";
import { SimRulesDrawer } from "./SimRulesDrawer";
import { SimulatorForm } from "./SimulatorForm";
import { SimVerdictBlock } from "./SimVerdictBlock";
import { UPDATE_TYPE_KEYS } from "./update-type-keys";
import { useAbComparison } from "./use-ab-comparison";
import { useEngineModule } from "./use-engine-module";
import { useRuleFocus } from "./use-rule-focus";
import { type SimRequest, useShareLinkRequest } from "./use-share-link-request";
import { useSimulationRun } from "./use-simulation-run";
import { useSimulatorDrawers } from "./use-simulator-drawers";
import { useSimulatorForm } from "./use-simulator-form";
import { buildVerdictSegments } from "./verdict-sentence";
import { buildVerdictThreads } from "./verdict-threads";

/**
 * Roadmap 006: the packageRules simulator. Describe a hypothetical dependency
 * update and see which of the CURRENT run's `finalConfig.packageRules` match
 * — rule by rule, clause by clause, with the config each matching rule
 * merges — plus the final per-dependency config Renovate would use.
 * Evaluation is on demand (Simulate button; quick-fill presets also run) via
 * the engine's `simulatePackageRules`, loaded through the same dynamic import
 * that keeps the renovate chunk out of the initial bundle.
 */

// Roadmap 032: memoized — the simulator renders the full merged rule list and
// reads nothing from the editor; its callback props are identity-stable in
// App (useCallback / the latest-ref idiom), so typing never re-renders it.
export const RuleSimulator = memo(function RuleSimulator({
  result,
  onSelectPreset,
  onJumpToEditor,
  focusRuleIndex,
  onRuleFocused,
  errorLib,
  simRequest,
  onCopySimLink,
  configInvalid,
  mergeStepIndex,
  onMergeStepChange,
}: {
  result: TraceResult;
  /** Roadmap 013: a rule row's provenance chip → the contributing preset node in the tree. */
  onSelectPreset?: (nodeId: string) => void;
  /** Roadmap 013: a merged-index validation message → the repo-config editor line. */
  onJumpToEditor?: (repoIndex: number) => void;
  /** Roadmap 013: a merged rule index to scroll to/highlight (from a validation
   *  message elsewhere on the page naming this rule's repo-config index). */
  focusRuleIndex?: number | null;
  /** Called once the requested `focusRuleIndex` has been handled (found or not). */
  onRuleFocused?: () => void;
  /** Roadmap 014: curated translations, explanation-only here — this echo
   *  validates the MERGED packageRules array (`validateConfig("repo", {
   *  packageRules: … })` over the simulated/flattened rules), not the editor's
   *  own text, so there's no safe surgical "Apply fix" target from this panel.
   *  When the same issue exists in the user's own rule, it also surfaces
   *  (with a fix) in the top-level Errors & warnings panel. */
  errorLib?: ErrorTranslationLib | null;
  /** Roadmap 018: simulator inputs a decoded share link carries; applied to the
   *  form (and auto-run when its flag is set) once per nonce. */
  simRequest?: SimRequest | null;
  /** Roadmap 018: encode the current config + view + these simulator inputs into
   *  a share link and copy it (App owns the full share state). */
  onCopySimLink?: (sim: ShareSimulator) => Promise<void>;
  /** Roadmap 023: validation reported errors — a real Renovate run would refuse
   *  this config, so these simulation results are hypothetical. */
  configInvalid?: boolean;
  /** Roadmap 044: the merge stepper's index, owned by App so a share link can
   *  restore it (mirrors `migrationStepIndex`). Absent = uncontrolled. */
  mergeStepIndex?: number;
  onMergeStepChange?: (index: number) => void;
}) {
  const ruleAttribution = useRuleProvenance(result);
  const engineModule = useEngineModule();
  const {
    form,
    setForm,
    updateTypeTouched,
    setUpdateTypeTouched,
    derivedUpdateType,
    effectiveUpdateType,
    datasourceNames,
    managerNames,
    updateTypeKeyDown,
  } = useSimulatorForm(engineModule);
  const {
    sim,
    simForm,
    simEffectiveUpdateType,
    ranKey,
    running,
    error,
    emptyGuardTriggered,
    showAll,
    setShowAll,
    myRulesOnly,
    setMyRulesOnly,
    focusHint,
    setFocusHint,
    simulate,
    simulateRef,
  } = useSimulationRun({ result, onMergeStepChange });
  useShareLinkRequest({ simRequest, result, setForm, setUpdateTypeTouched, simulateRef });
  const {
    moreFieldsOpen,
    setMoreFieldsOpen,
    rulesOpen,
    setRulesOpen,
    mergeOpen,
    setMergeOpen,
    rulesDrawerRef,
    mergeDrawerRef,
    jumpToRules,
    jumpToStep,
  } = useSimulatorDrawers({ mergeStepIndex, onMergeStepChange });
  // Roadmap 023: the user's own repo-config rules (013 provenance) — the merged
  // indices that came from the repo layer, for the "my rules only" filter.
  const repoRuleIndices = useMemo(
    () =>
      new Set((ruleAttribution ?? []).filter((a) => a.layer.kind === "repo").map((a) => a.index)),
    [ruleAttribution],
  );
  const { cardRef, focusRule } = useRuleFocus({
    focusRuleIndex,
    onRuleFocused,
    sim,
    showAll,
    setShowAll,
    myRulesOnly,
    setMyRulesOnly,
    rulesOpen,
    setRulesOpen,
    setFocusHint,
    repoRuleIndices,
  });
  const { pinned, pin, unpin, comparison, currentDescriptor } = useAbComparison({
    engineModule,
    sim,
    simForm,
    simEffectiveUpdateType,
    form,
    effectiveUpdateType,
  });

  const finalConfig = result.finalConfig;
  const packageRules = useMemo(
    () => (Array.isArray(finalConfig?.packageRules) ? finalConfig.packageRules : []),
    [finalConfig],
  );
  const layerByIndex = useMemo(() => {
    const map = new Map<number, ProvenanceLayer>();
    for (const attr of ruleAttribution ?? []) {
      map.set(attr.index, attr.layer);
    }
    return map;
  }, [ruleAttribution]);

  // Keys the rules changed vs. the pre-rules effective config, for the verdict
  // ledger and the final section's summary. Roadmap 046: the base is flattened
  // the same way the engine flattens `finalDependencyConfig` — the update-type
  // blocks Renovate ALWAYS deletes are not "removed by the rules", and listing
  // them as such buried the one real change under seven `removed` rows. A key
  // an update-type block genuinely merged UP still surfaces: it lands
  // top-level on the final config, where the base never had it.
  const changedKeys = useMemo(() => {
    if (!sim || !finalConfig) {
      return [];
    }
    const base: Record<string, unknown> = { ...finalConfig };
    delete base.packageRules;
    for (const key of UPDATE_TYPE_KEYS) {
      delete base[key];
    }
    const keys = new Set([...Object.keys(base), ...Object.keys(sim.finalDependencyConfig)]);
    return [...keys]
      .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(sim.finalDependencyConfig[key]))
      .toSorted();
  }, [sim, finalConfig]);

  // Roadmap 046: the merge timeline's stops — shared between the timeline
  // itself and the verdict ledger's "step N of M →" jump links.
  const mergeStops = useMemo(
    () => (sim ? buildMergeStops(sim, layerByIndex, onSelectPreset) : []),
    [sim, layerByIndex, onSelectPreset],
  );
  const flattenStopIndex = useMemo(() => {
    const i = mergeStops.findIndex((s) => s.kind === "flatten");
    return i === -1 ? undefined : i;
  }, [mergeStops]);
  // No merge recorded and no matched rule → no sequence to walk (matches the
  // 044 stepper's own guard); the final config falls back to the disclosure.
  const showTimeline = (sim?.mergeSteps.length ?? 0) > 0;

  // Roadmap 032: these four all walk the (potentially several-hundred-entry)
  // rule list and depend only on the last RUN, never on the live form — so
  // they must not re-derive on every keystroke in the form above. They sit
  // above the early returns below because hooks can't follow one.
  const matchedCount = useMemo(
    () => sim?.rules.filter((r) => r.verdict === "matched").length ?? 0,
    [sim],
  );
  const verdictSegments = useMemo(
    () =>
      sim ? buildVerdictSegments(sim, sim.flattened.updateType, changedKeys, ruleAttribution) : [],
    [sim, changedKeys, ruleAttribution],
  );
  // Roadmap 047: the authored update-type blocks flattening consumed without
  // applying — the only thing that still earns the verdict card's aside.
  const consumedBlocks = useMemo(
    () => (sim ? consumedAuthoredBlocks(sim, ruleAttribution) : []),
    [sim, ruleAttribution],
  );
  // Roadmap 053: the verdict card's threads — one per changed key, each
  // carrying its whole cascade. Same memo discipline as the ledger it replaces:
  // derived from the last RUN only, so typing in the form never re-walks it.
  const verdictThreads = useMemo(
    () => buildVerdictThreads(changedKeys, mergeStops, layerByIndex, sim),
    [changedKeys, mergeStops, layerByIndex, sim],
  );
  // Roadmap 053 layer 3: derived on demand — one popover is open at a time, and
  // a run can have hundreds of rules, so deriving every rule's evidence up
  // front would be work for a card nobody opens.
  const evidenceFor = useCallback(
    (ruleIndex: number) => buildRuleEvidence(ruleIndex, mergeStops, layerByIndex, sim),
    [mergeStops, layerByIndex, sim],
  );

  if (!finalConfig) {
    return null;
  }

  /**
   * Roadmap 018: build a share link that reproduces THIS simulation. The
   * effective updateType (derived or manual) is what actually drove the run, so
   * it is what gets encoded — the opener reproduces the exact verdict, not a
   * re-derivation. `autoSimulate` is always set: the affordance's whole promise
   * is "open this and it runs". Never includes tokens (the form has none).
   */
  async function copySimLink() {
    if (!onCopySimLink) {
      return;
    }
    const shareForm: Record<string, string> = {};
    for (const [key, value] of Object.entries(form)) {
      if (typeof value === "string" && value.trim() !== "") {
        shareForm[key] = value;
      }
    }
    if (effectiveUpdateType && effectiveUpdateType.trim() !== "") {
      shareForm.updateType = effectiveUpdateType;
    }
    // Roadmap 036: the copied state lives in CopyButton now.
    await onCopySimLink({ form: shareForm, autoSimulate: true });
  }

  /** Roadmap 053: the verdict foot's "build replay, K stops" link — the
   *  demoted drawer opens where the reader last left it (the first stop on a
   *  fresh run), not at a stop they never asked for. */
  function jumpToReplay() {
    jumpToStep(mergeStepIndex ?? 0);
  }

  function quickFill(fill: Partial<FormState>) {
    const next = { ...EMPTY_FORM, ...fill };
    setForm(next);
    // A quick-fill's updateType is only a starting guess, not the user's own
    // choice — derivation should keep tracking it if they go on to edit the
    // pre-filled versions.
    setUpdateTypeTouched(false);
    void simulate(next, false);
  }

  if (packageRules.length === 0) {
    return (
      <div className="card">
        <div className="card-title">
          Update simulator{" "}
          <span className="sim-title-hint">
            — test your <Term id="packageRules">packageRules</Term>
          </span>
        </div>
        <p className="empty-note">
          This config has no <Term id="packageRules">packageRules</Term> — nothing to simulate.
          Rules added by presets would appear here after a run that resolves them.
        </p>
      </div>
    );
  }

  const stale = sim !== null && ranKey !== JSON.stringify(form);
  // Roadmap 015: reactive, not sticky — the moment the form gains ANY
  // meaningful field, the guard clears itself even without clicking Simulate.
  const showEmptyGuard = emptyGuardTriggered && !hasMeaningfulInput(form);

  return (
    <div className="card" ref={cardRef}>
      <div className="card-title">
        Update simulator
        <span className="sim-title-hint">
          {" "}
          — describe a hypothetical dependency update and see which of the{" "}
          <RuleFramingText
            total={packageRules.length}
            attribution={ruleAttribution ?? null}
            variant="compact"
          />{" "}
          <Term id="packageRules">{packageRules.length === 1 ? "rule" : "rules"}</Term> would apply
        </span>
      </div>
      {configInvalid ? <HypotheticalBanner /> : null}
      {focusHint !== null && !sim ? (
        <p className="sim-focus-hint">
          <code>packageRules[{focusHint}]</code> is evaluated here once you run a simulation —
          describe a dependency below and click Simulate to see how it matches.
        </p>
      ) : null}
      <SimulatorForm
        form={form}
        setForm={setForm}
        updateTypeTouched={updateTypeTouched}
        setUpdateTypeTouched={setUpdateTypeTouched}
        effectiveUpdateType={effectiveUpdateType}
        derivedUpdateType={derivedUpdateType}
        updateTypeKeyDown={updateTypeKeyDown}
        datasourceNames={datasourceNames}
        managerNames={managerNames}
        moreFieldsOpen={moreFieldsOpen}
        onMoreFieldsToggle={setMoreFieldsOpen}
        onQuickFill={quickFill}
      />
      <div className="sim-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void simulate(form, updateTypeTouched)}
          disabled={running}
        >
          {running ? "Simulating…" : "Simulate"}
        </button>
        {stale ? (
          <span className="sim-stale">inputs changed — simulate again to refresh</span>
        ) : null}
      </div>
      {/* Roadmap 015: empty-form guard — replaces a would-be "0 of N rules
          matched" wall of no-matches with a plain nudge. */}
      {showEmptyGuard ? (
        <p className="sim-empty-guard">
          Pick an example above, or fill in a package name (or another identifying field) below — an
          empty form can't match anything.
        </p>
      ) : null}

      {error ? <p className="sim-error">Simulation failed: {error}</p> : null}

      {/* Roadmap 015: while stale, the whole results block is visibly greyed
          out (not just the small text hint below, which the persona study
          found easy to skim past) with a banner explaining why. */}
      {sim ? (
        <div className="sim-results">
          {stale ? (
            <p className="sim-stale-banner">
              Inputs changed since this run — these results may no longer reflect the form above.
              Simulate again to refresh.
            </p>
          ) : null}
          {/* The banner above stays full-strength; everything below it (the
              actual results) is what gets visibly veiled while stale. */}
          <div className={`sim-results-body${stale ? " stale" : ""}`}>
            {/* Roadmap 012: the answer first — a pinned verdict directly under
              the Simulate button, before the rule list. */}
            <SimVerdictBlock
              matchedCount={matchedCount}
              totalRules={sim.rules.length}
              segments={verdictSegments}
              threads={verdictThreads}
              flattened={sim.flattened}
              consumed={consumedBlocks}
              flattenStopIndex={showTimeline ? flattenStopIndex : undefined}
              replayStops={mergeStops.length}
              dep={
                simForm
                  ? {
                      manager: simForm.manager || simForm.datasource || undefined,
                      packageName: simForm.packageName || simForm.depName || undefined,
                      currentValue: simForm.currentValue || undefined,
                      newValue: simForm.newValue || undefined,
                    }
                  : null
              }
              onSelectPreset={onSelectPreset}
              onJumpToStep={showTimeline ? jumpToStep : undefined}
              onJumpToRules={jumpToRules}
              onJumpToReplay={showTimeline ? jumpToReplay : undefined}
              evidenceFor={evidenceFor}
              // The popover's footer lands on the rule ROW itself — the 013
              // focus wiring opens the drawer, clears whatever filter hides
              // the row, scrolls to it and flashes it.
              onOpenRule={focusRule}
              copySimLink={onCopySimLink ? copySimLink : null}
              pinned={pinned !== null}
              onUnpin={unpin}
              onPin={pin}
            />

            {pinned ? (
              <ComparisonPanel
                pinned={pinned}
                comparison={comparison}
                currentDescriptor={currentDescriptor}
              />
            ) : null}

            {[...sim.errors, ...sim.warnings].length > 0 ? (
              <SimMessages
                errors={sim.errors}
                warnings={sim.warnings}
                ruleAttribution={ruleAttribution}
                onJumpToEditor={onJumpToEditor}
                onJumpToSimRule={focusRule}
                errorLib={errorLib ?? null}
              />
            ) : null}
            {sim.notes.map((note) => (
              <p key={note} className="sim-note">
                {note}
              </p>
            ))}
            {/* Roadmap 047: the evidence layers, each behind a summary drawer
                whose collapsed row abstracts what it holds. "0 of N matched"
                with no badges IS the no-match explanation. */}
            <SimRulesDrawer
              rules={sim.rules}
              matchedCount={matchedCount}
              repoRuleIndices={repoRuleIndices}
              myRulesOnly={myRulesOnly}
              onMyRulesOnlyChange={setMyRulesOnly}
              showAll={showAll}
              onShowAllChange={setShowAll}
              layerByIndex={layerByIndex}
              onSelectPreset={onSelectPreset}
              open={rulesOpen}
              onToggle={setRulesOpen}
              detailsRef={rulesDrawerRef}
            />
            <SimMergeDrawer
              finalDependencyConfig={sim.finalDependencyConfig}
              stops={mergeStops}
              showTimeline={showTimeline}
              changedKeys={changedKeys}
              mergeStepIndex={mergeStepIndex}
              onMergeStepChange={onMergeStepChange}
              open={mergeOpen}
              onToggle={setMergeOpen}
              detailsRef={mergeDrawerRef}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
});
