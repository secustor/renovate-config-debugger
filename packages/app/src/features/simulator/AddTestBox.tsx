import { type ReactNode, useState } from "react";
import type {
  ProvenanceLayer,
  RuleAttribution,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { nf } from "@/lib/format";
import { PIN_FORM_ID } from "./datalist-ids";
import { EMPTY_FORM, type FormState, hasMeaningfulInput } from "./form";
import { EmptyFormGuard, PinLimitNote } from "./FormNotes";
import { type PasteFill, parsePastedDescriptor, pasteImportNote } from "./paste-descriptor";
import { buildPinOutcome, type PinCheck, dotTitle, dotTone, type PinOutcome } from "./pin-outcome";
import { pinContext, pinName, MAX_PINS } from "./pins";
import { PinSectionHead } from "./PinRuleSections";
import { runSimulation } from "./run-simulation";
import { SimulatorForm } from "./SimulatorForm";
import { useEngineModule } from "./use-engine-module";
// Aliased: the hook's return type and the form COMPONENT share a name, and
// this module is the one place that holds both.
import { type SimulatorForm as SimulatorFormApi, useSimulatorForm } from "./use-simulator-form";

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
  // A one-off exists only once its simulation came back, so the dot reads the
  // same `checked` state a pinned card's does — including the caveat, which is
  // what ambers it.
  const check: PinCheck = { status: "checked", outcome };
  return (
    <div className="card pin-oneoff">
      <div className="pin-head">
        <span className={`pin-dot ${dotTone(check)}`} title={dotTitle(check)} />
        <span className="pin-name">{pinName(form)}</span>
        <span className="pin-meta">{pinContext(form, effectiveUpdateType)}</span>
        <span className="pin-summary">simulation · not pinned</span>
      </div>
      <div className="pin-oneoff-body">
        {outcome.caveat ? <p className="sim-verdict-caveat">⚠ {outcome.caveat}</p> : null}
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

/** Which way a descriptor is arriving. "repo" is the 078 surface and is not
 *  selectable yet, so it is not one of these. */
type AddTestTab = "manual" | "paste";

/**
 * The design's Manual / Paste JSON / "From repository" strip. It borrows the
 * shell's tab STYLING (`.tab-bar`/`.tab` — one tab grammar in the app) but
 * deliberately not its tablist ARIA: there is no arrow-key roving here, so
 * `role="tablist"` would promise keyboard behavior that isn't there — and
 * would collide with everything that addresses the results strip by role.
 * When 078 lights the repository tab up, real tablist semantics come with it.
 *
 * `aria-pressed` is what carries the selection instead. Without it the two
 * live tabs differ only by a CSS class, and a screen reader reads two
 * identical buttons with no way to tell which panel is on screen.
 */
function AddTestTabs({
  tab,
  onTabChange,
}: {
  tab: AddTestTab;
  onTabChange: (t: AddTestTab) => void;
}) {
  return (
    <div className="tab-bar pin-add-tabs">
      <button
        type="button"
        className={`tab${tab === "manual" ? " active" : ""}`}
        aria-pressed={tab === "manual"}
        onClick={() => onTabChange("manual")}
      >
        Manual
      </button>
      <button
        type="button"
        className={`tab${tab === "paste" ? " active" : ""}`}
        aria-pressed={tab === "paste"}
        onClick={() => onTabChange("paste")}
      >
        Paste JSON
      </button>
      <button
        type="button"
        className="tab"
        disabled
        title="Sign in with GitHub or load a repo to pick from detected dependencies"
      >
        From repository
        <span className="pin-add-tab-hint">sign in required</span>
      </button>
    </div>
  );
}

const PASTE_PLACEHOLDER =
  '{ "packageName": "lodash", "datasource": "npm", "currentValue": "4.17.20", ... }';

/**
 * Roadmap 082: the Paste JSON tab. The descriptor a reader can already get
 * their hands on is the one Renovate's own debug log prints, and retyping its
 * eight fields into the sentence above is the step this removes. Parsing is
 * `paste-descriptor.ts`'s; this is the textarea around it.
 *
 * The design silently no-ops on invalid JSON. It says so inline instead: a
 * button that does nothing is indistinguishable from one that is broken, and a
 * half-copied log line (the commonest paste there is) is exactly the case that
 * produces it.
 *
 * The draft belongs to the CALLER (the design keeps `pasteDraft` in the card's
 * own state, and so does this): the panel unmounts on a tab switch, so a local
 * `useState` would throw away a descriptor the moment its author looked at the
 * form it filled.
 */
function PasteJsonTab({
  text,
  onTextChange,
  onFill,
}: {
  text: string;
  onTextChange: (text: string) => void;
  onFill: (value: PasteFill) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="pin-paste">
      <p className="pin-paste-intro">
        Paste a dependency descriptor from a Renovate debug log — look for{" "}
        <code>packageFiles with updates</code> — or any JSON with the same keys.
      </p>
      <textarea
        className="pin-paste-input"
        aria-label="Dependency descriptor JSON"
        placeholder={PASTE_PLACEHOLDER}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
      />
      {error ? <p className="sim-empty-guard">{error}</p> : null}
      <div className="pin-paste-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            const result = parsePastedDescriptor(text);
            setError(result.ok ? null : result.error);
            if (result.ok) {
              onFill(result.value);
            }
          }}
        >
          Parse &amp; fill
        </button>
        <span className="pin-paste-note">
          fills the Manual form — unknown keys are ignored, nothing is sent anywhere
        </span>
      </div>
    </div>
  );
}

/**
 * The Manual tab's own body: the form, the 015 empty guard, and the actions
 * row — one component because the tab strip now switches between two of these
 * and the alternative is five sibling `{tab === "manual" ? … : null}` lines.
 */
function ManualPanel({
  sim,
  importNote,
  emptyGuard,
  openGroup,
  onOpenGroupChange,
  onQuickFill,
  onSubmit,
  actions,
}: {
  sim: SimulatorFormApi;
  /** Roadmap 082: the receipt from a Paste-JSON import, or null. */
  importNote: string | null;
  emptyGuard: boolean;
  openGroup: number;
  onOpenGroupChange: (index: number) => void;
  onQuickFill: (fill: Partial<FormState>) => void;
  onSubmit: () => void;
  /** Simulate/Pin — they submit the form from OUTSIDE it (`form=`), so the
   *  caller keeps them and this only places them. */
  actions: ReactNode;
}) {
  return (
    <>
      {importNote ? <p className="pin-import-note">✓ {importNote}</p> : null}
      <SimulatorForm
        form={sim.form}
        setForm={sim.setForm}
        setUpdateTypeTouched={sim.setUpdateTypeTouched}
        effectiveUpdateType={sim.effectiveUpdateType}
        derivedUpdateType={sim.derivedUpdateType}
        updateTypeKeyDown={sim.updateTypeKeyDown}
        datasourceNames={sim.datasourceNames}
        managerNames={sim.managerNames}
        openGroup={openGroup}
        onOpenGroupChange={onOpenGroupChange}
        compact
        onQuickFill={onQuickFill}
        onSubmit={onSubmit}
        formId={PIN_FORM_ID}
      />
      {emptyGuard ? <EmptyFormGuard /> : null}
      {actions}
    </>
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
  // Kept whole as well as destructured: the Manual panel takes the API object
  // (it renders the form), while the simulate/pin actions here read the four
  // fields they act on.
  const simForm = useSimulatorForm(engineModule);
  const { form, setForm, updateTypeTouched, setUpdateTypeTouched, effectiveUpdateType } = simForm;
  // Roadmap 079: which field group is expanded (-1 = all closed, the state the
  // panel opens in). Held here rather than in the form so a re-render from a
  // simulation never folds what the reader opened.
  const [openGroup, setOpenGroup] = useState(-1);
  // Roadmap 015's empty-form guard: a descriptor with nothing identifying in
  // it would be pinned forever and match nothing on every run.
  const [emptyGuard, setEmptyGuard] = useState(false);
  const [oneOff, setOneOff] = useState<OneOff | null>(null);
  const [simulating, setSimulating] = useState(false);
  // Roadmap 082: which door the descriptor is coming through, the draft in the
  // other one (held here so a tab switch does not throw it away), and the
  // receipt the Manual tab wears after a paste came through it.
  const [tab, setTab] = useState<AddTestTab>("manual");
  const [pasteDraft, setPasteDraft] = useState("");
  const [importNote, setImportNote] = useState<string | null>(null);

  /**
   * Every door into this form — a quick-start chip, a quick-fill, a paste, the
   * clear after a pin — REPLACES the descriptor rather than patching it: a fill
   * is a whole dependency, and merging it over whatever the last one left
   * behind would carry a stale `packageFile: package.json` into a Dockerfile
   * descriptor without saying so. One function so the four doors cannot drift
   * into four slightly different meanings of "replace".
   *
   * @param opts.updateTypeTouched Whether the fill STATED an updateType
   * (roadmap 015): a value a log carried is the user's choice, not something to
   * re-derive from the versions and silently overwrite.
   * @param opts.note The receipt the Manual tab wears, or null — a note
   * describing a form that no longer exists is cleared with it.
   */
  function replaceForm(
    fill: Partial<FormState>,
    opts: { updateTypeTouched?: boolean; note?: string | null } = {},
  ) {
    setForm({ ...EMPTY_FORM, ...fill });
    setUpdateTypeTouched(opts.updateTypeTouched ?? false);
    setEmptyGuard(false);
    setImportNote(opts.note ?? null);
  }

  // The empty state's quick-start chips write into this form — synced during
  // render (the panel idiom), keyed by nonce so re-clicking the chip works.
  const [seenSeed, setSeenSeed] = useState(0);
  if (seedNonce !== seenSeed) {
    setSeenSeed(seedNonce);
    if (seed) {
      replaceForm(seed);
      setTab("manual");
    }
  }

  function applyPaste(value: PasteFill) {
    replaceForm(value.fill, {
      updateTypeTouched: value.updateTypeGiven,
      note: pasteImportNote(value),
    });
    setTab("manual");
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
    replaceForm({});
    setOneOff(null);
  }

  return (
    <div className="pin-add-panel">
      <p className="pin-add-label">Add a test</p>
      <div className="card pin-add-card">
        <AddTestTabs tab={tab} onTabChange={setTab} />
        {tab === "paste" ? (
          <PasteJsonTab text={pasteDraft} onTextChange={setPasteDraft} onFill={applyPaste} />
        ) : null}
        {tab === "manual" ? (
          <ManualPanel
            sim={simForm}
            importNote={importNote}
            emptyGuard={emptyGuard && !hasMeaningfulInput(form)}
            openGroup={openGroup}
            onOpenGroupChange={setOpenGroup}
            onQuickFill={(fill) => replaceForm(fill)}
            onSubmit={simulate}
            actions={
              <AddTestActions
                simulateDisabled={simulating || !result.finalConfig}
                atLimit={atLimit}
                onPin={() => {
                  if (guarded()) {
                    pin(form, effectiveUpdateType);
                  }
                }}
              />
            }
          />
        ) : null}
        {atLimit ? <PinLimitNote /> : null}
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
