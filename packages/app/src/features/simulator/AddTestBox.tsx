import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type {
  ProvenanceLayer,
  RuleAttribution,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { nf } from "@/lib/format";
import { nextTabIndex } from "@/lib/roving-tabs";
import { anyModifierHeld } from "@/lib/shortcuts";
import { PIN_FORM_ID, PIN_TAB_PANEL_ID, pinTabId } from "./dom-ids";
import { DescriptorActions } from "./DescriptorActions";
import { EMPTY_FORM } from "./form";
import { EmptyFormGuard, PinLimitNote } from "./FormNotes";
import { OpenInSimulatorLink } from "./OpenInSimulatorLink";
import { type PasteFill, parsePastedDescriptor, pasteImportNote } from "./paste-descriptor";
import type { PinCheck } from "./pin-outcome";
import { PinHeadRow } from "./PinHeadRow";
import { pinContext, pinName, MAX_PINS } from "./pins";
import { PinSectionHead } from "./PinRuleSections";
import { draftFill, type RepoDraft } from "./repo-deps";
import { RepoDiscoveryGate } from "@/components/RepoDiscoveryGate";
import { RepoDepsTab } from "./RepoDepsTab";
import { type OneOff, useOneOffSimulation } from "./use-one-off-simulation";
import { usePinCardOpen } from "./use-pin-card-open";
import { SimulatorForm } from "./SimulatorForm";
import { useEngineModule } from "./use-engine-module";
// Aliased: the hook's return type and the form COMPONENT share a name, and
// this module is the one place that holds both.
import { type SimulatorForm as SimulatorFormApi, useSimulatorForm } from "./use-simulator-form";
import { useSyncedReset } from "@/hooks/use-synced-reset";
import type { FormState, PinnedTest } from "@/types/simulator";
import type { RepoConnectOffer, RepoDepsView } from "@/types/repo";

/**
 * The design's pin card (`Pin Options`), now in its GHOST form: a collapsed
 * "+ Pin a dependency…" row at the foot of the pins list that expands into the
 * "New pin" card. 082 originally kept the card always open; the ghost variant
 * was adopted later — the pins list is the tab's subject, and the entry form
 * only takes its height while a pin is being made. The card starts OPEN when
 * there are no pins yet (the empty state points straight at it).
 *
 * Three tabs carry the ways a descriptor arrives: Manual (the simulator's own
 * form, never a simplified copy that would drift from it), Paste JSON (082),
 * and From repository (078) — the dependencies Renovate's own extraction found
 * in the loaded repository, enabled only once a repo load makes that offer
 * meaningful. With the third tab live, the strip carries real tablist
 * semantics: `role="tablist"`, `aria-selected`, and arrow-key roving.
 *
 * The form's primary action is the design's: Simulate runs the descriptor
 * once and shows the verdict in the tests grammar right here — "simulation ·
 * not pinned" — and Pin is what keeps it. Both go through the same engine
 * call a pinned test uses (`runSimulation`), so a one-off verdict and the
 * pinned one can never disagree.
 */

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
        <PinHeadRow
          check={check}
          name={pinName(form)}
          context={pinContext(form, effectiveUpdateType)}
          summary="simulation · not pinned"
        />
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
        <OpenInSimulatorLink onClick={() => onOpenInSimulator(form)} />
      </div>
    </div>
  );
}

/**
 * A one-off run that THREW, in the card slot its verdict would have taken.
 * Showing nothing is indistinguishable from never having asked, so the failure
 * is stated in the pins tab's own wording (`PinCard` says the same thing about
 * a pinned test whose evaluation failed) and ambered like a verdict's caveat.
 */
function OneOffErrorNote({ message }: { message: string }) {
  return (
    <div className="card pin-oneoff">
      <p className="sim-verdict-caveat">⚠ This simulation could not be checked: {message}</p>
    </div>
  );
}

/** Which way a descriptor is arriving. */
type AddTestTab = "manual" | "paste" | "repo";

/**
 * The design's Manual / Paste JSON / From repository strip — the standard
 * `.tab-bar` styling at the card's scale, and (since 078 lit the third tab up)
 * real tablist semantics: `role="tablist"`, `aria-selected`, and arrow-key
 * roving. The repo tab is ALWAYS live: while no repo is loaded it wears a
 * quiet "not loaded" hint and opens the connect panel instead of the picker —
 * a door that explains itself beats one that is locked.
 *
 * When the card was opened from the ghost row it is a "New pin" in progress:
 * the strip leads with that label and closes with the × that collapses it.
 */
function AddTestTabs({
  tab,
  onTabChange,
  repoAvailable,
  repoSuggested,
  closable,
  onClose,
}: {
  tab: AddTestTab;
  onTabChange: (t: AddTestTab) => void;
  repoAvailable: boolean;
  /** A share link named the repo this config came from (the tab's title says
   *  how to reconnect it, before the panel does). */
  repoSuggested: boolean;
  /** With nothing pinned the card is the tab's whole subject and stays open —
   *  the collapse × only exists once pins hold the ground behind it. */
  closable: boolean;
  onClose: () => void;
}) {
  const refs = useRef(new Map<AddTestTab, HTMLButtonElement>());
  const order: AddTestTab[] = ["manual", "paste", "repo"];
  function rove(e: KeyboardEvent<HTMLDivElement>) {
    // Only the tabs rove — the close × shares the strip but not the pattern,
    // and an arrow pressed on it must not switch tabs or yank focus.
    if (!(e.target instanceof HTMLElement) || e.target.getAttribute("role") !== "tab") {
      return;
    }
    // A modified chord belongs to the browser or the OS, not to this strip:
    // ⌘←/Alt+← is Back, Ctrl+Home/End is page scroll, Shift+Home extends a
    // selection. `ResultsPanel`'s tab strip asks the same question for the same
    // reason and documents it at length — these are named keys, so Shift counts.
    // Without this the `preventDefault()` below swallows all three gestures
    // whenever focus sits on Manual / Paste JSON / From repository.
    if (anyModifierHeld(e)) {
      return;
    }
    const nextAt = nextTabIndex(e.key, order.indexOf(tab), order.length);
    if (nextAt === null) {
      return;
    }
    e.preventDefault();
    const next = order[nextAt];
    if (next !== undefined) {
      onTabChange(next);
      refs.current.get(next)?.focus();
    }
  }
  function tabButton(id: AddTestTab, label: ReactNode, title?: string) {
    return (
      <button
        type="button"
        role="tab"
        id={pinTabId(id)}
        aria-selected={tab === id}
        aria-controls={PIN_TAB_PANEL_ID}
        tabIndex={tab === id ? 0 : -1}
        className={`tab${tab === id ? " active" : ""}`}
        title={title}
        ref={(el) => {
          if (el) {
            refs.current.set(id, el);
          }
        }}
        onClick={() => onTabChange(id)}
      >
        {label}
      </button>
    );
  }
  const repoTitle = repoAvailable
    ? undefined
    : repoSuggested
      ? "Opened from a shared link — reload the repository to pick from detected dependencies"
      : "Load the repository to pick from its detected dependencies";
  return (
    // oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the composite-tablist pattern, same as `ResultsPanel`'s bar: the roving tabindex lives on the `<button role="tab">`s that `tabButton` renders, and the container stays out of the tab order so Tab leaves the bar rather than entering it. `rove` is here because the arrow keys are handled by delegation — the other half of that same pattern, not a sign the container should be focusable.
    <div className="tab-bar pin-add-tabs" role="tablist" aria-label="New pin" onKeyDown={rove}>
      <span className="pin-add-newpin">New pin</span>
      {tabButton("manual", "Manual")}
      {tabButton("paste", "Paste JSON")}
      {tabButton(
        "repo",
        repoAvailable ? (
          "From repository"
        ) : (
          <>
            From repository
            <span className="pin-add-tab-hint">not loaded</span>
          </>
        ),
        repoTitle,
      )}
      {closable ? (
        <button
          type="button"
          className="pin-add-close"
          aria-label="Close the new-pin card"
          onClick={onClose}
        >
          ×
        </button>
      ) : null}
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
 * The From-repository tab behind the SHARED discovery gate (roadmap 089/090) —
 * not-loaded, reading and failed are answered here exactly as the Dependencies
 * tab and the Extract phase answer them, so three doors onto one discovery can
 * never disagree. A leaf component because the gate is a JSX level and the
 * tabpanel wrapper already spends the depth budget.
 */
function RepoTabPanel({
  view,
  connect,
  onRetry,
  pins,
  atLimit,
  draft,
  onDraftChange,
  onPinDraft,
  onRefineDraft,
}: {
  view: RepoDepsView;
  connect: RepoConnectOffer;
  onRetry: () => void;
  pins: PinnedTest[];
  atLimit: boolean;
  draft: RepoDraft | null;
  onDraftChange: (draft: RepoDraft | null) => void;
  onPinDraft: () => void;
  onRefineDraft: () => void;
}) {
  return (
    <RepoDiscoveryGate view={view} connect={connect} onRetry={onRetry}>
      {/* Keyed: the search box is per-repo state and must not survive a new load. */}
      <RepoDepsTab
        key={view.repo}
        view={view}
        pins={pins}
        atLimit={atLimit}
        draft={draft}
        onDraftChange={onDraftChange}
        onPinDraft={onPinDraft}
        onRefineDraft={onRefineDraft}
      />
    </RepoDiscoveryGate>
  );
}

/**
 * The Manual tab's own body: the form, the 015 empty guard, and the actions
 * row — one component because the tab strip now switches between three of
 * these and the alternative is five sibling `{tab === "manual" ? … : null}`
 * lines.
 */
function ManualPanel({
  sim,
  openGroup,
  onOpenGroupChange,
  onQuickFill,
  onSubmit,
  actions,
}: {
  /** Carries its own `importNote` (082's paste receipt) and `showEmptyGuard`
   *  — they used to be passed AGAIN as separate props beside it, so the same
   *  two facts arrived twice and could in principle disagree. */
  sim: SimulatorFormApi;
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
      {sim.importNote ? <p className="pin-import-note">✓ {sim.importNote}</p> : null}
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
      {sim.showEmptyGuard ? <EmptyFormGuard /> : null}
      {actions}
    </>
  );
}

export function AddTestBox({
  result,
  layerByIndex,
  attribution,
  pins,
  seed,
  seedNonce,
  repoDeps,
  onLoadRepoDeps,
  repoConnect,
  onAddPin,
  onOpenInSimulator,
  footnote,
}: {
  result: TraceResult;
  layerByIndex: Map<number, ProvenanceLayer>;
  attribution: RuleAttribution[] | null | undefined;
  /** The standing pins — for the cap, and for the repo tab's "pinned" badges. */
  pins: PinnedTest[];
  /** A quick-start chip's fill from the empty state, versioned by nonce so
   *  the same chip can be applied twice. */
  seed: Partial<FormState> | null;
  seedNonce: number;
  /** Roadmap 078: the loaded repository's extracted dependencies — the shell
   *  computes this view; `""` for `repo` means no repo was loaded. */
  repoDeps: RepoDepsView;
  /** Kicks discovery off (or retries it); fired when the repo tab opens. */
  onLoadRepoDeps: () => void;
  /** The connect offer the repo tab makes while NO repo is loaded — a share
   *  link's suggested repo and the two ways to get one (see repo-deps.ts). */
  repoConnect: RepoConnectOffer;
  onAddPin: (form: FormState) => void;
  onOpenInSimulator: (form: FormState) => void;
  /** The design keeps "pins travel in the share link" inside this panel —
   *  the caller owns the note (it holds the share action). */
  footnote?: ReactNode;
}) {
  const engineModule = useEngineModule();
  // Kept whole as well as destructured: the Manual panel takes the API object
  // (it renders the form), while the simulate/pin actions here read the few
  // members they act on.
  const simForm = useSimulatorForm(engineModule);
  const { form, updateTypeTouched, replaceForm, guard, pinDescriptor } = simForm;
  // Roadmap 079: which field group is expanded (-1 = all closed, the state the
  // panel opens in). Held here rather than in the form so a re-render from a
  // simulation never folds what the reader opened.
  const [openGroup, setOpenGroup] = useState(-1);
  // The card's own "check this once, without pinning it" run.
  const {
    oneOff,
    error: oneOffError,
    simulating,
    simulate,
    clear: clearOneOff,
  } = useOneOffSimulation({
    result,
    layerByIndex,
    attribution,
    guard,
  });
  // Roadmap 082: which door the descriptor is coming through, and the drafts
  // in the other two — held here so a tab switch does not throw them away.
  // The DEFAULT is derived, not stored (the design's rule): until the reader
  // picks a tab, a loaded repository opens the card on From repository — the
  // picker is the natural door when the deps are already on the table — and
  // Manual otherwise.
  const [chosenTab, setChosenTab] = useState<AddTestTab | null>(null);
  const [pasteDraft, setPasteDraft] = useState("");
  const [repoDraft, setRepoDraft] = useState<RepoDraft | null>(null);
  // The ghost row (082 revisited) and where focus lands when the card opens.
  const { open, cardRef, openCard, closeCard } = usePinCardOpen(pins.length);
  const repoAvailable = repoDeps.repo !== "";
  const tab: AddTestTab = chosenTab ?? (repoAvailable ? "repo" : "manual");

  // Per-repo UI state dies with its repo (the panel's sync-during-render
  // idiom): a draft built from repo A must not survive into repo B, where
  // pinning it would file A's descriptor under B's "detected because you
  // loaded this config from…" claim. The search box resets the same way,
  // through the keyed RepoDepsTab inside `RepoTabPanel`.
  useSyncedReset(repoDeps.repo, () => {
    setRepoDraft(null);
  });

  // Discovery fires when (and only while) the repo tab is actually on screen —
  // including again after a NEW load reset the view to idle under an open tab.
  // `onLoadRepoDeps` is idempotent per loaded repo, so this cannot loop.
  const wantRepoDeps = open && tab === "repo" && repoAvailable && repoDeps.status === "idle";
  useEffect(() => {
    if (wantRepoDeps) {
      onLoadRepoDeps();
    }
  }, [wantRepoDeps, onLoadRepoDeps]);

  // The empty state's quick-start chips write into this form — synced during
  // render (the panel idiom), keyed by nonce so re-clicking the chip works.
  useSyncedReset(
    seedNonce,
    () => {
      if (seed) {
        if (Object.keys(seed).length > 0) {
          replaceForm(seed);
        }
        setChosenTab("manual");
        openCard();
      }
    },
    // The owner starts at 0, not at the current nonce: a chip clicked BEFORE
    // this box mounted has already bumped the nonce, and that seed must still
    // be applied on the first render rather than adopted as "already seen".
    () => 0,
  );

  function applyPaste(value: PasteFill) {
    replaceForm(value.fill, {
      updateTypeTouched: value.updateTypeGiven,
      note: pasteImportNote(value),
    });
    setChosenTab("manual");
  }

  const atLimit = pins.length >= MAX_PINS;

  /** The pin itself is the form hook's (the guard, then the EFFECTIVE
   *  updateType baked in); what follows is this panel's alone — the form is
   *  cleared for the next test, and the one-off it may have been pinned from
   *  goes with it, since the card above it now says the same thing.
   *
   *  Called with no descriptor for the form on screen, and with the one-off's
   *  own for the result card below it — which carries the updateType its run
   *  actually used, not whatever the form derives now. */
  function pin(source?: FormState, updateType?: string) {
    if (!pinDescriptor(onAddPin, source, updateType)) {
      return;
    }
    // Pinning from the card is holding it open — the collapse belongs to the
    // × (or a link's arrival), never to one's own first pin.
    openCard();
    replaceForm({});
    clearOneOff();
  }

  /** A repo-tab draft pins DIRECTLY — its fields came from extraction, not the
   *  form, so the form (and whatever the reader had half-typed there) is left
   *  alone. The row's badge flips to "pinned · type" from the pins list. */
  function pinRepoDraft() {
    if (repoDraft === null || atLimit) {
      // At the cap the sink would refuse silently — the draft stays put, and
      // the PinLimitNote under the card says why nothing happened.
      return;
    }
    openCard();
    onAddPin({ ...EMPTY_FORM, ...draftFill(repoDraft) });
    setRepoDraft(null);
  }

  /** "refine any field in Manual →" — the draft's whole descriptor lands in
   *  the form, and the Manual tab shows it. */
  function refineRepoDraft() {
    if (repoDraft === null) {
      return;
    }
    replaceForm(draftFill(repoDraft));
    setRepoDraft(null);
    setChosenTab("manual");
  }

  if (!open) {
    return (
      <div className="pin-add-panel">
        <button type="button" className="pin-add-ghost" onClick={openCard}>
          + Pin a dependency…{" "}
          <span className="pin-add-ghost-hint">it is re-tested against the rules on every run</span>
        </button>
        {footnote}
      </div>
    );
  }

  // Hoisted out of the JSX rather than written inline on `ManualPanel`'s
  // `actions` prop: the tabpanel wrapper below added the level that put this
  // element at depth 4, and lifting the leaf is what the depth ratchet asks
  // for (`TreeRow`'s `nameButton` is the same move).
  const manualActions = (
    <DescriptorActions
      className="pin-new-actions"
      formId={PIN_FORM_ID}
      submitLabel={simulating ? "Simulating…" : "Simulate"}
      submitDisabled={simulating || !result.finalConfig}
      atLimit={atLimit}
      onPin={() => pin()}
    />
  );

  return (
    <div className="pin-add-panel">
      <div className="card pin-add-card" ref={cardRef}>
        <AddTestTabs
          tab={tab}
          onTabChange={setChosenTab}
          repoAvailable={repoAvailable}
          repoSuggested={repoConnect.suggestion !== null}
          closable={pins.length > 0}
          onClose={closeCard}
        />
        {/* No className: it would style nothing (the card is block flow, so
            this wrapper is layout-transparent) and `class-coverage.test.ts`
            is right that an unstyled, unselected class should not exist. What
            the element is for is the three ARIA attributes. */}
        <div role="tabpanel" id={PIN_TAB_PANEL_ID} aria-labelledby={pinTabId(tab)}>
          {tab === "paste" ? (
            <PasteJsonTab text={pasteDraft} onTextChange={setPasteDraft} onFill={applyPaste} />
          ) : null}
          {tab === "repo" ? (
            <RepoTabPanel
              view={repoDeps}
              connect={repoConnect}
              onRetry={onLoadRepoDeps}
              pins={pins}
              atLimit={atLimit}
              draft={repoDraft}
              onDraftChange={setRepoDraft}
              onPinDraft={pinRepoDraft}
              onRefineDraft={refineRepoDraft}
            />
          ) : null}
          {tab === "manual" ? (
            <ManualPanel
              sim={simForm}
              openGroup={openGroup}
              onOpenGroupChange={setOpenGroup}
              onQuickFill={(fill) => replaceForm(fill)}
              onSubmit={() => simulate(form, updateTypeTouched)}
              actions={manualActions}
            />
          ) : null}
        </div>
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
      {/* Mounted empty for the reason `RuleSimulator`'s alert is: a live region
          only announces text that arrives after it exists, and the hook clears
          the error before each await, so a repeat failure mutates this node
          rather than remounting it. */}
      <div role="alert">
        {oneOffError !== null && oneOffError.result === result ? (
          <OneOffErrorNote message={oneOffError.message} />
        ) : null}
      </div>
      {footnote}
    </div>
  );
}
