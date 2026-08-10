import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { RESULTS_TAB_IDS, RESULTS_TAB_LABELS, type ResultsTabId } from "@/data/results-tabs";
import { nextTabIndex } from "@/lib/roving-tabs";

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
  /** Roadmap 009: a run-level banner shown above the panels, on every tab —
   *  the auth-failure notice describes the RUN, not one instrument, and a run
   *  that failed on a preset lands the user on Problems rather than on the
   *  Overview whose own `banner` slot the 023 hypothetical notice occupies. */
  banner?: ReactNode;
  panels: Record<ResultsTabId, ReactNode>;
}

/**
 * Roadmap 028: the tabbed results shell. Every panel stays MOUNTED and is
 * hidden with the `hidden` attribute rather than unmounted, so per-tab state
 * (tree expansion and search, effective-config filters, the stepper index,
 * simulation results, scroll positions) survives switching for free.
 */
export function ResultsPanel({ tabs, active, onSelect, back, onBack, banner, panels }: Props) {
  const barRef = useRef<HTMLDivElement>(null);

  /**
   * Roadmap 067: the ARIA tablist keyboard pattern this shell has claimed since
   * 028 by rendering `role="tablist"` — arrows move between tabs, Home/End go
   * to the ends — paired with the roving `tabindex` below, so the whole strip
   * is ONE tab stop instead of eight on the way to the panel.
   *
   * Home/End are also the page-scroll keys (016). `preventDefault` is what
   * settles that: `useHomeEndPageScroll` ignores an event another handler
   * already claimed, so the keys scroll the page everywhere except here.
   *
   * A modified chord is left alone — ⌘←/Alt+← is browser Back, Ctrl+Home/End
   * is a Windows/Linux page-scroll convention — matching the modifier guard
   * `useHomeEndPageScroll` and `useTabDigits` already carry (both sibling
   * bindings added by the same 067 change).
   */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }
    const current = tabs.findIndex((tab) => tab.id === active);
    const next = current === -1 ? null : nextTabIndex(event.key, current, tabs.length);
    const target = next === null ? undefined : tabs[next];
    if (!target) {
      return;
    }
    event.preventDefault();
    onSelect(target.id);
    // Selection follows focus, so focus has to follow the arrow — otherwise
    // the next arrow press would move from wherever focus was left behind.
    barRef.current?.querySelector<HTMLElement>(`[data-tab="${target.id}"]`)?.focus();
  }

  return (
    <div className="results-panel">
      <div
        className="tab-bar"
        role="tablist"
        aria-label="Results"
        ref={barRef}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            data-tab={tab.id}
            aria-selected={tab.id === active}
            aria-controls={`panel-${tab.id}`}
            // Roving tabindex: only the selected tab is in the tab order.
            tabIndex={tab.id === active ? 0 : -1}
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
        {banner}
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
