import { useEffect, useMemo, useState } from "react";
import type {
  KeyProvenance,
  ProvenanceStep,
  TraceResult,
} from "@renovate-config-visualizer/engine";
import { OptionKey } from "../option-docs";
import { ConfigJson } from "./ConfigJson";

/**
 * Roadmap 005: the effective config as a provenance view. Every top-level key
 * carries a colour-coded badge for its winning source layer (default / a
 * preset / the repo config) and expands to the full override chain — who set
 * it, who overrode it, and the losing values. Provenance is computed post-hoc
 * from the trace via the engine's `computeProvenance`, loaded through the same
 * dynamic import that keeps the renovate chunk out of the initial bundle.
 */

type Provenance = Map<string, KeyProvenance>;

/** Loads + computes provenance for a result once the engine chunk is present. */
function useProvenance(result: TraceResult): Provenance | null | undefined {
  // undefined = loading, null = unavailable (e.g. preset resolution failed)
  const [state, setState] = useState<Provenance | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setState(undefined);
    void import("@renovate-config-visualizer/engine").then((engine) => {
      if (live) {
        setState(engine.computeProvenance(result) ?? null);
      }
    });
    return () => {
      live = false;
    };
  }, [result]);
  return state;
}

type LayerId = string;

/** Stable id for a layer, used by the dropdown filter + winning-badge classes. */
function layerId(layer: ProvenanceStep["layer"]): LayerId {
  return layer.kind === "preset" ? `preset:${layer.name}` : layer.kind;
}

function layerLabel(layer: ProvenanceStep["layer"]): string {
  if (layer.kind === "defaults") {
    return "default";
  }
  if (layer.kind === "repo") {
    return "repo config";
  }
  return layer.name;
}

function layerClass(layer: ProvenanceStep["layer"]): string {
  return `prov-${layer.kind}`;
}

const VERBS: Record<ProvenanceStep["action"], string> = {
  set: "sets",
  overwrite: "overwrites with",
  concat: "appends",
  "shallow-merge": "shallow-merges",
  "deep-merge": "deep-merges",
  forced: "forces",
};

/** The step whose value survives into the final config (skips no-op steps). */
function winningStep(entry: KeyProvenance): ProvenanceStep {
  return entry.chain.findLast((s) => !s.noop) ?? entry.chain[entry.chain.length - 1]!;
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

function LayerBadge({
  layer,
  onSelectPreset,
}: {
  layer: ProvenanceStep["layer"];
  onSelectPreset?: (nodeId: string) => void;
}) {
  const clickable = layer.kind === "preset" && onSelectPreset;
  const className = `badge prov-layer ${layerClass(layer)}`;
  if (clickable) {
    // Not a <button>: KeyRow renders this inside its row-toggle button, and
    // buttons cannot nest. stopPropagation keeps the row from toggling too.
    return (
      <span
        role="button"
        tabIndex={0}
        className={className}
        title="Show this preset in the resolution tree"
        onClick={(e) => {
          e.stopPropagation();
          onSelectPreset(layer.nodeId);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onSelectPreset(layer.nodeId);
          }
        }}
      >
        {layerLabel(layer)}
      </span>
    );
  }
  return <span className={className}>{layerLabel(layer)}</span>;
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
        <LayerBadge layer={step.layer} onSelectPreset={onSelectPreset} />
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

function KeyRow({
  entry,
  expanded,
  onToggle,
  onSelectPreset,
}: {
  entry: KeyProvenance;
  expanded: boolean;
  onToggle: () => void;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const winner = winningStep(entry);
  const visibleSteps = entry.chain.filter((s) => !s.noop);
  return (
    <div className={`prov-row${expanded ? " expanded" : ""}`}>
      <button type="button" className="prov-row-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="caret">{expanded ? "▾" : "▸"}</span>
        <span className="prov-key-name">
          <OptionKey name={entry.key} flagUnknown />
        </span>
        <span className="prov-key-preview">{preview(entry.finalValue)}</span>
        {isOverridden(entry) ? (
          <span className="badge prov-overridden" title="Set more than once, or overwritten/forced">
            overridden
          </span>
        ) : null}
        <LayerBadge layer={winner.layer} onSelectPreset={onSelectPreset} />
      </button>
      {expanded ? (
        <div className="prov-detail">
          <div className="prov-final">
            <div className="prov-final-title">Final value</div>
            <pre className="config-view prov-value">
              <ConfigJson value={entry.finalValue} />
            </pre>
          </div>
          <div className="prov-chain-title">
            Override chain ({visibleSteps.length} step{visibleSteps.length === 1 ? "" : "s"})
          </div>
          {visibleSteps.map((step, i) => (
            <Step key={i} step={step} onSelectPreset={onSelectPreset} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EffectiveConfig({
  result,
  onSelectPreset,
}: {
  result: TraceResult;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const provenance = useProvenance(result);
  const [query, setQuery] = useState("");
  const [layerFilter, setLayerFilter] = useState<LayerId | "all">("all");
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // node ids and keys are per-run, so drop any stale expansion/filter state
  useEffect(() => {
    setExpanded(new Set());
    setQuery("");
    setLayerFilter("all");
    setOnlyOverridden(false);
    setShowDefaults(false);
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

  if (!result.finalConfig) {
    return null;
  }

  // Fallback: provenance needs a completed preset resolution. When it is
  // unavailable, still show the effective config as plain JSON.
  if (provenance === null) {
    return (
      <div className="card">
        <div className="card-title">Effective config</div>
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

  const hiddenDefaults = entries.filter((e) => e.isDefaultOnly).length;

  return (
    <div className="card">
      <div className="card-title">Effective config — per-key provenance</div>
      {provenance === undefined ? (
        <p className="empty-note">Computing provenance…</p>
      ) : (
        <>
          <div className="prov-filters">
            <input
              type="text"
              className="prov-filter-input"
              placeholder="Filter keys…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select value={layerFilter} onChange={(e) => setLayerFilter(e.target.value)}>
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
                onChange={(e) => setOnlyOverridden(e.target.checked)}
              />{" "}
              only overridden
            </label>
            <label className="prov-check">
              <input
                type="checkbox"
                checked={showDefaults}
                onChange={(e) => setShowDefaults(e.target.checked)}
              />{" "}
              show default-only ({hiddenDefaults})
            </label>
          </div>
          <div className="prov-list">
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
      )}
    </div>
  );
}
