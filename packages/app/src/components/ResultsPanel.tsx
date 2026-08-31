import { nf } from "@/lib/format";
import { type FocusEvent, type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { RESULTS_TAB_IDS, RESULTS_TAB_LABELS, type ResultsTabId } from "@/data/results-tabs";
import { tabButtonAttrs, tabButtonSelector, tabIdOfElement } from "@/lib/results-tab-dom";
import { nextTabIndex } from "@/lib/roving-tabs";
import { anyModifierHeld } from "@/lib/shortcuts";

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
  /** A tab was CHOSEN — clicked, or Enter/Space on a focused one. Clears the
   *  cross-link back trail; the shell never decides, App owns the state. */
  onSelect: (tab: ResultsTabId) => void;
  /** The arrows and Home/End. Selection follows focus, so a walk selects too —
   *  it is a separate callback only because it must NOT discard the back trail
   *  (App's `walkToTab`, and `onKeyDown` below for the reasoning). */
  onWalk: (tab: ResultsTabId) => void;
  /** Roadmap 028: the one-step "back to where I was" target after an
   *  automatic tab switch (a provenance chip, a message jump, a header digest
   *  link). null = the current tab was reached by an explicit tab click. */
  back: ResultsTabId | null;
  onBack: () => void;
  /** Roadmap 009/075: the run-level banners, shown above the panels on every
   *  tab — the auth-failure notice, the stale-results notice and (since 075)
   *  the 023 hypothetical-run notice all describe the RUN rather than one
   *  instrument, and the tab a run lands on depends on which stage errored. */
  banner?: ReactNode;
  panels: Record<ResultsTabId, ReactNode>;
}

/**
 * Roadmap 028: the tabbed results shell. Every panel stays MOUNTED and is
 * hidden with the `hidden` attribute rather than unmounted, so per-tab state
 * (tree expansion and search, effective-config filters, the stepper index,
 * simulation results, scroll positions) survives switching for free.
 */
export function ResultsPanel({
  tabs,
  active,
  onSelect,
  onWalk,
  back,
  onBack,
  banner,
  panels,
}: Props) {
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
   * Roadmap 068: the ARIA tablist keyboard pattern this shell has claimed since
   * 028 by rendering `role="tablist"` — arrows move along the strip, Home/End
   * go to the ends — paired with the roving `tabindex` below, so the whole
   * strip is ONE tab stop instead of seven on the way to the panel.
   *
   * **Selection follows focus**: an arrow moves focus AND opens that tab. The
   * APG permits either model and recommends this one wherever showing a panel
   * is cheap, which here it always is — every panel is already mounted (028),
   * so a switch is an attribute flip.
   *
   * This strip has now shipped both, and the reversal is worth writing down
   * because the first attempt fixed the wrong half of the problem. Manual
   * activation was adopted to protect the cross-link back trail: half these
   * tabs are reached by a provenance chip or a message jump, which leaves a
   * "← Back to …" control above the panel, and `onSelect` is App's
   * `setTab`, DEFINED to clear that trail because choosing a tab is what it
   * means to have gone somewhere else. So one ArrowRight destroyed the way
   * back. The conclusion drawn was "arrows must not select" — but the arrow was
   * never the problem. Routing a walk through the callback that means "the user
   * chose this" was. Splitting the two (`onWalk`) keeps the trail across a walk
   * and costs the arrows nothing.
   *
   * What manual activation cost, meanwhile, was the pattern users actually
   * expect from a tab strip: every look required a second key to commit, in a
   * widget whose whole purpose is glancing between seven views of one run.
   *
   * Enter and Space still work — they are a focused `<button>`'s own behavior,
   * so nothing here handles them — and now mean "choose this tab", ending the
   * trail the way a click does.
   *
   * Home/End are also the page-scroll keys (016). `preventDefault` is what
   * settles that: `useHomeEndPageScroll` ignores an event another handler
   * already claimed, so the keys scroll the page everywhere except here.
   *
   * A modified chord is left alone — ⌘←/Alt+← is browser Back, Ctrl+Home/End is
   * a Windows/Linux page-scroll convention, Shift+Home extends a selection —
   * through the shared `anyModifierHeld`, which is also what
   * `useHomeEndPageScroll` asks. These are named keys, so Shift counts: a widget
   * that took Shift+End would be hijacking a different gesture, whereas the
   * bare-key layer matches a CHARACTER and has to allow the Shift that types it
   * (`commandModifierHeld`, and the note on both).
   */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const bar = barRef.current;
    if (!bar || anyModifierHeld(event)) {
      return;
    }
    // Arrows move from wherever FOCUS is. Selection follows focus, so the two
    // agree while the user is walking — but only while focus is IN the strip,
    // and the roving stop deliberately outlives that (`focusedTab`). Falling
    // back to the selected tab covers the first press after the strip is
    // entered by pointer or programmatically.
    const focused = document.activeElement;
    const from = bar.contains(focused) ? tabIdOfElement(focused) : undefined;
    const current = tabs.findIndex((tab) => tab.id === (from ?? active));
    const next = current === -1 ? null : nextTabIndex(event.key, current, tabs.length);
    const target = next === null ? undefined : tabs[next];
    if (!target) {
      return;
    }
    event.preventDefault();
    bar.querySelector<HTMLElement>(tabButtonSelector(target.id))?.focus();
    onWalk(target.id);
  }

  // The `.focus()` call above dispatches a real (bubbling, via `focusin`)
  // focus event, which is what actually moves `focusedTab` — this handler
  // just listens for it, the same as it would for a click or a Shift+Tab
  // into the strip from the panel below.
  function onFocus(event: FocusEvent<HTMLDivElement>) {
    const id = tabIdOfElement(event.target);
    if (id) {
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
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- a tablist is a COMPOSITE widget: the ARIA practices put a roving tabindex on the tabs (the real role=tab buttons below, natively focusable) and leave the container itself out of the tab order, so Tab moves PAST the whole bar rather than into it. The rule only sees a container with a keydown handler that is unfocusable; that handler is here because arrow-key navigation is DELEGATED, which is the same pattern's other half. */}
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
            // The attribute App's landings find this button by — written
            // through the same module that spells the selector, so the two
            // cannot drift (`results-tab-dom.ts`).
            {...tabButtonAttrs(tab.id)}
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
              // Roadmap 075: a tab's count is the standard `.pill` — toned
              // when the tab is reporting something, the neutral `.pill-count`
              // when it is only reporting how many.
              <span className={`pill ${tab.tone ? `pill-${tab.tone}` : "pill-count"} tab-count`}>
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
