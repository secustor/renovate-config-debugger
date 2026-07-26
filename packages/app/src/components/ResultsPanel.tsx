import type { ReactNode } from "react";
import { RESULTS_TAB_IDS, RESULTS_TAB_LABELS, type ResultsTabId } from "@/data/results-tabs";

const nf = new Intl.NumberFormat();

/** A tab's ambient count badge; `count: undefined` renders no badge at all. */
export interface ResultsTabDescriptor {
  id: ResultsTabId;
  count?: number;
  /** Badge coloring — error wins over warn, matching the stage dots. */
  tone?: "error" | "warn";
}

interface Props {
  tabs: ResultsTabDescriptor[];
  active: ResultsTabId;
  /** A manual tab click — the shell never decides, App owns the state. */
  onSelect: (tab: ResultsTabId) => void;
  /** Roadmap 028: the one-step "back to where I was" target after an
   *  automatic tab switch (a provenance chip, a message jump, an Overview
   *  pill). null = the current tab was reached by an explicit tab click. */
  back: ResultsTabId | null;
  onBack: () => void;
  panels: Record<ResultsTabId, ReactNode>;
}

/**
 * Roadmap 028: the tabbed results shell. Every panel stays MOUNTED and is
 * hidden with the `hidden` attribute rather than unmounted, so per-tab state
 * (tree expansion and search, effective-config filters, the stepper index,
 * simulation results, scroll positions) survives switching for free.
 */
export function ResultsPanel({ tabs, active, onSelect, back, onBack, panels }: Props) {
  return (
    <div className="results-panel">
      <div className="tab-bar" role="tablist" aria-label="Results">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            data-tab={tab.id}
            aria-selected={tab.id === active}
            aria-controls={`panel-${tab.id}`}
            // A zero-count tab is dimmed but never hidden or disabled: tabs
            // keep their position across runs, and each one still explains
            // that it has nothing to show.
            className={`tab${tab.id === active ? " active" : ""}${tab.count === 0 ? " empty" : ""}`}
            onClick={() => onSelect(tab.id)}
          >
            {RESULTS_TAB_LABELS[tab.id]}
            {tab.count === undefined ? null : (
              <span className={`tab-count${tab.tone ? ` ${tab.tone}` : ""}`}>
                {nf.format(tab.count)}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {back ? (
          <button type="button" className="tab-back" onClick={onBack}>
            ← Back to {RESULTS_TAB_LABELS[back]}
          </button>
        ) : null}
        {RESULTS_TAB_IDS.map((id) => (
          <div
            key={id}
            id={`panel-${id}`}
            className="tab-panel"
            role="tabpanel"
            aria-labelledby={`tab-${id}`}
            hidden={id !== active}
          >
            {panels[id]}
          </div>
        ))}
      </div>
    </div>
  );
}
