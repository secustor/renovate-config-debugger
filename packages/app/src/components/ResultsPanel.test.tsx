import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RESULTS_TAB_IDS, type ResultsTabId } from "@/data/results-tabs";
import { ResultsPanel, type ResultsTabDescriptor } from "./ResultsPanel";

/**
 * Roadmap 067 — the shell has rendered `role="tablist"` since 028, which
 * PROMISES arrow-key navigation and a single tab stop. It implemented neither:
 * every tab was its own stop, and the arrows did nothing. These tests are that
 * promise.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

const TABS: ResultsTabDescriptor[] = [
  { id: "overview" },
  { id: "pipeline" },
  { id: "presets", count: 3 },
  { id: "problems", count: 0 },
];

function panels(): Record<ResultsTabId, string> {
  return Object.fromEntries(RESULTS_TAB_IDS.map((id) => [id, `${id} body`])) as Record<
    ResultsTabId,
    string
  >;
}

function renderPanel(
  active: ResultsTabId,
  onSelect: (tab: ResultsTabId) => void,
  back: ResultsTabId | null = null,
) {
  return render(
    <ResultsPanel
      tabs={TABS}
      active={active}
      onSelect={onSelect}
      back={back}
      onBack={() => undefined}
      panels={panels()}
    />,
  );
}

/** The id of whatever currently has focus — the strip's arrows move focus and
 *  nothing else, so this is what every navigation assertion below reads. */
function focusedTabId(): string | undefined {
  return document.activeElement?.id;
}

describe("ResultsPanel keyboard navigation", () => {
  it("keeps the whole strip to one tab stop (roving tabindex)", () => {
    const view = renderPanel("pipeline", () => undefined);
    const tabs = view.getAllByRole("tab");

    const tabbable = tabs.filter((tab) => tab.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveProperty("id", "tab-pipeline");
  });

  it("moves focus with the arrows and wraps around", () => {
    const onSelect = vi.fn();
    const view = renderPanel("overview", onSelect);
    const strip = view.getByRole("tablist");

    fireEvent.keyDown(strip, { key: "ArrowRight" });
    expect(focusedTabId()).toBe("tab-pipeline");

    // …and the NEXT arrow moves from where focus is now, not from the (still
    // unchanged) selection.
    fireEvent.keyDown(strip, { key: "ArrowLeft" });
    expect(focusedTabId()).toBe("tab-overview");

    fireEvent.keyDown(strip, { key: "ArrowLeft" });
    expect(focusedTabId()).toBe("tab-problems");
  });

  it("sends Home and End to the first and last tab", () => {
    const onSelect = vi.fn();
    const view = renderPanel("pipeline", onSelect);
    const strip = view.getByRole("tablist");

    fireEvent.keyDown(strip, { key: "End" });
    expect(focusedTabId()).toBe("tab-problems");

    fireEvent.keyDown(strip, { key: "Home" });
    expect(focusedTabId()).toBe("tab-overview");
  });

  it("selects on activation only, never on an arrow (manual activation)", () => {
    // The defect this pins: `onSelect` is App's `setTab`, which clears the
    // "← Back to …" affordance a cross-link left above the panel. With
    // selection following focus, one glance at the neighbouring tab destroyed
    // the way back.
    const onSelect = vi.fn();
    const view = renderPanel("presets", onSelect, "overview");
    const strip = view.getByRole("tablist");

    fireEvent.keyDown(strip, { key: "ArrowRight" });
    fireEvent.keyDown(strip, { key: "End" });
    fireEvent.keyDown(strip, { key: "Home" });
    expect(onSelect).not.toHaveBeenCalled();

    // Enter and Space are the browser's own activation of a focused `<button>`
    // — they arrive as a click, which is the path asserted here.
    fireEvent.click(view.getByRole("tab", { name: /^Pipeline/ }));
    expect(onSelect).toHaveBeenLastCalledWith("pipeline");
  });

  it("claims Home/End so the page-scroll hook (016) leaves them alone", () => {
    const view = renderPanel("pipeline", () => undefined);
    const strip = view.getByRole("tablist");

    // `fireEvent` returns false when a handler called preventDefault — which
    // is exactly the signal `useHomeEndPageScroll` reads.
    expect(fireEvent.keyDown(strip, { key: "End" })).toBe(false);
    // Keys the strip does not own stay unclaimed, so the page still scrolls.
    expect(fireEvent.keyDown(strip, { key: "PageDown" })).toBe(true);
  });

  it("leaves a modified arrow alone, so browser Back/Ctrl+Home keep working", () => {
    // ⌘←/Alt+← is browser Back, Ctrl+Home/End is a Windows/Linux page-scroll
    // convention — a tab-strip user pressing either must not get a silent tab
    // switch instead. `fireEvent` returns true when nothing called
    // `preventDefault`, unlike the claimed-key case above.
    const onSelect = vi.fn();
    const view = renderPanel("pipeline", onSelect);
    const strip = view.getByRole("tablist");

    expect(fireEvent.keyDown(strip, { key: "ArrowLeft", metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(strip, { key: "ArrowLeft", altKey: true })).toBe(true);
    expect(fireEvent.keyDown(strip, { key: "Home", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(strip, { key: "End", ctrlKey: true })).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("leaves only the active panel in the tab order", () => {
    const view = renderPanel("presets", () => undefined);
    const active = view.getByRole("tabpanel");
    expect(active).toHaveProperty("id", "panel-presets");
    // Every other panel is `hidden`, which is what keeps its controls out of
    // the tab order — `getByRole` finding exactly one is that guarantee.
  });
});
