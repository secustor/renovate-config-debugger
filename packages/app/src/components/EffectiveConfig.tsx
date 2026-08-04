import { memo, type RefObject, useEffect, useMemo, useRef, useState } from "react";
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
import { OptionKey } from "./option-docs";
import { ConfigJson } from "./ConfigJson";
import { CopyButton } from "./CopyButton";
import { ProvenanceChip } from "./ProvenanceChip";
import { layerId, layerLabel, type LayerId } from "./provenance-layer";
import { useRuleProvenance } from "@/hooks/rule-provenance";
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

/** React key for an override-chain row (roadmap 041). Each layer contributes at
 *  most one step to a key's chain, and preset node ids are unique across the
 *  tree — so this is a genuine identity even when two `extends` entries resolve
 *  to presets with the same NAME (which `layerId` deliberately conflates). */
function stepKey(step: ProvenanceStep): string {
  return step.layer.kind === "preset" ? `preset:${step.layer.nodeId}` : step.layer.kind;
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

function isOverridden(entry: KeyProvenance): boolean {
  const contributors = entry.chain.filter((s) => !s.noop && s.layer.kind !== "defaults");
  return (
    contributors.length >= 2 ||
    entry.chain.some((s) => s.action === "overwrite" || s.action === "forced")
  );
}

/**
 * Roadmap 016: `isOverridden` above answers "did more than one layer touch
 * this key" — it does NOT mean the value was replaced. A concatenating array
 * key (`packageRules`, `labels`, …) touched by several layers is APPENDED to,
 * never overwritten, so labelling it "overridden" is actively misleading (the
 * expert persona called this out directly). This picks the accurate label
 * from the actual merge actions of the contributing (non-default) steps.
 */
type MultiContribBadge = "overridden" | "appended" | "merged";

function multiContribBadgeKind(entry: KeyProvenance): MultiContribBadge {
  const contributors = entry.chain.filter((s) => !s.noop && s.layer.kind !== "defaults");
  if (contributors.some((s) => s.action === "overwrite" || s.action === "forced")) {
    return "overridden";
  }
  if (contributors.some((s) => s.action === "shallow-merge" || s.action === "deep-merge")) {
    return "merged";
  }
  // Nothing left but "set" (the first contributor establishing the value) and
  // "concat" (every later contributor appending to it) — this function is
  // only called once `isOverridden` has already established there are ≥2
  // contributors, so nothing here was ever replaced.
  return "appended";
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
 * rows here show. `overridden` counts the rows carrying the literal
 * `overridden` badge (a value a later layer really replaced), not every
 * multi-layer key — 016 established that calling an appended array
 * "overridden" is misleading.
 */
export interface EffectiveStats {
  /** Options some layer beyond the defaults set — the rows shown by default. */
  keys: number;
  overridden: number;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

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

/** First matcher-clause key list, for a one-line rule summary (mirrors the
 *  simulator's ruleLabel — all clauses, no "which one matters" judgment
 *  since this view has no dependency to evaluate against). */
function summarizeRuleSelectors(rule: unknown): string {
  if (typeof rule !== "object" || rule === null) {
    return "(not an object)";
  }
  const keys = Object.keys(rule as Record<string, unknown>).filter(
    (k) => k.startsWith("match") || k.startsWith("exclude"),
  );
  return keys.length > 0 ? keys.join(" + ") : "(no match*/exclude* selectors)";
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

/** The value cell: what the merged config ends up with — or, for the one row
 *  whose value is a list of rules, how many of them came from where. */
function KeyRowPreview({
  entry,
  rules,
  ruleAttribution,
}: {
  entry: KeyProvenance;
  rules: unknown[] | null;
  ruleAttribution?: RuleAttribution[] | null;
}) {
  return (
    <span className="prov-key-preview">
      {rules ? (
        <RuleFramingText
          total={rules.length}
          attribution={ruleAttribution ?? null}
          variant="full"
        />
      ) : (
        preview(entry.finalValue)
      )}
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
}: {
  entry: KeyProvenance;
  winner?: ProvenanceStep;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <span className="prov-row-origin">
      <MultiContribBadgeChip entry={entry} />
      {winner ? <ProvenanceChip layer={winner.layer} onSelectPreset={onSelectPreset} /> : null}
    </span>
  );
}

function KeyRow({
  entry,
  expanded,
  onToggle,
  onSelectPreset,
  ruleAttribution,
}: {
  entry: KeyProvenance;
  expanded: boolean;
  onToggle: () => void;
  onSelectPreset?: (nodeId: string) => void;
  /** Only meaningful for the `packageRules` row; undefined/unavailable elsewhere. */
  ruleAttribution?: RuleAttribution[] | null;
}) {
  const winner = winningStep(entry);
  const visibleSteps = entry.chain.filter((s) => !s.noop);
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
        <KeyRowPreview entry={entry} rules={rules} ruleAttribution={ruleAttribution} />
        <KeyRowOrigin entry={entry} winner={winner} onSelectPreset={onSelectPreset} />
      </button>
      {expanded ? (
        <div className="prov-detail">
          <FinalValueBlock value={entry.finalValue} />
          {rules &&
          rules.length > 0 &&
          ruleAttribution &&
          ruleAttribution.length === rules.length ? (
            <PackageRulesProvenance
              rules={rules}
              attribution={ruleAttribution}
              onSelectPreset={onSelectPreset}
            />
          ) : null}
          <div className="prov-chain-title">
            Override chain ({visibleSteps.length} step{visibleSteps.length === 1 ? "" : "s"})
          </div>
          {visibleSteps.map((step) => (
            <Step key={stepKey(step)} step={step} onSelectPreset={onSelectPreset} />
          ))}
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
}: {
  output: ResolvedConfigOutput | null | undefined;
  expand: ResolvedConfigMode;
  onExpandChange: (mode: ResolvedConfigMode) => void;
  includeDefaults: boolean;
  onIncludeDefaultsChange: (checked: boolean) => void;
  defaultsCount: number;
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
          <ConfigJson value={output.config} />
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
}) {
  const provenance = useProvenance(result);
  const ruleAttribution = useRuleProvenance(result);
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
  const tallies = useMemo(() => {
    let shown = 0;
    let hiddenDefaults = 0;
    let overridden = 0;
    for (const entry of entries) {
      if (entry.isDefaultOnly) {
        hiddenDefaults++;
        continue;
      }
      shown++;
      if (isOverridden(entry) && multiContribBadgeKind(entry) === "overridden") {
        overridden++;
      }
    }
    return { shown, hiddenDefaults, overridden };
  }, [entries]);

  useEffect(() => {
    onStats?.({ keys: tallies.shown, overridden: tallies.overridden });
  }, [tallies, onStats]);

  // Focus (and select) the filter box when the Overview's "Where did a setting
  // come from?" pill routed the user here — the tab is already visible by the
  // time this effect runs, so the input is focusable.
  useEffect(() => {
    if (focusFilterNonce) {
      filterInputRef.current?.focus();
      filterInputRef.current?.select();
    }
  }, [focusFilterNonce]);

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
