import { nf } from "@/lib/format";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { TraceResult } from "@renovate-config-debugger/engine";
import { Term } from "@/components/glossary";
import { RuleFramingAside } from "@/components/rule-framing";
import { useDescriptionProvenance } from "@/hooks/description-provenance";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import { consumedAuthoredBlocks } from "@/lib/consumed-blocks";
import { ruleLayerIndex } from "@/lib/rule-filters";
import type { ShareSimulator } from "@/lib/share";
import { changedDependencyKeys } from "@/lib/simulation-changes";
import { buildNoInputCaveat, buildVerdictSegments } from "@/lib/verdict-sentence";
import type { ErrorTranslationLib } from "@/platform/run";
import { ComparisonPanel } from "./ComparisonPanel";
import { SIM_FORM_ID } from "./datalist-ids";
import { EMPTY_FORM, type FormState, hasMeaningfulInput } from "./form";
import { buildMergeStops } from "./merge-stops";
import { ReturnPill } from "./ReturnPill";
import { buildRuleDescriptions } from "./rule-descriptions";
import { buildRuleEvidence } from "./rule-evidence";
import { SimMergeDrawer } from "./SimMergeDrawer";
import { SimMessages } from "./SimMessages";
import { SimRulesDrawer } from "./SimRulesDrawer";
import { SimulatorForm } from "./SimulatorForm";
import { SimVerdictBlock } from "./SimVerdictBlock";
import { useAbComparison } from "./use-ab-comparison";
import { useEngineModule } from "./use-engine-module";
import { useRuleFocus } from "./use-rule-focus";
import { type SimRequest, useShareLinkRequest } from "./use-share-link-request";
import { useSimulationRun } from "./use-simulation-run";
import { useSimulatorDrawers } from "./use-simulator-drawers";
import { useSimulatorForm } from "./use-simulator-form";
import { useThreadNav } from "./use-thread-nav";
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
/** Replay-02 R1: the stale banner names the run it describes, so a cropped
 *  screenshot of a stale card is self-labelling instead of actively wrong. */
function SimStaleBanner({ ranLabel }: { ranLabel: string }) {
  if (!ranLabel) {
    return (
      <p className="sim-stale-banner">
        Inputs changed since this run — these results may no longer reflect the form above. Simulate
        again to refresh.
      </p>
    );
  }
  return (
    <p className="sim-stale-banner">
      These results are for <code>{ranLabel}</code> — inputs changed since this run. Simulate again
      to refresh.
    </p>
  );
}

export const RuleSimulator = memo(function RuleSimulator({
  result,
  onSelectPreset,
  onJumpToEditor,
  focusRuleIndex,
  onRuleFocused,
  errorLib,
  simRequest,
  onCopySimLink,
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
  /** Roadmap 044: the merge stepper's index, owned by App so a share link can
   *  restore it (mirrors `migrationStepIndex`). Absent = uncontrolled. */
  mergeStepIndex: number;
  onMergeStepChange: (index: number) => void;
}) {
  const ruleAttribution = useRuleProvenance(result);
  // Roadmap 069 (PR 5): the author's description of every described rule, from
  // the same per-run walk the Overview digest and the blame ledger read (the
  // hook caches it per result, so this is a third consumer, not a third walk).
  const descriptionProvenance = useDescriptionProvenance(result);
  const ruleDescriptions = useMemo(
    () => buildRuleDescriptions(descriptionProvenance),
    [descriptionProvenance],
  );
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
    ruleFilters,
    setRuleFilters,
    focusHint,
    setFocusHint,
    simulate,
    simulateRef,
  } = useSimulationRun({ result, onMergeStepChange });
  // Roadmap 054 layer 4: thread expansion + the return pill. Declared BEFORE
  // the share-link request so its reset effect (keyed on the run) is
  // registered first: a link arms the thread it wants, the auto-run it starts
  // produces the sim, and the reset effect is what applies the armed key.
  const threadNav = useThreadNav(sim);
  useShareLinkRequest({
    simRequest,
    result,
    setForm,
    setUpdateTypeTouched,
    simulateRef,
    onThreadRequest: threadNav.requestThread,
  });
  const {
    openFieldGroup,
    setOpenFieldGroup,
    rulesOpen,
    setRulesOpen,
    mergeOpen,
    setMergeOpen,
    rulesDrawerRef,
    mergeDrawerRef,
    jumpToRules,
    jumpToStep,
  } = useSimulatorDrawers({ mergeStepIndex, onMergeStepChange });
  // Roadmap 013: which config level contributed each merged rule — the rule
  // rows' provenance chips, the drawer's badge row, and the provenance filter
  // facet (the successor to "my rules only") all read it. Declared here rather
  // than beside the other derived state because `useRuleFocus` needs it to
  // answer "is the row this link names currently filtered out?".
  const layerByIndex = useMemo(() => ruleLayerIndex(ruleAttribution), [ruleAttribution]);
  const { cardRef, focusRule } = useRuleFocus({
    focusRuleIndex,
    onRuleFocused,
    sim,
    ruleFilters,
    setRuleFilters,
    layerByIndex,
    rulesOpen,
    setRulesOpen,
    setFocusHint,
  });
  /**
   * Roadmap 068 review: the request made while a simulation is in flight — one
   * slot, holding the NEWEST one.
   *
   * A slot rather than App's serial run queue (`lib/run-queue.ts`), which runs
   * every request in order because each carries inputs of its own and a caller
   * awaiting its result. A simulation has neither: nothing awaits it, and what
   * it produces is one verdict card, so two presses during one wait would paint
   * the second screen over the first with nothing to see in between. The form
   * they differ in is captured at PRESS time all the same, for the reason
   * `onRun` resolves its inputs before it queues — a waiting request has to
   * carry the state its caller meant.
   */
  const pendingRunRef = useRef<{ form: FormState; touched: boolean } | null>(null);
  useEffect(() => {
    if (running) {
      return;
    }
    const pending = pendingRunRef.current;
    pendingRunRef.current = null;
    if (pending !== null) {
      // The ref, not the `simulate` this render closed over: this effect's deps
      // are the run's state, and `simulate` is redeclared every render (the
      // same reason `useShareLinkRequest` takes the ref).
      void simulateRef.current?.(pending.form, pending.touched);
    }
  }, [running, simulateRef]);
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
  // Keys the rules changed vs. the pre-rules effective config, for the verdict
  // ledger and the final section's summary — the shared derivation, so the CLI
  // quotes the same list (roadmap 048). The memo stays: it walks the whole
  // effective config, and re-deriving it per keystroke is what roadmap 032
  // measured away.
  const changedKeys = useMemo(
    () => (sim ? changedDependencyKeys(sim, finalConfig) : []),
    [sim, finalConfig],
  );

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
  // Replay-02 R3: "your rule lost to an empty form field, not to your data" —
  // stated on the card itself, since the card is what gets screenshotted.
  const verdictCaveat = useMemo(
    () => (sim ? buildNoInputCaveat(sim, ruleAttribution) : undefined),
    [sim, ruleAttribution],
  );
  // Roadmap 075 (iteration 3): the hypothetical-run banner (and Replay-02 R1's
  // reserved box that keeps this card's controls from moving when it clears)
  // moved up to the results shell's run-level banner slot — see
  // `ResultsColumn`. It says the same thing about the same run, once, on
  // whichever tab the reader is on.
  // Roadmap 047: the authored update-type blocks flattening consumed without
  // applying — the only thing that still earns the verdict card's aside.
  const consumedBlocks = useMemo(
    () => (sim ? consumedAuthoredBlocks(sim, ruleAttribution) : []),
    [sim, ruleAttribution],
  );
  // Roadmap 054: the verdict card's threads — one per changed key, each
  // carrying its whole cascade. Same memo discipline as the ledger it replaces:
  // derived from the last RUN only, so typing in the form never re-walks it.
  const verdictThreads = useMemo(
    () => buildVerdictThreads(changedKeys, mergeStops, layerByIndex, sim),
    [changedKeys, mergeStops, layerByIndex, sim],
  );
  // Roadmap 054 layer 3: derived on demand — one popover is open at a time, and
  // a run can have hundreds of rules, so deriving every rule's evidence up
  // front would be work for a card nobody opens.
  const evidenceFor = useCallback(
    (ruleIndex: number) =>
      buildRuleEvidence(ruleIndex, mergeStops, layerByIndex, sim, ruleDescriptions),
    [mergeStops, layerByIndex, sim, ruleDescriptions],
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
    // Roadmap 054: the link also carries the thread the sender was reading —
    // but only when exactly ONE is open, since two would make the app pick
    // which of the sender's questions the link is about. Still never a token:
    // a thread key is one of the config's own option names.
    const share: ShareSimulator = { form: shareForm, autoSimulate: true };
    if (threadNav.shareThreadKey !== undefined) {
      share.simThread = threadNav.shareThreadKey;
    }
    // Roadmap 036: the copied state lives in CopyButton now.
    await onCopySimLink(share);
  }

  /** Roadmap 054: the verdict foot's "build replay, K stops" link — the
   *  demoted drawer opens where the reader last left it (the first stop on a
   *  fresh run), not at a stop they never asked for. */
  function jumpToReplay() {
    jumpToStep(mergeStepIndex);
  }

  /** Every simulation the PANEL starts goes through here — run it now, or hold
   *  the newest request until the one in flight is done (`pendingRunRef`). A
   *  link's auto-run does not: it is armed against a fresh pipeline result and
   *  calls the run through `simulateRef` itself (`useShareLinkRequest`). */
  function runSimulation(next: FormState, touched: boolean) {
    if (running) {
      pendingRunRef.current = { form: next, touched };
      return;
    }
    void simulate(next, touched);
  }

  /** The form's own submission — the Simulate button and Enter in a field are
   *  both this, since the button submits the form rather than acting beside it. */
  function submitSimulation() {
    runSimulation(form, updateTypeTouched);
  }

  function quickFill(fill: Partial<FormState>) {
    const next = { ...EMPTY_FORM, ...fill };
    setForm(next);
    // A quick-fill's updateType is only a starting guess, not the user's own
    // choice — derivation should keep tracking it if they go on to edit the
    // pre-filled versions.
    setUpdateTypeTouched(false);
    runSimulation(next, false);
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
  // Replay-02 R1: what the LAST RUN simulated (not the live form) — the stale
  // banner quotes it so a stale capture names the inputs it belongs to.
  const ranLabel = simForm
    ? [
        simForm.packageName || simForm.depName,
        simForm.currentValue,
        simForm.newValue ? `→ ${simForm.newValue}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";
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
          {nf.format(packageRules.length)}{" "}
          <Term id="packageRules">{packageRules.length === 1 ? "rule" : "rules"}</Term> would apply
          <RuleFramingAside total={packageRules.length} attribution={ruleAttribution ?? null} />
        </span>
      </div>
      {focusHint !== null && !sim ? (
        <p className="sim-focus-hint">
          <code>packageRules[{focusHint}]</code> is evaluated here once you run a simulation —
          describe a dependency below and click Simulate to see how it matches.
        </p>
      ) : null}
      <SimulatorForm
        form={form}
        setForm={setForm}
        setUpdateTypeTouched={setUpdateTypeTouched}
        effectiveUpdateType={effectiveUpdateType}
        derivedUpdateType={derivedUpdateType}
        updateTypeKeyDown={updateTypeKeyDown}
        datasourceNames={datasourceNames}
        managerNames={managerNames}
        openGroup={openFieldGroup}
        onOpenGroupChange={setOpenFieldGroup}
        onQuickFill={quickFill}
        onSubmit={submitSimulation}
      />
      <div className="sim-actions">
        {/* Roadmap 068: the form s submit button, associated across the DOM
            by the form attribute — so Enter in a field and a click here are the
            same action, not two code paths that have to be kept in step.

            Not disabled while a run is in flight, which is the price of that
            sameness (068 review). HTML performs implicit submission by firing a
            click at the form's DEFAULT BUTTON — the first submit button among
            its controls, which is this one — and only when that button is not
            disabled. So `disabled={running}` did not merely grey a control out:
            it took implicit submission off the form entirely, and Enter in
            `packageName` during a run produced no click, no `submit` event and
            no feedback of any kind, in a state the `?` sheet documents Enter as
            working in. The press is held instead, the way ⌘⏎ holds a run rather
            than dropping it, and the label is what says one is already going. */}
        {/* Roadmap 079: the design prints the key on the primary action, the
            same way the Add-a-test panel's Simulate does — one grammar for
            "Enter does this", on both of the form's two homes. */}
        <button type="submit" form={SIM_FORM_ID} className="btn-primary">
          {running ? "Simulating…" : "Simulate"} <kbd>⏎</kbd>
        </button>
        {stale ? (
          <span className="sim-stale">inputs changed — simulate again to refresh</span>
        ) : null}
      </div>
      {/* Roadmap 015: empty-form guard — replaces a would-be "0 of N rules
          matched" wall of no-matches with a plain nudge. */}
      {showEmptyGuard ? (
        <p className="sim-empty-guard">
          Pick an example above, or fill in a package name (or another identifying field) — an empty
          form can’t match anything.
        </p>
      ) : null}

      {error ? <p className="sim-error">Simulation failed: {error}</p> : null}

      {/* Roadmap 015: while stale, the whole results block is visibly greyed
          out (not just the small text hint below, which the persona study
          found easy to skim past) with a banner explaining why. */}
      {sim ? (
        <div className="sim-results">
          {stale ? <SimStaleBanner ranLabel={ranLabel} /> : null}
          {/* The banner above stays full-strength; everything below it (the
              actual results) is what gets visibly veiled while stale. */}
          <div className={`sim-results-body${stale ? " stale" : ""}`}>
            {/* Roadmap 012: the answer first — a pinned verdict directly under
              the Simulate button, before the rule list. */}
            <SimVerdictBlock
              matchedCount={matchedCount}
              totalRules={sim.rules.length}
              segments={verdictSegments}
              caveat={verdictCaveat}
              threads={verdictThreads}
              threadNav={{
                open: threadNav.openThreads,
                onToggle: threadNav.toggleThread,
                onJumpFrom: threadNav.noteJump,
              }}
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

            {/* Roadmap 054 layer 4: the way back from a thread's own jump.
                Portalled to <body> (see ReturnPill), so where it sits in this
                tree decides nothing but its lifetime — which is the run's. */}
            {threadNav.returnKey !== null ? (
              <ReturnPill
                threadKey={threadNav.returnKey}
                onReturn={threadNav.returnToThread}
                onFocusFrom={threadNav.notePillFocus}
              />
            ) : null}

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
              filters={ruleFilters}
              onFiltersChange={setRuleFilters}
              layerByIndex={layerByIndex}
              descriptionByIndex={ruleDescriptions}
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
      ) : pinned ? (
        // The pin's whole purpose is surviving a pipeline re-run (which clears
        // `sim` above) — so the panel must not vanish with the results block,
        // or the pin reads as deleted at exactly the step the workflow needs
        // it. It carries its own Unpin here, since the verdict card is gone.
        <div className="sim-results">
          <ComparisonPanel
            pinned={pinned}
            comparison={null}
            currentDescriptor={currentDescriptor}
            awaitingSimulate
            onUnpin={unpin}
          />
        </div>
      ) : null}
    </div>
  );
});
