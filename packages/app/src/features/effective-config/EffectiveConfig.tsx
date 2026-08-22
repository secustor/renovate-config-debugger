import { nf } from "@/lib/format";
import { memo, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Caret } from "@/components/Caret";
import { COLLAPSE_AFTER } from "@/lib/collapse";
import { SegmentedControl, type SegmentedOption } from "@/components/SegmentedControl";
import { ShowAllMore } from "@/components/ShowAllMore";
import { useToggleSet } from "@/hooks/use-toggle-set";
import { openPickerOnEnter } from "@/lib/select-picker";
import {
  deciderHeadline,
  type DeciderGroup,
  type DeciderHeadline,
  type DeciderId,
  groupByDecider,
  presetDeciderName,
  topLevelPresetNames,
  winningStep,
} from "./decider-groups";
import type {
  KeyProvenance,
  ProvenanceStep,
  ResolvedConfigMode,
  ResolvedConfigOutput,
  RuleAttribution,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { Explained, Term } from "@/components/glossary";
import { GLOSSARY } from "@/data/glossary-data";
import {
  effectiveTally,
  type EffectiveTally,
  isOverridden,
  type MultiContribBadge,
} from "@/lib/effective-tally";
import { type RowNote, rowNote } from "./row-notes";
import { OptionKey } from "@/components/option-docs";
import { BlameLedger } from "./BlameLedger";
import { ConfigJson } from "@/components/ConfigJson";
import { CopyButton } from "@/components/CopyButton";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { layerNodeKey } from "@/lib/provenance-layer";
import { useEngineDerivation } from "@/hooks/use-engine-derivation";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import { useDescriptionProvenance } from "@/hooks/description-provenance";
import { buildDescriptionCards, type DescriptionCards } from "@/lib/description-attribution";
import {
  buildDescriptionLedger,
  type DescriptionLedger,
  ledgerMatchesFinalValue,
  ledgerPreviewText,
  ledgerWriterText,
} from "./description-ledger";
// Roadmap 069 hoisted this out of here: the description digest prints the same
// one-line matcher summary, and one spelling of it is enough.
import { resolvedConfigText } from "./resolved-json";
import { summarizeRuleSelectors } from "@/lib/rule-selectors";
import { valuePreview } from "@/lib/value-preview";
import { RuleFramingText } from "@/components/rule-framing";

/**
 * Roadmap 005: the effective config as a provenance view. Every top-level key
 * carries a colour-coded badge for its winning source layer (default / a
 * preset / the repo config) and expands to the full override chain — who set
 * it, who overrode it, and the losing values. Provenance is computed post-hoc
 * from the trace via the engine's `computeProvenance`, loaded through the same
 * dynamic import that keeps the renovate chunk out of the initial bundle.
 */

type Provenance = Map<string, KeyProvenance>;

/** Roadmap 069: the one key whose expanded body is a per-string blame ledger
 *  rather than an override chain — see `BlameLedger`. */
const DESCRIPTION_KEY = "description";

/**
 * Roadmap 075 (iteration 5): the decided-by sections that start closed. Only
 * the defaults group does — it is the "nothing in your run touched them" pile,
 * routinely the largest, and the one a reader opens deliberately. Frozen at
 * module scope so every reset assigns the same set rather than minting one.
 */
const DEFAULT_COLLAPSED: ReadonlySet<DeciderId> = new Set<DeciderId>(["defaults"]);

/**
 * The ledger a row renders with: only the `description` row has one at all
 * (`undefined` everywhere else), and only when it accounts for that row's final
 * value member for member — including the non-string members Renovate merges
 * with a warning, which the ledger carries as authorless rows of their own. A
 * ledger that cannot reproduce the row's final value is not shown: the row
 * keeps the generic preview and chain rather than quietly under-reporting it.
 */
function ledgerForRow(
  entry: KeyProvenance,
  ledger: DescriptionLedger | null,
): DescriptionLedger | null | undefined {
  if (entry.key !== DESCRIPTION_KEY) {
    return undefined;
  }
  return ledger && ledgerMatchesFinalValue(ledger, entry.finalValue) ? ledger : null;
}

/** Loads + computes provenance for a result once the engine chunk is present.
 *  undefined = loading, null = unavailable (e.g. preset resolution failed). */
function useProvenance(result: TraceResult): Provenance | null | undefined {
  return useEngineDerivation([result], (engine) => engine.computeProvenance(result) ?? null);
}

/** Roadmap 051: the card's two renderings — provenance rows / a standalone
 *  JSON document. A MODE, not a filter: the JSON view is a different document
 *  (and a different computation), so it must not sit in the filter bar where
 *  checkboxes promise row-level composition. */
type EffectiveView = "keys" | "json";

/**
 * Roadmap 051: computes the copyable resolved-config document once the JSON
 * view is active. Mirrors `useProvenance` above — `undefined` = inactive or
 * computing, `null` = unavailable (same guards as provenance). Cheap enough to
 * recompute per option change: a handful of `mergeChildConfig` calls, and the
 * engine chunk is already resident by the time this view can be reached.
 */
function useResolvedConfig(
  result: TraceResult,
  active: boolean,
  mode: ResolvedConfigMode,
  includeDefaults: boolean,
): ResolvedConfigOutput | null | undefined {
  return useEngineDerivation(
    [result, active, mode, includeDefaults],
    active
      ? (engine) => engine.computeResolvedConfig(result, mode, { includeDefaults }) ?? null
      : null,
  );
}

const VERBS: Record<ProvenanceStep["action"], string> = {
  set: "sets",
  overwrite: "overwrites with",
  concat: "appends",
  "shallow-merge": "shallow-merges",
  "deep-merge": "deep-merges",
  forced: "forces",
};

const MULTI_BADGE_GLOSSARY: Record<MultiContribBadge, keyof typeof GLOSSARY> = {
  overridden: "keyOverridden",
  appended: "keyAppended",
  merged: "keyMerged",
};

/**
 * One card of the cascade. Roadmap 082 makes every LOSING card's value struck
 * through and muted, whatever the verb: the cards are read as a stack now
 * (winner first), so "this is not the value you got" has to be legible on the
 * card itself rather than inferred from its position. The separate `before`
 * block went with that — the value a layer overwrote is the card BELOW this
 * one, so printing it here rendered the same value twice in one stack.
 */
function Step({
  step,
  winning,
  onSelectPreset,
}: {
  step: ProvenanceStep;
  /** Roadmap 075 (iteration 5): this step's value is the one in the final
   *  config — the chain's whole point, previously left for the reader to work
   *  out from the position of the last box. */
  winning: boolean;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <div className={`prov-step action-${step.action}${winning ? " winning" : ""}`}>
      <div className="prov-step-head">
        <ProvenanceChip layer={step.layer} onSelectPreset={onSelectPreset} />
        {/* The defaults layer does not "set" anything — it is what the key was
            before the run began, which is the design's own verb for it. */}
        <span className="prov-step-verb">
          {step.layer.kind === "defaults" ? "defaults to" : VERBS[step.action]}
        </span>
        {step.expandedNested ? (
          <span
            className="badge nested"
            title="Renovate further expanded nested extends inside this value"
          >
            + nested extends
          </span>
        ) : null}
        {winning ? <span className="pill pill-ok prov-step-final">✓ final</span> : null}
      </div>
      <pre className={`config-view prov-value${winning ? "" : " prov-losing"}`}>
        <ConfigJson value={step.after} />
      </pre>
    </div>
  );
}

/** Roadmap 013: per-entry provenance for `packageRules` — which layer (repo /
 *  global / inherited / preset) contributed each merged rule, reusing the
 *  same chip the effective config's top-level keys already show. */
function PackageRulesProvenance({
  rules,
  attribution,
  onSelectPreset,
}: {
  rules: unknown[];
  attribution: RuleAttribution[];
  onSelectPreset?: (nodeId: string) => void;
}) {
  const byIndex = useMemo(() => new Map(attribution.map((a) => [a.index, a])), [attribution]);
  return (
    <div className="prov-rules">
      <div className="prov-rules-title">
        Per-rule provenance ({rules.length} rule{rules.length === 1 ? "" : "s"})
      </div>
      <ul className="prov-rules-list">
        {rules.map((rule, i) => {
          const attr = byIndex.get(i);
          // Roadmap 041 — index key, deliberately: the index IS the identity
          // here. The row renders `packageRules[i]`, displays it as `#i+1` and
          // looks its provenance up by that index; rules never reorder within a
          // render, and rule content is not unique (two identical rules are
          // legal JSON), so nothing else can key this list.
          return (
            // oxlint-disable-next-line react/no-array-index-key -- see above
            <li key={i}>
              <span className="prov-rule-index">#{i + 1}</span>
              {attr ? (
                <ProvenanceChip layer={attr.layer} onSelectPreset={onSelectPreset} />
              ) : (
                <span className="badge prov-layer">source unknown</span>
              )}
              <span className="prov-rule-preview">{summarizeRuleSelectors(rule)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Roadmap 082 (GAP-13): the 463-row table is DEFERRED behind its own line. It
 * is the answer to a question the reader asks about one rule, not the answer to
 * "what is packageRules" — and rendering it eagerly meant expanding the
 * packageRules row pushed the cascade (the thing every other row shows) a
 * thousand pixels down the page.
 *
 * Local state, so collapsing the row forgets it: the deferral is per reading,
 * not a preference.
 */
function DeferredRuleProvenance({
  rules,
  attribution,
  onSelectPreset,
}: {
  rules: unknown[];
  attribution: RuleAttribution[];
  onSelectPreset?: (nodeId: string) => void;
}) {
  const [shown, setShown] = useState(false);
  if (shown) {
    return (
      <PackageRulesProvenance
        rules={rules}
        attribution={attribution}
        onSelectPreset={onSelectPreset}
      />
    );
  }
  return (
    <p className="prov-rules-defer">
      Per-rule provenance:{" "}
      <button type="button" className="btn-quiet" onClick={() => setShown(true)}>
        {`all ${nf.format(rules.length)} rule${rules.length === 1 ? "" : "s"} with their source preset →`}
      </button>
    </p>
  );
}

/** The key cell of a ledger row: the disclosure caret and the option name,
 *  with its docs hover card intact (`OptionKey` is a plain span, safe inside
 *  the button). Its own component so `KeyRow` keeps its cells one level from
 *  the row, exactly as the simulator's thread ledger does. */
function KeyRowKey({ name, expanded }: { name: string; expanded: boolean }) {
  return (
    <span className="prov-key-name">
      <Caret open={expanded} />
      <OptionKey name={name} flagUnknown />
    </span>
  );
}

/** The value cell: what the merged config ends up with — or, for the two rows
 *  whose value is a list, what that list is made of: how many rules came from
 *  where, or (069) how many description strings and how they start. */
function KeyRowPreview({
  entry,
  rules,
  ruleAttribution,
  ledger,
}: {
  entry: KeyProvenance;
  rules: unknown[] | null;
  ruleAttribution?: RuleAttribution[] | null;
  /** Only meaningful for the `description` row. */
  ledger?: DescriptionLedger | null;
}) {
  if (rules) {
    return (
      <span className="prov-key-preview">
        <RuleFramingText total={rules.length} attribution={ruleAttribution ?? null} />
      </span>
    );
  }
  return (
    <span className="prov-key-preview">
      {ledger ? ledgerPreviewText(ledger) : valuePreview(entry.finalValue)}
    </span>
  );
}

/**
 * The third cell — the design's note (082). It replaced two things: the winning
 * layer's chip, which repeated what the band header above the row already says,
 * and the one-word `overridden`/`appended` badge, which said less than the
 * sentence does. The glossary card the badge carried survives on the notes that
 * name a merge behaviour, so the 016/054 "this explains itself" affordance is
 * not lost with the word.
 */
function KeyRowNote({ note }: { note: RowNote | null }) {
  if (!note) {
    return <span className="prov-row-note" />;
  }
  if (!note.badge) {
    return <span className={`prov-row-note${note.warn ? " warn" : ""}`}>{note.text}</span>;
  }
  return (
    <Explained entry={GLOSSARY[MULTI_BADGE_GLOSSARY[note.badge]]}>
      {(handlers) => (
        <span className="prov-row-note explained" tabIndex={0} {...handlers}>
          {note.text}
        </span>
      )}
    </Explained>
  );
}

/**
 * The expanded row's cascade — WINNER FIRST (082): the design reverses the
 * authored stack so the `✓ final` card leads and the earliest layer (usually
 * the Renovate default) is last, which is the order the question is asked in.
 * No-op steps stay in the stack rather than being filtered out: "the default
 * was false and a preset set it to true" is the answer even when the default
 * changed nothing, and dropping those cards left a two-card cascade claiming to
 * be the whole story.
 *
 * Its own component since 069 gave the `description` row a ledger as well — and
 * the depth ratchet counts the two bodies inside `KeyRow` as one expression.
 */
function KeyRowChain({
  entry,
  rules,
  ruleAttribution,
  onSelectPreset,
}: {
  entry: KeyProvenance;
  rules: unknown[] | null;
  ruleAttribution?: RuleAttribution[] | null;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const winner = winningStep(entry);
  const steps = entry.chain.toReversed();
  return (
    <>
      <div className="prov-chain-title">The cascade, bottom to top</div>
      {/* Each layer contributes at most one step to a key's chain, so the
          layer's NODE identity is a genuine key here (roadmap 041) — and
          the rows are rebuilt per run, so per-run node ids are fine. */}
      {steps.map((step) => (
        <Step
          key={layerNodeKey(step.layer)}
          step={step}
          winning={step === winner}
          onSelectPreset={onSelectPreset}
        />
      ))}
      {rules && rules.length > 0 && ruleAttribution && ruleAttribution.length === rules.length ? (
        <DeferredRuleProvenance
          rules={rules}
          attribution={ruleAttribution}
          onSelectPreset={onSelectPreset}
        />
      ) : null}
    </>
  );
}

function KeyRow({
  entry,
  expanded,
  onToggle,
  onSelectPreset,
  ruleAttribution,
  ledger,
}: {
  entry: KeyProvenance;
  expanded: boolean;
  onToggle: () => void;
  onSelectPreset?: (nodeId: string) => void;
  /** Only meaningful for the `packageRules` row; undefined/unavailable elsewhere. */
  ruleAttribution?: RuleAttribution[] | null;
  /** Roadmap 069: only for the `description` row — null when the attribution
   *  is unavailable, in which case the row renders exactly as it always did. */
  ledger?: DescriptionLedger | null;
}) {
  const rules =
    entry.key === "packageRules" && Array.isArray(entry.finalValue) ? entry.finalValue : null;
  const note = rowNote(entry, ledger ? ledgerWriterText(ledger) : null);
  return (
    <div className={`kv-row prov-row${expanded ? " expanded" : ""}`}>
      <button
        type="button"
        className="kv-row prov-row-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <KeyRowKey name={entry.key} expanded={expanded} />
        <KeyRowPreview
          entry={entry}
          rules={rules}
          ruleAttribution={ruleAttribution}
          ledger={ledger}
        />
        <KeyRowNote note={note} />
      </button>
      {/* 082 (GAP-17): the two bodies are independent. The `description` row
          has both — the per-line ledger says who wrote each sentence, the
          cascade says how the array was assembled — and gating them against
          each other hid the second answer on the one row that needs both. */}
      {expanded ? (
        <div className="prov-detail">
          {ledger ? <BlameLedger ledger={ledger} onSelectPreset={onSelectPreset} /> : null}
          {entry.chain.length > 0 ? (
            <KeyRowChain
              entry={entry}
              rules={rules}
              ruleAttribution={ruleAttribution}
              onSelectPreset={onSelectPreset}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Roadmap 082 (GAP-6): a row of the defaults band. INERT by design — no caret,
 * no expansion, no cascade — because there is nothing to expand: exactly one
 * layer ever touched these keys, and it is the one the band is named after.
 * The caret slot is kept as an empty spacer so the option names still start on
 * the same edge as every other band's.
 *
 * The note column is deliberately empty. The artboard's per-option prose
 * ("when PRs are opened", "schedules use UTC") is mock copy for a mock config;
 * the run knows nothing of the sort, and the honest sentence about ALL of these
 * rows is the band's own footer.
 */
function DefaultRow({ entry }: { entry: KeyProvenance }) {
  return (
    <div className="kv-row prov-row prov-row-default">
      <span className="prov-key-name">
        <Caret empty />
        <OptionKey name={entry.key} flagUnknown />
      </span>
      <code className="prov-key-preview">{valuePreview(entry.finalValue)}</code>
      <span className="prov-row-note" />
    </div>
  );
}

/**
 * Roadmap 082 (GAP-1/GAP-2): ONE toolbar row, in BOTH views — the key filter,
 * the "only overridden" gate, the By key / As JSON switch pushed right, and the
 * copy button. It used to be two rows in two places (the switch and the copy in
 * the card title, the filters in a chrome row that existed only in the By-key
 * view), which made the two halves of one control strip look like controls of
 * two different things.
 *
 * The layer `<select>` and the "show default-only" checkbox are gone with it:
 * neither is in the design, and what the checkbox gated is now the always-there
 * defaults band below.
 */
function EffectiveToolbar({
  filterInputRef,
  query,
  onQueryChange,
  onlyOverridden,
  onOnlyOverriddenChange,
  filtersApply,
  view,
  onViewChange,
  getText,
}: {
  filterInputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  onlyOverridden: boolean;
  onOnlyOverriddenChange: (checked: boolean) => void;
  /** False in the As-JSON view: the filters narrow ROWS, and that document is
   *  copied whole (see the note on `EffectiveView`). */
  filtersApply: boolean;
  view: EffectiveView;
  onViewChange: (view: EffectiveView) => void;
  /** Null while the document is still being derived — same wait as the
   *  As-JSON view's own copy, which this one is a second door to. */
  getText: (() => string) | null;
}) {
  const inertTitle = filtersApply
    ? undefined
    : "Key filters narrow the By key rows — the JSON document is always the whole config";
  return (
    <div className="prov-filters prov-toolbar">
      <input
        ref={filterInputRef}
        type="text"
        className="prov-filter-input"
        placeholder="Filter keys…"
        value={query}
        disabled={!filtersApply}
        title={inertTitle}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <label className="prov-check" title={inertTitle}>
        <input
          type="checkbox"
          checked={onlyOverridden}
          disabled={!filtersApply}
          onChange={(e) => onOnlyOverriddenChange(e.target.checked)}
        />{" "}
        only overridden
      </label>
      <ViewSwitch view={view} onViewChange={onViewChange} />
      {getText ? (
        <CopyButton
          iconOnly
          getText={getText}
          label="Copy effective config as JSON"
          title="Copy effective config as JSON"
        />
      ) : null}
    </div>
  );
}

/** The pill each decided-by section is headed with — the layer's own tone from
 *  the standard pill set, so a section header and the layer chips on its rows
 *  cannot disagree about which hue a level wears. */
const DECIDER_PILL: Record<DeciderId, { tone: string; label: string }> = {
  repo: { tone: "pill-accent", label: "repo config" },
  preset: { tone: "pill-preset", label: "presets" },
  inherited: { tone: "pill-inherited", label: "inherited config" },
  global: { tone: "pill-global", label: "global config" },
  defaults: { tone: "pill-muted", label: "defaults" },
};

/**
 * Roadmap 075 (iteration 5): one decided-by band. A disclosure rather than a
 * plain heading because the defaults band is the one nobody opens by default
 * and it is routinely the largest — and once one band collapses they all must,
 * or the affordance reads as an oddity of that band.
 *
 * `open` is controlled by the view (the description landing has to be able to
 * open the band its row is in), so `summary`'s own toggle is suppressed and the
 * click reported instead — the standard controlled-details idiom.
 */
function DeciderSection({
  id,
  headline,
  open,
  onToggleOpen,
  children,
}: {
  id: DeciderId;
  headline: DeciderHeadline;
  open: boolean;
  onToggleOpen: () => void;
  children: ReactNode;
}) {
  const { tone, label } = DECIDER_PILL[id];
  return (
    <details className={`prov-section prov-section-${id}`} open={open}>
      <summary
        className="prov-section-head"
        onClick={(e) => {
          e.preventDefault();
          onToggleOpen();
        }}
      >
        <Caret open={open} />
        <span className={`pill ${tone}`}>{label}</span>
        <SectionHeadline headline={headline} />
      </summary>
      <div className="kv prov-list">{children}</div>
    </details>
  );
}

/** The header sentence in the design's three emphases: lead in the header's
 *  ink and weight, count in the band's hue, trailing clause muted and regular.
 *  The leading spaces live in the spans so the textContent stays the sentence. */
function SectionHeadline({ headline }: { headline: DeciderHeadline }) {
  return (
    <span className="prov-section-headline">
      {headline.lead}
      {headline.count === null ? null : (
        <span className="prov-headline-count"> {headline.count}</span>
      )}
      {headline.note === null ? null : <span className="prov-headline-note"> {headline.note}</span>}
    </span>
  );
}

/** The defaults band's footer (082 GAP-5): its truncation line, plus the one
 *  honest sentence about every row above it — which is also why those rows
 *  carry no note of their own. */
function DefaultsFooter({ hidden, onShowAll }: { hidden: number; onShowAll: () => void }) {
  return (
    <p className="prov-band-more">
      <ShowAllMore hidden={hidden} noun="default" onShowAll={onShowAll} />
      <span className="prov-band-note">
        {/* The leading space is load-bearing: JSX drops the newline between the
            button and this span, so the separator carries its own gap. */}
        {hidden > 0 ? " · " : ""}hover any key for Renovate’s docs; no cascade to show — only the
        default ever touched these
      </span>
    </p>
  );
}

const VIEW_OPTIONS: readonly SegmentedOption<EffectiveView>[] = [
  { value: "keys", label: "By key" },
  { value: "json", label: "As JSON" },
];

/** Roadmap 051: the view switch. Segmented, like the diff's unified/side-by-side
 *  control and for the same 036 reason — it labels the STATE, not an action, so
 *  the active rendering is always legible. Roadmap 082 moves it out of the card
 *  title into the one toolbar row, pushed right, where the design has it. */
function ViewSwitch({
  view,
  onViewChange,
}: {
  view: EffectiveView;
  onViewChange: (view: EffectiveView) => void;
}) {
  return (
    <SegmentedControl
      className="prov-toolbar-switch"
      label="Effective config view"
      value={view}
      options={VIEW_OPTIONS}
      onChange={onViewChange}
    />
  );
}

/** The JSON view's options row — the same chrome-row grammar as ProvFilters,
 *  its own component for the same depth-ratchet reason. */
function ResolvedOptionsRow({
  expand,
  onExpandChange,
  includeDefaults,
  onIncludeDefaultsChange,
  defaultsCount,
  getText,
}: {
  expand: ResolvedConfigMode;
  onExpandChange: (mode: ResolvedConfigMode) => void;
  includeDefaults: boolean;
  onIncludeDefaultsChange: (checked: boolean) => void;
  defaultsCount: number;
  /** Null while the document is still computing — the copy button waits. */
  getText: (() => string) | null;
}) {
  return (
    <div className="prov-filters">
      <label className="resolved-label" htmlFor="resolved-expand">
        Expand presets:
      </label>
      <select
        id="resolved-expand"
        onKeyDown={openPickerOnEnter}
        value={expand}
        onChange={(e) => onExpandChange(e.target.value as ResolvedConfigMode)}
      >
        <option value="keep-internal">keep internal presets</option>
        <option value="full">fully</option>
      </select>
      <label
        className="prov-check"
        title={
          expand === "keep-internal"
            ? "Defaults apply to the fully expanded document only — written into a config that still extends presets, they would override those presets"
            : "Also write out every option Renovate defaults — the fully hydrated document"
        }
      >
        <input
          type="checkbox"
          checked={includeDefaults}
          disabled={expand === "keep-internal"}
          onChange={(e) => onIncludeDefaultsChange(e.target.checked)}
        />{" "}
        include defaults ({defaultsCount})
      </label>
      {getText ? (
        <CopyButton
          className="resolved-copy"
          getText={getText}
          label="Copy resolved config"
          title="Copy this document as JSON — ready to paste into a renovate.json"
        />
      ) : null}
    </div>
  );
}

/**
 * Roadmap 051: the resolved config as a standalone document — hosted presets
 * inlined, internal presets kept as `extends` references (or everything
 * expanded). The counterpart artifact to the Rewrites tab's "Copy migrated
 * config", which owns the pre-resolution document.
 */
function ResolvedJsonView({
  output,
  expand,
  onExpandChange,
  includeDefaults,
  onIncludeDefaultsChange,
  defaultsCount,
  descriptions,
  onSelectPreset,
}: {
  output: ResolvedConfigOutput | null | undefined;
  expand: ResolvedConfigMode;
  onExpandChange: (mode: ResolvedConfigMode) => void;
  includeDefaults: boolean;
  onIncludeDefaultsChange: (checked: boolean) => void;
  defaultsCount: number;
  /** Roadmap 069 (PR 5): per-string `description` attribution, attached to the
   *  document's own strings when this document IS the array it indexes — which
   *  `ConfigJson` decides, since only the emitted document can answer that. */
  descriptions?: DescriptionCards | null;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <>
      <ResolvedOptionsRow
        expand={expand}
        onExpandChange={onExpandChange}
        includeDefaults={includeDefaults}
        onIncludeDefaultsChange={onIncludeDefaultsChange}
        defaultsCount={defaultsCount}
        getText={output ? () => resolvedConfigText(output) : null}
      />
      {output === undefined ? <p className="empty-note">Computing…</p> : null}
      {output === null ? (
        <p className="empty-note">
          This document needs a completed preset resolution — see the Problems tab.
        </p>
      ) : null}
      {output ? (
        <pre className="config-view">
          <ConfigJson
            value={output.config}
            descriptions={descriptions}
            onSelectPreset={onSelectPreset}
          />
        </pre>
      ) : null}
      {output && output.divergingKeys.length > 0 ? (
        <p className="resolved-caveat">
          Merge-order caveat: <code>{output.divergingKeys.join(", ")}</code> would resolve
          differently from this document — a kept internal preset written after an inlined preset
          now merges first. Switch “Expand presets” to “fully” for an exact document.
        </p>
      ) : null}
      <p className="empty-note">
        Need the config <em>before</em> preset resolution? The Rewrites tab’s “Copy migrated config”
        has it — syntax modernised, extends untouched.
      </p>
    </>
  );
}

/** What every band needs to render its rows — one object rather than eight
 *  props threaded through two components. */
interface BandRowContext {
  expanded: ReadonlySet<string>;
  onToggleRow: (key: string) => void;
  onSelectPreset?: (nodeId: string) => void;
  ruleAttribution: RuleAttribution[] | null | undefined;
  ledger: DescriptionLedger | null;
}

/** The defaults band: inert rows, its own footer, and (082 GAP-4) always here —
 *  collapsed, but never filtered away behind a checkbox. */
function DefaultsBand({
  entries,
  open,
  onToggleOpen,
  showAll,
  onShowAll,
}: {
  entries: KeyProvenance[];
  open: boolean;
  onToggleOpen: () => void;
  showAll: boolean;
  onShowAll: () => void;
}) {
  const shown = showAll ? entries : entries.slice(0, COLLAPSE_AFTER);
  return (
    <DeciderSection
      id="defaults"
      headline={deciderHeadline("defaults", entries.length)}
      open={open}
      onToggleOpen={onToggleOpen}
    >
      {shown.map((entry) => (
        <DefaultRow key={entry.key} entry={entry} />
      ))}
      <DefaultsFooter hidden={entries.length - shown.length} onShowAll={onShowAll} />
    </DeciderSection>
  );
}

/** …and every other band: expandable rows, cascade and all. */
function KeyBand({
  id,
  headline,
  entries,
  open,
  onToggleOpen,
  showAll,
  onShowAll,
  rows,
}: {
  id: DeciderId;
  headline: DeciderHeadline;
  entries: KeyProvenance[];
  open: boolean;
  onToggleOpen: () => void;
  showAll: boolean;
  onShowAll: () => void;
  rows: BandRowContext;
}) {
  const shown = showAll ? entries : entries.slice(0, COLLAPSE_AFTER);
  const hidden = entries.length - shown.length;
  return (
    <DeciderSection id={id} headline={headline} open={open} onToggleOpen={onToggleOpen}>
      {shown.map((entry) => (
        <KeyRow
          key={entry.key}
          entry={entry}
          ruleAttribution={entry.key === "packageRules" ? rows.ruleAttribution : undefined}
          ledger={ledgerForRow(entry, rows.ledger)}
          expanded={rows.expanded.has(entry.key)}
          onToggle={() => rows.onToggleRow(entry.key)}
          onSelectPreset={rows.onSelectPreset}
        />
      ))}
      {hidden > 0 ? (
        <p className="prov-band-more">
          <ShowAllMore hidden={hidden} onShowAll={onShowAll} />
        </p>
      ) : null}
    </DeciderSection>
  );
}

/** The By-key view's body: one band per deciding layer, the defaults one built
 *  differently because its rows are inert (082 GAP-4/GAP-6). */
function EffectiveBands({
  sections,
  presetName,
  collapsed,
  onToggleSection,
  shownAll,
  onShowAll,
  rows,
}: {
  sections: DeciderGroup[];
  presetName: string | null;
  collapsed: ReadonlySet<DeciderId>;
  onToggleSection: (id: DeciderId) => void;
  shownAll: ReadonlySet<DeciderId>;
  onShowAll: (id: DeciderId) => void;
  rows: BandRowContext;
}) {
  return (
    <>
      {sections.length === 0 ? <p className="empty-note">No keys match.</p> : null}
      {sections.map((section) =>
        section.id === "defaults" ? (
          <DefaultsBand
            key={section.id}
            entries={section.entries}
            open={!collapsed.has(section.id)}
            onToggleOpen={() => onToggleSection(section.id)}
            showAll={shownAll.has(section.id)}
            onShowAll={() => onShowAll(section.id)}
          />
        ) : (
          <KeyBand
            key={section.id}
            id={section.id}
            headline={deciderHeadline(section.id, section.entries.length, presetName)}
            entries={section.entries}
            open={!collapsed.has(section.id)}
            onToggleOpen={() => onToggleSection(section.id)}
            showAll={shownAll.has(section.id)}
            onShowAll={() => onShowAll(section.id)}
            rows={rows}
          />
        ),
      )}
    </>
  );
}

// Roadmap 032: memoized — this view renders ~100 provenance rows and reads
// nothing that changes while the user types in the editor, so a keystroke
// must not re-render it. All props are identity-stable in App (the callbacks
// via useCallback/latest-ref, the rest primitives or per-run objects).
export const EffectiveConfig = memo(function EffectiveConfig({
  result,
  onSelectPreset,
  onStats,
  focusDescriptionNonce,
}: {
  result: TraceResult;
  onSelectPreset?: (nodeId: string) => void;
  /** Roadmap 028/029: reports this view's own numbers (`EffectiveTally`,
   *  derived in `lib/effective-tally.ts` so the CLI's `digest` quotes the same
   *  function) whenever they change, so the shell never has to recompute
   *  provenance itself — the tab badge and the digest quote what these rows
   *  show. */
  onStats?: (stats: EffectiveTally) => void;
  /** Roadmap 069: bumped by the description digest card's "show raw order"
   *  link (and by the preset tree's position markers, which are the same jump
   *  from the other end) — landing on the `description` row: filter prefilled,
   *  row expanded, ledger on screen. */
  focusDescriptionNonce?: number;
}) {
  const provenance = useProvenance(result);
  const ruleAttribution = useRuleProvenance(result);
  // Roadmap 069: the per-string `description` attribution. Cached per result by
  // the hook, so this tab's digest card and this row share one walk.
  const descriptionProvenance = useDescriptionProvenance(result);
  const ledger = useMemo(
    () => (descriptionProvenance ? buildDescriptionLedger(descriptionProvenance) : null),
    [descriptionProvenance],
  );
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const expandedRows = useToggleSet();
  // Roadmap 075 (iteration 5): which decided-by sections are folded shut.
  const collapsedSections = useToggleSet<DeciderId>(DEFAULT_COLLAPSED);
  // Roadmap 082 (GAP-7): the bands whose row cap the reader has lifted.
  const shownAllBands = useToggleSet<DeciderId>();
  // Destructured so `exhaustive-deps` can see what the effects below depend on:
  // the hook's callbacks are identity-stable, but the rule reads the object.
  const { reset: resetExpandedRows } = expandedRows;
  const { reset: resetCollapsedSections } = collapsedSections;
  // Roadmap 051: the As-JSON rendering and its output options
  const [view, setView] = useState<EffectiveView>("keys");
  const [expand, setExpand] = useState<ResolvedConfigMode>("keep-internal");
  const [includeDefaults, setIncludeDefaults] = useState(false);
  // Roadmap 069 (PR 5): the same walk again, read the other way round — one
  // card per string for the As-JSON document, where the sentences are already
  // on screen and the attribution has nowhere else to live. Gated on the view
  // like `resolvedOutput` below: derived only once the reader opens As-JSON.
  const descriptionCards = useMemo(
    () =>
      descriptionProvenance && view === "json"
        ? buildDescriptionCards(descriptionProvenance, result.presetTree)
        : null,
    [descriptionProvenance, result.presetTree, view],
  );
  // Roadmap 082: derived for BOTH views, not only As-JSON. The toolbar's copy
  // button is on screen in the By-key view too and must hand over the same
  // document — and `navigator.clipboard.writeText` has to be called in the
  // click's own task (Safari drops a write issued after an await), so the
  // document cannot be computed on demand. The cost is one extra
  // `computeResolvedConfig` per RUN — a handful of `mergeChildConfig` calls,
  // off the critical path in an effect, and not per keystroke: `expand` and
  // `includeDefaults` can only be changed from the JSON view.
  const resolvedOutput = useResolvedConfig(
    result,
    provenance !== undefined,
    expand,
    expand === "full" && includeDefaults,
  );

  // node ids and keys are per-run, so drop any stale expansion/filter state.
  // DURING RENDER, not in an effect (the `useDescriptionProvenance` idiom):
  // effects flush after the commit, so a click landing in the gap between the
  // commit that delivered this provenance and its passive flush would enqueue
  // its expansion first and then be wiped by the reset — a user's first click
  // silently undone, and the flake CI caught as "the expanded description row
  // rendered no ledger".
  const [resetOwner, setResetOwner] = useState(provenance);
  if (resetOwner !== provenance) {
    setResetOwner(provenance);
    resetExpandedRows();
    resetCollapsedSections(DEFAULT_COLLAPSED);
    shownAllBands.reset();
    setQuery("");
    setOnlyOverridden(false);
    setView("keys");
    setExpand("keep-internal");
    setIncludeDefaults(false);
  }

  const entries = useMemo(() => (provenance ? [...provenance.values()] : []), [provenance]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (q && !entry.key.toLowerCase().includes(q)) {
        return false;
      }
      if (onlyOverridden && !isOverridden(entry)) {
        return false;
      }
      return true;
    });
  }, [entries, query, onlyOverridden]);

  /**
   * Roadmap 075 (iteration 5): the rows, cut by WHO DECIDED each key's final
   * value (`features/effective-config/decider-groups.ts` reads that off the
   * chain the engine already built — nothing is recomputed here).
   *
   * Roadmap 082: the default-only rows are in here now. They used to be
   * filtered out of the view entirely until a checkbox asked for them, which
   * meant the tab's headline count and the config Renovate actually runs were
   * two different documents; they are the defaults band, folded shut.
   */
  const sections = useMemo(() => groupByDecider(filtered), [filtered]);

  /** Roadmap 082 (GAP-3): the band is named after the reader's own `extends`. */
  const presetName = useMemo(
    () => presetDeciderName(topLevelPresetNames(result.presetTree)),
    [result.presetTree],
  );

  // Roadmap 032: the view's headline numbers — decided keys, default-only
  // rows (the folded defaults band), really-overridden rows — in ONE pass
  // over the entries (they were
  // three separate filter passes: the stats effect made two and the render
  // counted the defaults again). `filtered` above stays its own memo since it
  // additionally depends on the interactive filters.
  const tallies = useMemo(() => effectiveTally(entries), [entries]);

  useEffect(() => {
    // Replay-02 N3: while provenance is still loading (`undefined`), `entries`
    // is empty and the tallies are an honest-looking zero — reporting them
    // overwrote App's pending `null` and painted "0 effective options" next
    // to a green verdict on first paint. Stay silent until real numbers
    // exist; the digest keeps its "still being counted…" clause meanwhile.
    if (provenance === undefined) {
      return;
    }
    onStats?.(tallies);
  }, [tallies, onStats, provenance]);

  // Roadmap 069: the description card's "show raw order" link lands on the blame
  // ledger — the row is one of ~90, so arriving at the tab is not arriving at
  // the answer. Filter, expand, no focus steal: the reader is here to read.
  // …which means clearing the OTHER filter too, not just setting the query:
  // "only overridden" left over from earlier reading would hide the very row the
  // link promised, and the reader would land on "No keys match".
  // …and, since 075, re-opening the decided-by bands for the same reason: a
  // reader who folded the presets band shut earlier would otherwise land on a
  // collapsed band instead of the ledger the link promised. The defaults band
  // stays shut — `description` has no Renovate default, so it can never be the
  // band this row is in.
  useEffect(() => {
    if (focusDescriptionNonce) {
      setView("keys");
      setQuery(DESCRIPTION_KEY);
      setOnlyOverridden(false);
      resetExpandedRows(new Set([DESCRIPTION_KEY]));
      resetCollapsedSections(DEFAULT_COLLAPSED);
    }
  }, [focusDescriptionNonce, resetExpandedRows, resetCollapsedSections]);

  if (!result.finalConfig) {
    return null;
  }

  // Fallback: provenance needs a completed preset resolution. When it is
  // unavailable, still show the effective config as plain JSON.
  if (provenance === null) {
    return (
      <div className="card">
        <div className="card-title">
          <Term id="effectiveConfig">Effective config</Term>
        </div>
        <p className="empty-note">
          Per-key provenance is unavailable because preset resolution did not complete. Showing the
          effective config Renovate produced from the defaults.
        </p>
        <pre className="config-view">
          <ConfigJson value={result.finalConfig} />
        </pre>
      </div>
    );
  }

  const rowContext: BandRowContext = {
    expanded: expandedRows.set,
    onToggleRow: expandedRows.toggle,
    onSelectPreset,
    ruleAttribution,
    ledger,
  };

  return (
    <div className="card">
      <div className="card-title effective-card-title">
        <Term id="effectiveConfig">Effective config</Term>
        <span className="card-title-hint">
          {view === "json"
            ? " — the resolved config as a document"
            : " — grouped by the layer that decided each option"}
        </span>
      </div>
      {provenance === undefined ? <p className="empty-note">Computing provenance…</p> : null}
      {provenance !== undefined ? (
        <EffectiveToolbar
          filterInputRef={filterInputRef}
          query={query}
          onQueryChange={setQuery}
          onlyOverridden={onlyOverridden}
          onOnlyOverriddenChange={setOnlyOverridden}
          filtersApply={view === "keys"}
          view={view}
          onViewChange={setView}
          getText={resolvedOutput ? () => resolvedConfigText(resolvedOutput) : null}
        />
      ) : null}
      {provenance !== undefined && view === "json" ? (
        <ResolvedJsonView
          output={resolvedOutput}
          expand={expand}
          onExpandChange={setExpand}
          includeDefaults={includeDefaults}
          onIncludeDefaultsChange={setIncludeDefaults}
          defaultsCount={tallies.hiddenDefaults}
          descriptions={descriptionCards}
          onSelectPreset={onSelectPreset}
        />
      ) : null}
      {provenance !== undefined && view === "keys" ? (
        <EffectiveBands
          sections={sections}
          presetName={presetName}
          collapsed={collapsedSections.set}
          onToggleSection={collapsedSections.toggle}
          shownAll={shownAllBands.set}
          onShowAll={shownAllBands.add}
          rows={rowContext}
        />
      ) : null}
    </div>
  );
});
