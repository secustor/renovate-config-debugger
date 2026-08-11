import { type FocusEvent, type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import {
  isResultsTabId,
  RESULTS_TAB_IDS,
  RESULTS_TAB_LABELS,
  type ResultsTabId,
} from "@/data/results-tabs";
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
  /** A tab was ACTIVATED — clicked, or Enter/Space on a focused one. The
   *  arrows never call this (manual activation, see `onKeyDown`); the shell
   *  never decides, App owns the state. */
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
  // The roving tabindex's `0` — the tab a plain Tab key would land on next
  // time the strip is entered, and the one Tab leaves FROM. It has to track
  // wherever DOM focus actually is inside the strip, not the selection: under
  // manual activation the two differ for as long as the user is looking
  // around with the arrows, and pinning the stop to the selected tab left an
  // unselected tab at the end of a walk with no tabbable neighbour ahead of
  // it in the strip — so a forward Tab had nowhere further to land on except
  // jump BACK to the selected tab, instead of leaving the widget. `null`
  // means focus isn't (currently known to be) inside the strip, which is the
  // fallback case: pin the stop back to the selected tab.
  const [focusedTab, setFocusedTab] = useState<ResultsTabId | null>(null);

  /**
   * Roadmap 067: the ARIA tablist keyboard pattern this shell has claimed since
   * 028 by rendering `role="tablist"` — arrows move along the strip, Home/End
   * go to the ends — paired with the roving `tabindex` below, so the whole
   * strip is ONE tab stop instead of eight on the way to the panel.
   *
   * **Manual activation**, deliberately: the arrows move FOCUS, and Enter or
   * Space selects. That is a `<button>`'s own behavior, so nothing here handles
   * either key, and the sheet's "← → move between tabs" stays literally true.
   *
   * The APG permits this or "selection follows focus", and this strip shipped
   * the latter first. It was the wrong one here. Half these tabs are reached by
   * cross-link — a provenance chip, a message jump, an Overview pill — and
   * arriving that way puts a "← Back to Overview" control above the panel.
   * `onSelect` is App's `setTab`, which clears that affordance because an
   * explicit tab choice is exactly what it means to have gone somewhere else:
   * so one ArrowRight to glance at the neighbour destroyed the way back, and
   * walking from the first tab to the last was six real tab switches, each
   * announced to a screen reader as a newly selected panel the user never
   * asked for. Panels are all mounted (028), so nothing about switching is
   * expensive — the cost was never render time, it was that every look was
   * also a commitment.
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
    const bar = barRef.current;
    if (!bar || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }
    // Arrows move from wherever FOCUS is, which under manual activation is
    // allowed to differ from the selection — and does, for as long as the user
    // is looking around. Falling back to the selected tab covers the first
    // press after the strip is entered by pointer or programmatically.
    const focused = document.activeElement;
    const from =
      focused instanceof HTMLElement && bar.contains(focused) ? focused.dataset.tab : undefined;
    const current = tabs.findIndex((tab) => tab.id === (from ?? active));
    const next = current === -1 ? null : nextTabIndex(event.key, current, tabs.length);
    const target = next === null ? undefined : tabs[next];
    if (!target) {
      return;
    }
    event.preventDefault();
    bar.querySelector<HTMLElement>(`[data-tab="${target.id}"]`)?.focus();
  }

  // The `.focus()` call above dispatches a real (bubbling, via `focusin`)
  // focus event, which is what actually moves `focusedTab` — this handler
  // just listens for it, the same as it would for a click or a Shift+Tab
  // into the strip from the panel below.
  function onFocus(event: FocusEvent<HTMLDivElement>) {
    const target = event.target;
    const id = target instanceof HTMLElement ? target.dataset.tab : undefined;
    if (isResultsTabId(id)) {
      setFocusedTab(id);
    }
  }

  // Focus leaving the strip entirely (not just moving between its own tabs)
  // is what resets the roving stop back to the selected tab, so re-entering
  // by Tab returns to the panel on screen rather than to wherever a
  // look-around was abandoned.
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (!(next instanceof HTMLElement) || !barRef.current?.contains(next)) {
      setFocusedTab(null);
    }
  }

  return (
    <div className="results-panel">
      <div
        className="tab-bar"
        role="tablist"
        aria-label="Results"
        ref={barRef}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
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
            // Roving tabindex: only one tab is in the sequential tab order at
            // a time — the FOCUSED one, so a plain Tab press has somewhere to
            // go that isn't back into the strip, falling back to the selected
            // tab whenever focus isn't (yet, or any longer) inside the strip.
            tabIndex={tab.id === (focusedTab ?? active) ? 0 : -1}
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
