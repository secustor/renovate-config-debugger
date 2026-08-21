import { type ReactNode, useState } from "react";
import type {
  ProvenanceLayer,
  RuleAttribution,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { nf } from "@/lib/format";
import { PIN_FORM_ID } from "./datalist-ids";
import { EMPTY_FORM, type FormState, hasMeaningfulInput } from "./form";
import { buildPinOutcome, type PinOutcome } from "./pin-outcome";
import { pinContext, pinName, MAX_PINS } from "./pins";
import { PinSectionHead } from "./PinRuleSections";
import { runSimulation } from "./run-simulation";
import { SimulatorForm } from "./SimulatorForm";
import { useEngineModule } from "./use-engine-module";
import { useSimulatorForm } from "./use-simulator-form";

/**
 * The design's "Add a test" box (Proposal F): always open at the foot of the
 * pins list, a tab strip offering the two ways a descriptor can arrive —
 * Manual (the simulator's own form, never a simplified copy that would drift
 * from it) and, one day, "From repository". The repository tab is the 078
 * surface: it needs extraction (dependencies detected from real package
 * files), which the browser engine does not run yet — so the tab is visible
 * and honestly disabled, exactly the design's `repoAvailable: false` state.
 *
 * The form's primary action is the design's: Simulate runs the descriptor
 * once and shows the verdict in the tests grammar right here — "simulation ·
 * not pinned" — and Pin is what keeps it. Both go through the same engine
 * call a pinned test uses (`runSimulation`), so a one-off verdict and the
 * pinned one can never disagree.
 */

interface OneOff {
  /** The run the verdict belongs to — anything else on screen makes it stale. */
  result: TraceResult;
  form: FormState;
  outcome: PinOutcome;
  effectiveUpdateType: string;
}

function OneOffResult({
  oneOff,
  canPin,
  onPin,
  onOpenInSimulator,
}: {
  oneOff: OneOff;
  canPin: boolean;
  onPin: () => void;
  /** The pin card's own quiet link, on the one-off too — with no pins yet it
   *  is the tab's only manual door into the full simulator. */
  onOpenInSimulator: (form: FormState) => void;
}) {
  const { form, outcome, effectiveUpdateType } = oneOff;
  return (
    <div className="card pin-oneoff">
      <div className="pin-head">
        <span className={`pin-dot ${outcome.matched.length === 0 ? "warn" : "ok"}`} />
        <span className="pin-name">{pinName(form)}</span>
        <span className="pin-meta">{pinContext(form, effectiveUpdateType)}</span>
        <span className="pin-summary">simulation · not pinned</span>
      </div>
      <div className="pin-oneoff-body">
        <PinSectionHead
          mark={outcome.matched.length === 0 ? "⚠" : "✓"}
          tone={outcome.matched.length === 0 ? "warn" : "ok"}
          pill={`${nf.format(outcome.matched.length)} matched`}
          text="same funnel as a pinned test: matched rules, your misses, skip buckets"
        />
        <PinSectionHead
          mark="▸"
          tone="muted"
          pill={`${nf.format(outcome.skippedCount)} skipped`}
          text={outcome.headline}
        />
        <p className="pin-oneoff-note">
          One-off result in the Tests grammar —{" "}
          {canPin ? (
            <button type="button" className="digest-link" onClick={onPin}>
              Pin
            </button>
          ) : (
            "Pin"
          )}{" "}
          keeps it in the list above and re-checks it on every run.
        </p>
        <button
          type="button"
          className="btn-quiet pin-open-sim"
          onClick={() => onOpenInSimulator(form)}
        >
          open in simulator →
        </button>
      </div>
    </div>
  );
}

function AddTestActions({
  simulateDisabled,
  atLimit,
  onPin,
}: {
  simulateDisabled: boolean;
  atLimit: boolean;
  onPin: () => void;
}) {
  return (
    <div className="pin-new-actions">
      {/* The form's submit button, associated across the DOM by `form=` — so
          Enter in a field and a click here are the same action (068). */}
      <button type="submit" form={PIN_FORM_ID} className="btn-primary" disabled={simulateDisabled}>
        Simulate <kbd>⏎</kbd>
      </button>
      {atLimit ? null : (
        <button type="button" className="btn-quiet" onClick={onPin}>
          Pin as a standing test
        </button>
      )}
    </div>
  );
}

/**
 * The design's Manual / "From repository" strip. It borrows the shell's tab
 * STYLING (`.tab-bar`/`.tab` — one tab grammar in the app) but deliberately
 * not its tablist ARIA: with a single selectable tab and no arrow-key roving,
 * `role="tablist"` would promise keyboard behavior that isn't there — and
 * would collide with everything that addresses the results strip by role.
 * When 078 lights the repository tab up, real tablist semantics come with it.
 */
function AddTestTabs() {
  return (
    <div className="tab-bar pin-add-tabs">
      <span className="tab active">Manual</span>
      <button
        type="button"
        className="tab"
        disabled
        title="Load a repository's config to pick from detected dependencies — not available yet"
      >
        From repository
        <span className="pin-add-tab-hint">soon</span>
      </button>
    </div>
  );
}

export function AddTestBox({
  result,
  layerByIndex,
  attribution,
  pinCount,
  seed,
  seedNonce,
  onAddPin,
  onOpenInSimulator,
  footnote,
}: {
  result: TraceResult;
  layerByIndex: Map<number, ProvenanceLayer>;
  attribution: RuleAttribution[] | null | undefined;
  pinCount: number;
  /** A quick-start chip's fill from the empty state, versioned by nonce so
   *  the same chip can be applied twice. */
  seed: Partial<FormState> | null;
  seedNonce: number;
  onAddPin: (form: FormState) => void;
  onOpenInSimulator: (form: FormState) => void;
  /** The design keeps "pins travel in the share link" inside this panel —
   *  the caller owns the note (it holds the share action). */
  footnote?: ReactNode;
}) {
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
  const [moreFieldsOpen, setMoreFieldsOpen] = useState(false);
  // Roadmap 015's empty-form guard: a descriptor with nothing identifying in
  // it would be pinned forever and match nothing on every run.
  const [emptyGuard, setEmptyGuard] = useState(false);
  const [oneOff, setOneOff] = useState<OneOff | null>(null);
  const [simulating, setSimulating] = useState(false);

  // The empty state's quick-start chips write into this form — synced during
  // render (the panel idiom), keyed by nonce so re-clicking the chip works.
  const [seenSeed, setSeenSeed] = useState(0);
  if (seedNonce !== seenSeed) {
    setSeenSeed(seedNonce);
    if (seed) {
      setForm({ ...EMPTY_FORM, ...seed });
      setUpdateTypeTouched(false);
      setEmptyGuard(false);
    }
  }

  const atLimit = pinCount >= MAX_PINS;

  function guarded(): boolean {
    if (!hasMeaningfulInput(form)) {
      setEmptyGuard(true);
      return false;
    }
    setEmptyGuard(false);
    return true;
  }

  function simulate() {
    const finalConfig = result.finalConfig;
    if (!guarded() || !finalConfig || simulating) {
      return;
    }
    setSimulating(true);
    const snapshot = { ...form };
    void runSimulation(finalConfig, snapshot, updateTypeTouched)
      .then(({ sim, effectiveUpdateType: ranType }) => {
        const outcome = buildPinOutcome(sim, layerByIndex, attribution, pinName(snapshot));
        setOneOff({ result, form: snapshot, outcome, effectiveUpdateType: ranType });
        return undefined;
      })
      .finally(() => setSimulating(false));
  }

  function pin(source: FormState, updateType: string) {
    // The EFFECTIVE updateType is baked in, not the raw field: a pin is a
    // saved test, and it must keep meaning what it meant when it was made.
    onAddPin({ ...source, updateType });
    setForm(EMPTY_FORM);
    setUpdateTypeTouched(false);
    setOneOff(null);
  }

  return (
    <div className="pin-add-panel">
      <p className="pin-add-label">Add a test</p>
      <div className="card pin-add-card">
        <AddTestTabs />
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
          onQuickFill={(fill) => {
            setForm({ ...EMPTY_FORM, ...fill });
            setUpdateTypeTouched(false);
            setEmptyGuard(false);
          }}
          onSubmit={simulate}
          formId={PIN_FORM_ID}
        />
        {emptyGuard && !hasMeaningfulInput(form) ? (
          <p className="sim-empty-guard">
            Pick an example above, or fill in a package name (or another identifying field) — an
            empty form can’t match anything.
          </p>
        ) : null}
        <AddTestActions
          simulateDisabled={simulating || !result.finalConfig}
          atLimit={atLimit}
          onPin={() => {
            if (guarded()) {
              pin(form, effectiveUpdateType);
            }
          }}
        />
        {atLimit ? (
          <p className="pin-limit-note">
            {MAX_PINS} pinned tests is the maximum — remove one to pin another.
          </p>
        ) : null}
      </div>
      {oneOff !== null && oneOff.result === result ? (
        <OneOffResult
          onOpenInSimulator={onOpenInSimulator}
          oneOff={oneOff}
          canPin={!atLimit}
          onPin={() => pin(oneOff.form, oneOff.effectiveUpdateType)}
        />
      ) : null}
      {footnote}
    </div>
  );
}
