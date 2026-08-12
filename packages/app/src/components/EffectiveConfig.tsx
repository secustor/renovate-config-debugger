import { memo, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { openPickerOnEnter } from "@/lib/select-picker";
import type {
  KeyProvenance,
  ProvenanceStep,
  ResolvedConfigMode,
  ResolvedConfigOutput,
  RuleAttribution,
  TraceResult,
} from "@renovate-config-debugger/engine";
import { Explained, Term } from "./glossary";
import { GLOSSARY } from "@/data/glossary-data";
import {
  effectiveTally,
  type EffectiveTally,
  isOverridden,
  type MultiContribBadge,
  multiContribBadgeKind,
} from "@/lib/effective-tally";
import { OptionKey } from "./option-docs";
import { BlameLedger } from "./BlameLedger";
import { ConfigJson } from "./ConfigJson";
import { CopyButton } from "./CopyButton";
import { ProvenanceChip } from "./ProvenanceChip";
import { layerId, layerLabel, type LayerId, layerNodeKey } from "./provenance-layer";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import { useDescriptionProvenance } from "@/hooks/description-provenance";
import { buildDescriptionCards, type DescriptionCards } from "@/lib/description-attribution";
import {
  buildDescriptionLedger,
  type DescriptionLedger,
  ledgerMatchesFinalValue,
  ledgerPreviewText,
  ledgerWriterText,
} from "@/lib/description-ledger";
// Roadmap 069 hoisted this out of here: the description digest prints the same
// one-line matcher summary, and one spelling of it is enough.
import { summarizeRuleSelectors } from "@/lib/rule-selectors";
import { truncate } from "@/lib/truncate";
import { RuleFramingText } from "./rule-framing";

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

// `LayerId` IS `string`, so `| "all"` is formally redundant — it stays as
// documentation that "all" is the sentinel this filter uses for "no layer
// selected", which every read of a `LayerFilterValue` relies on. Named here
// (rather than inlined at each use) so the one disable comment covers both
// the state and the filter bar's props.
// oxlint-disable-next-line typescript/no-redundant-type-constituents
type LayerFilterValue = LayerId | "all";

/** Loads + computes provenance for a result once the engine chunk is present. */
function useProvenance(result: TraceResult): Provenance | null | undefined {
  // undefined = loading, null = unavailable (e.g. preset resolution failed)
  const [state, setState] = useState<Provenance | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setState(undefined);
    void (async () => {
      const engine = await import("@renovate-config-debugger/engine");
      if (live) {
        setState(engine.computeProvenance(result) ?? null);
      }
    })();
    return () => {
      live = false;
    };
  }, [result]);
  return state;
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
  const [state, setState] = useState<ResolvedConfigOutput | null | undefined>(undefined);
  useEffect(() => {
    if (!active) {
      return;
    }
    let live = true;
    setState(undefined);
    void (async () => {
      const engine = await import("@renovate-config-debugger/engine");
      if (live) {
        setState(engine.computeResolvedConfig(result, mode, { includeDefaults }) ?? null);
      }
    })();
    return () => {
      live = false;
    };
  }, [result, active, mode, includeDefaults]);
  return state;
}

const VERBS: Record<ProvenanceStep["action"], string> = {
  set: "sets",
  overwrite: "overwrites with",
  concat: "appends",
  "shallow-merge": "shallow-merges",
  "deep-merge": "deep-merges",
  forced: "forces",
};

/** The step whose value survives into the final config (skips no-op steps).
 *  `undefined` only for an empty chain, which the provenance builder never
 *  produces — a key exists in this view because some layer set it. */
function winningStep(entry: KeyProvenance): ProvenanceStep | undefined {
  return entry.chain.findLast((s) => !s.noop) ?? entry.chain.at(-1);
}

/** Non-no-op layers that contributed to a key, for the layer filter. */
function contributingLayerIds(entry: KeyProvenance): Set<LayerId> {
  const ids = new Set<LayerId>();
  for (const step of entry.chain) {
    if (!step.noop) {
      ids.add(layerId(step.layer));
    }
  }
  return ids;
}

const MULTI_BADGE_GLOSSARY: Record<MultiContribBadge, keyof typeof GLOSSARY> = {
  overridden: "keyOverridden",
  appended: "keyAppended",
  merged: "keyMerged",
};

/** The badge shown on a row touched by more than one layer — `overridden`
 *  only when a value was actually replaced; `appended`/`merged` otherwise. */
function MultiContribBadgeChip({ entry }: { entry: KeyProvenance }) {
  if (!isOverridden(entry)) {
    return null;
  }
  const kind = multiContribBadgeKind(entry);
  return (
    <Explained entry={GLOSSARY[MULTI_BADGE_GLOSSARY[kind]]}>
      {(handlers) => (
        <span className={`badge explained prov-${kind}`} tabIndex={0} {...handlers}>
          {kind}
        </span>
      )}
    </Explained>
  );
}

/**
 * Roadmap 028/029: the numbers this view owns, reported to the shell so the
 * Effective config tab badge and the Overview digest quote exactly what the
 * rows here show. Roadmap 058 hoisted the derivation itself into
 * `lib/effective-tally.ts` so the CLI's `digest` quotes the same function
 * rather than a copy of it; the name the shell knows it by stays.
 */
export type EffectiveStats = EffectiveTally;

function preview(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return value.length ? `[ ${value.length} item${value.length === 1 ? "" : "s"} ]` : "[]";
  }
  if (typeof value === "object") {
    const n = Object.keys(value).length;
    return n ? `{ ${n} key${n === 1 ? "" : "s"} }` : "{}";
  }
  return truncate(JSON.stringify(value) ?? String(value), 80);
}

function Step({
  step,
  onSelectPreset,
}: {
  step: ProvenanceStep;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const showBefore =
    (step.action === "overwrite" || step.action === "forced") && step.before !== undefined;
  return (
    <div className={`prov-step action-${step.action}`}>
      <div className="prov-step-head">
        <ProvenanceChip layer={step.layer} onSelectPreset={onSelectPreset} />
        <span className="prov-step-verb">{VERBS[step.action]}</span>
        {step.expandedNested ? (
          <span
            className="badge nested"
            title="Renovate further expanded nested extends inside this value"
          >
            + nested extends
          </span>
        ) : null}
      </div>
      {showBefore ? (
        <pre className="config-view prov-value prov-before">
          <ConfigJson value={step.before} />
        </pre>
      ) : null}
      <pre className="config-view prov-value">
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

/** The "Final value" block of an expanded row — its own component since the
 *  nested `<pre><ConfigJson /></pre>` puts it one level past the depth
 *  ratchet when left inline in `KeyRow`. */
function FinalValueBlock({ value }: { value: unknown }) {
  return (
    <div className="prov-final">
      <div className="prov-final-title">Final value</div>
      <pre className="config-view prov-value">
        <ConfigJson value={value} />
      </pre>
    </div>
  );
}

/** The key cell of a ledger row: the disclosure caret and the option name,
 *  with its docs hover card intact (`OptionKey` is a plain span, safe inside
 *  the button). Its own component so `KeyRow` keeps its cells one level from
 *  the row, exactly as the simulator's thread ledger does. */
function KeyRowKey({ name, expanded }: { name: string; expanded: boolean }) {
  return (
    <span className="prov-key-name">
      <span className="caret">{expanded ? "▾" : "▸"}</span>
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
      {ledger ? ledgerPreviewText(ledger) : preview(entry.finalValue)}
    </span>
  );
}

/** The origin cell — the multi-contributor badge (an `explained` chip since
 *  054 layer 6) and the winning layer's chip, as ONE cell so the ledger's
 *  third column holds on rows that carry neither. */
function KeyRowOrigin({
  entry,
  winner,
  onSelectPreset,
  ledger,
}: {
  entry: KeyProvenance;
  winner?: ProvenanceStep;
  onSelectPreset?: (nodeId: string) => void;
  /** 069: the `description` row's own count of contributors, which the layer
   *  chips cannot express — for a concatenated array the "winning" layer is
   *  just the last of twenty-odd presets that each wrote a line, not the one
   *  that decided the value. */
  ledger?: DescriptionLedger | null;
}) {
  const writers = ledger ? ledgerWriterText(ledger) : null;
  return (
    <span className="prov-row-origin">
      <MultiContribBadgeChip entry={entry} />
      {writers ? (
        <span
          className="badge prov-layer prov-preset"
          title="Presets that wrote at least one of these sentences — expand the row for the per-line ledger"
        >
          {writers}
        </span>
      ) : null}
      {winner ? <ProvenanceChip layer={winner.layer} onSelectPreset={onSelectPreset} /> : null}
    </span>
  );
}

/** The expanded row's default body: the final value, the per-rule table on the
 *  one row that has one, and the override chain. Its own component since 069
 *  gave the `description` row a different body — and the depth ratchet counts
 *  the two alternatives inside `KeyRow` as one expression. */
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
  const visibleSteps = entry.chain.filter((s) => !s.noop);
  return (
    <>
      <FinalValueBlock value={entry.finalValue} />
      {rules && rules.length > 0 && ruleAttribution && ruleAttribution.length === rules.length ? (
        <PackageRulesProvenance
          rules={rules}
          attribution={ruleAttribution}
          onSelectPreset={onSelectPreset}
        />
      ) : null}
      <div className="prov-chain-title">
        Override chain ({visibleSteps.length} step{visibleSteps.length === 1 ? "" : "s"})
      </div>
      {/* Each layer contributes at most one step to a key's chain, so the
          layer's NODE identity is a genuine key here (roadmap 041) — and
          the rows are rebuilt per run, so per-run node ids are fine. */}
      {visibleSteps.map((step) => (
        <Step key={layerNodeKey(step.layer)} step={step} onSelectPreset={onSelectPreset} />
      ))}
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
  const winner = winningStep(entry);
  const rules =
    entry.key === "packageRules" && Array.isArray(entry.finalValue) ? entry.finalValue : null;
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
        <KeyRowOrigin
          entry={entry}
          winner={winner}
          onSelectPreset={onSelectPreset}
          ledger={ledger}
        />
      </button>
      {expanded ? (
        <div className="prov-detail">
          {ledger ? (
            <BlameLedger ledger={ledger} onSelectPreset={onSelectPreset} />
          ) : (
            <KeyRowChain
              entry={entry}
              rules={rules}
              ruleAttribution={ruleAttribution}
              onSelectPreset={onSelectPreset}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

/** The filter bar above the key list — its own component since the
 *  `select > option` and `label > input` pairs each put the bar one level
 *  past the depth ratchet when left inline. */
function ProvFilters({
  filterInputRef,
  query,
  onQueryChange,
  layerFilter,
  onLayerFilterChange,
  layerOptions,
  onlyOverridden,
  onOnlyOverriddenChange,
  showDefaults,
  onShowDefaultsChange,
  hiddenDefaults,
}: {
  filterInputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  layerFilter: LayerFilterValue;
  onLayerFilterChange: (value: string) => void;
  layerOptions: [LayerId, string][];
  onlyOverridden: boolean;
  onOnlyOverriddenChange: (checked: boolean) => void;
  showDefaults: boolean;
  onShowDefaultsChange: (checked: boolean) => void;
  hiddenDefaults: number;
}) {
  return (
    <div className="prov-filters">
      <input
        ref={filterInputRef}
        type="text"
        className="prov-filter-input"
        placeholder="Filter keys…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <select
        aria-label="Filter keys by layer"
        onKeyDown={openPickerOnEnter}
        value={layerFilter}
        onChange={(e) => onLayerFilterChange(e.target.value)}
      >
        <option value="all">All layers</option>
        {layerOptions.map(([id, label]) => (
          <option key={id} value={id}>
            only set by {label}
          </option>
        ))}
      </select>
      <label className="prov-check">
        <input
          type="checkbox"
          checked={onlyOverridden}
          onChange={(e) => onOnlyOverriddenChange(e.target.checked)}
        />{" "}
        only overridden
      </label>
      <label className="prov-check">
        <input
          type="checkbox"
          checked={showDefaults}
          onChange={(e) => onShowDefaultsChange(e.target.checked)}
        />{" "}
        show default-only ({hiddenDefaults})
      </label>
    </div>
  );
}

/** Roadmap 051: the card-title view switch. Segmented, like the diff's
 *  unified/side-by-side control and for the same 036 reason — it labels the
 *  STATE, not an action, so the active rendering is always legible. */
function ViewSwitch({
  view,
  onViewChange,
}: {
  view: EffectiveView;
  onViewChange: (view: EffectiveView) => void;
}) {
  return (
    <span className="card-title-actions">
      <span className="seg" role="radiogroup" aria-label="Effective config view">
        <button
          type="button"
          role="radio"
          aria-checked={view === "keys"}
          className={view === "keys" ? "active" : undefined}
          onClick={() => onViewChange("keys")}
        >
          By key
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={view === "json"}
          className={view === "json" ? "active" : undefined}
          onClick={() => onViewChange("json")}
        >
          As JSON
        </button>
      </span>
    </span>
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
        getText={output ? () => `${JSON.stringify(output.config, null, 2)}\n` : null}
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

// Roadmap 032: memoized — this view renders ~100 provenance rows and reads
// nothing that changes while the user types in the editor, so a keystroke
// must not re-render it. All props are identity-stable in App (the callbacks
// via useCallback/latest-ref, the rest primitives or per-run objects).
export const EffectiveConfig = memo(function EffectiveConfig({
  result,
  onSelectPreset,
  onStats,
  focusFilterNonce,
  focusDescriptionNonce,
}: {
  result: TraceResult;
  onSelectPreset?: (nodeId: string) => void;
  /** Roadmap 028/029: reports this view's own numbers (see `EffectiveStats`)
   *  whenever they change, so the shell never has to recompute provenance
   *  itself — the tab badge and the digest quote what these rows show. */
  onStats?: (stats: EffectiveStats) => void;
  /** Roadmap 028: bumped by the Overview's "Where did a setting come from?"
   *  pill to focus the filter input after switching to this tab. */
  focusFilterNonce?: number;
  /** Roadmap 069: bumped by the Overview digest card's "show raw order" link —
   *  the same nonce idiom, landing on the `description` row instead of the
   *  filter box: filter prefilled, row expanded, ledger on screen. */
  focusDescriptionNonce?: number;
}) {
  const provenance = useProvenance(result);
  const ruleAttribution = useRuleProvenance(result);
  // Roadmap 069: the per-string `description` attribution. Cached per result by
  // the hook, so the Overview's digest card and this row share one walk.
  const descriptionProvenance = useDescriptionProvenance(result);
  const ledger = useMemo(
    () => (descriptionProvenance ? buildDescriptionLedger(descriptionProvenance) : null),
    [descriptionProvenance],
  );
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [layerFilter, setLayerFilter] = useState<LayerFilterValue>("all");
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
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
  const resolvedOutput = useResolvedConfig(
    result,
    provenance !== undefined && view === "json",
    expand,
    expand === "full" && includeDefaults,
  );

  // node ids and keys are per-run, so drop any stale expansion/filter state
  useEffect(() => {
    setExpanded(new Set());
    setQuery("");
    setLayerFilter("all");
    setOnlyOverridden(false);
    setShowDefaults(false);
    setView("keys");
    setExpand("keep-internal");
    setIncludeDefaults(false);
  }, [provenance]);

  const entries = useMemo(() => (provenance ? [...provenance.values()] : []), [provenance]);

  // dropdown options: every layer that non-trivially contributed to some key
  const layerOptions = useMemo(() => {
    const seen = new Map<LayerId, string>();
    for (const entry of entries) {
      for (const step of entry.chain) {
        if (!step.noop) {
          seen.set(layerId(step.layer), layerLabel(step.layer));
        }
      }
    }
    return [...seen.entries()];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!showDefaults && entry.isDefaultOnly) {
        return false;
      }
      if (q && !entry.key.toLowerCase().includes(q)) {
        return false;
      }
      if (onlyOverridden && !isOverridden(entry)) {
        return false;
      }
      if (layerFilter !== "all" && !contributingLayerIds(entry).has(layerFilter)) {
        return false;
      }
      return true;
    });
  }, [entries, query, showDefaults, onlyOverridden, layerFilter]);

  // Roadmap 032: the view's headline numbers — shown keys, hidden default-only
  // rows, really-overridden rows — in ONE pass over the entries (they were
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

  // Focus (and select) the filter box when the Overview's "Where did a setting
  // come from?" pill routed the user here — the tab is already visible by the
  // time this effect runs, so the input is focusable.
  useEffect(() => {
    if (focusFilterNonce) {
      filterInputRef.current?.focus();
      filterInputRef.current?.select();
    }
  }, [focusFilterNonce]);

  // Roadmap 069: the digest card's "show raw order" link lands on the blame
  // ledger — the row is one of ~90, so arriving at the tab is not arriving at
  // the answer. Filter, expand, no focus steal: the reader is here to read.
  // …which means clearing every OTHER filter too, not just setting the query:
  // a layer filter or "only overridden" left over from earlier reading would
  // hide the very row the link promised, and the reader would land on "No keys
  // match". `showDefaults` is deliberately left alone — `description` has no
  // Renovate default, so the row can never be default-only and that checkbox
  // cannot hide it.
  useEffect(() => {
    if (focusDescriptionNonce) {
      setView("keys");
      setQuery(DESCRIPTION_KEY);
      setLayerFilter("all");
      setOnlyOverridden(false);
      setExpanded(new Set([DESCRIPTION_KEY]));
    }
  }, [focusDescriptionNonce]);

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

  const hiddenDefaults = tallies.hiddenDefaults;

  return (
    <div className="card">
      <div className="card-title effective-card-title">
        <Term id="effectiveConfig">Effective config</Term>
        <span className="card-title-hint">
          {view === "json"
            ? " — the resolved config as a document"
            : " — and which layer set each option"}
        </span>
        {provenance !== undefined ? <ViewSwitch view={view} onViewChange={setView} /> : null}
      </div>
      {provenance === undefined ? <p className="empty-note">Computing provenance…</p> : null}
      {provenance !== undefined && view === "json" ? (
        <ResolvedJsonView
          output={resolvedOutput}
          expand={expand}
          onExpandChange={setExpand}
          includeDefaults={includeDefaults}
          onIncludeDefaultsChange={setIncludeDefaults}
          defaultsCount={hiddenDefaults}
          descriptions={descriptionCards}
          onSelectPreset={onSelectPreset}
        />
      ) : null}
      {provenance !== undefined && view === "keys" ? (
        <>
          <ProvFilters
            filterInputRef={filterInputRef}
            query={query}
            onQueryChange={setQuery}
            layerFilter={layerFilter}
            onLayerFilterChange={setLayerFilter}
            layerOptions={layerOptions}
            onlyOverridden={onlyOverridden}
            onOnlyOverriddenChange={setOnlyOverridden}
            showDefaults={showDefaults}
            onShowDefaultsChange={setShowDefaults}
            hiddenDefaults={hiddenDefaults}
          />
          <div className="kv prov-list">
            {filtered.length === 0 ? (
              <p className="empty-note">
                No keys match.{" "}
                {!showDefaults && hiddenDefaults > 0
                  ? `${hiddenDefaults} default-only option${hiddenDefaults === 1 ? "" : "s"} hidden — enable "show default-only" to reveal the fully hydrated config.`
                  : null}
              </p>
            ) : (
              filtered.map((entry) => (
                <KeyRow
                  key={entry.key}
                  entry={entry}
                  ruleAttribution={entry.key === "packageRules" ? ruleAttribution : undefined}
                  ledger={ledgerForRow(entry, ledger)}
                  expanded={expanded.has(entry.key)}
                  onToggle={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(entry.key)) {
                        next.delete(entry.key);
                      } else {
                        next.add(entry.key);
                      }
                      return next;
                    })
                  }
                  onSelectPreset={onSelectPreset}
                />
              ))
            )}
          </div>
          {!showDefaults && hiddenDefaults > 0 && filtered.length > 0 ? (
            <p className="empty-note">
              {hiddenDefaults} default-only option{hiddenDefaults === 1 ? "" : "s"} hidden — enable
              “show default-only” above for the fully hydrated config.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
});
