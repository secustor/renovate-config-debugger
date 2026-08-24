import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RESULTS_TAB_IDS, type ResultsTabId } from "@/data/results-tabs";
import { tabButtonSelector } from "@/lib/results-tab-dom";
import { ResultsPanel, type ResultsTabDescriptor } from "./ResultsPanel";

/**
 * Roadmap 068 — the shell has rendered `role="tablist"` since 028, which
 * PROMISES arrow-key navigation and a single tab stop. It implemented neither:
 * every tab was its own stop, and the arrows did nothing. These tests are that
 * promise.
 */

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

const TABS: ResultsTabDescriptor[] = [
  { id: "tests" },
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
  onWalk: (tab: ResultsTabId) => void = () => undefined,
) {
  return render(
    <ResultsPanel
      tabs={TABS}
      active={active}
      onSelect={onSelect}
      onWalk={onWalk}
      back={back}
      onBack={() => undefined}
      panels={panels()}
    />,
  );
}

/** The id of whatever currently has focus — what every navigation assertion
 *  below reads, alongside the tab the walk opened. */
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
    const view = renderPanel("tests", onSelect);
    const strip = view.getByRole("tablist");

    fireEvent.keyDown(strip, { key: "ArrowRight" });
    expect(focusedTabId()).toBe("tab-pipeline");

    // …and the NEXT arrow moves from where focus is now, not from the (still
    // unchanged) selection.
    fireEvent.keyDown(strip, { key: "ArrowLeft" });
    expect(focusedTabId()).toBe("tab-tests");

    fireEvent.keyDown(strip, { key: "ArrowLeft" });
    expect(focusedTabId()).toBe("tab-problems");
  });

  it("keeps the roving tabindex on the FOCUSED tab, not the selected one", () => {
    // The defect: with the stop pinned to the selection, tabbing forward out
    // of a strip whose selection sits at the end (e.g. Problems, the last of
    // five) after an arrow had moved focus elsewhere landed BACK on the
    // selected tab instead of leaving the widget — the roving-tabindex
    // contract (there is exactly one tabbable descendant, and it is the one
    // focus last landed on) is what makes a plain Tab actually exit the strip.
    const view = renderPanel("problems", () => undefined);
    const strip = view.getByRole("tablist");
    const tabbableIds = () =>
      view
        .getAllByRole("tab")
        .filter((tab) => tab.getAttribute("tabindex") === "0")
        .map((tab) => tab.id);

    expect(tabbableIds()).toEqual(["tab-problems"]);

    // Tab into the strip (focus starts on the selected tab, same as a real
    // Tab keypress would land), then move away from it.
    view.getByRole("tab", { name: /^Problems/ }).focus();
    fireEvent.keyDown(strip, { key: "Home" });
    expect(focusedTabId()).toBe("tab-tests");

    // The stop must have followed focus to Tests — Problems (still
    // selected) is no longer tabbable, or a forward Tab would jump back into
    // the strip instead of into the panel.
    expect(tabbableIds()).toEqual(["tab-tests"]);
  });

  it("falls the roving tabindex back to the selected tab once focus leaves the strip", () => {
    const view = renderPanel("problems", () => undefined);
    const strip = view.getByRole("tablist");
    const outside = document.createElement("button");
    document.body.appendChild(outside);

    view.getByRole("tab", { name: /^Problems/ }).focus();
    fireEvent.keyDown(strip, { key: "Home" });
    expect(view.getAllByRole("tab").find((tab) => tab.getAttribute("tabindex") === "0")?.id).toBe(
      "tab-tests",
    );

    fireEvent.blur(view.getByRole("tab", { name: /^Tests/ }), { relatedTarget: outside });
    expect(view.getAllByRole("tab").find((tab) => tab.getAttribute("tabindex") === "0")?.id).toBe(
      "tab-problems",
    );

    outside.remove();
  });

  it("sends Home and End to the first and last tab", () => {
    const onSelect = vi.fn();
    const view = renderPanel("pipeline", onSelect);
    const strip = view.getByRole("tablist");

    fireEvent.keyDown(strip, { key: "End" });
    expect(focusedTabId()).toBe("tab-problems");

    fireEvent.keyDown(strip, { key: "Home" });
    expect(focusedTabId()).toBe("tab-tests");
  });

  it("opens the tab an arrow lands on (selection follows focus)", () => {
    const onSelect = vi.fn();
    const onWalk = vi.fn();
    const view = renderPanel("tests", onSelect, null, onWalk);
    const strip = view.getByRole("tablist");

    fireEvent.keyDown(strip, { key: "ArrowRight" });
    expect(onWalk).toHaveBeenLastCalledWith("pipeline");
    fireEvent.keyDown(strip, { key: "End" });
    expect(onWalk).toHaveBeenLastCalledWith("problems");
    fireEvent.keyDown(strip, { key: "Home" });
    expect(onWalk).toHaveBeenLastCalledWith("tests");
  });

  it("walks without spending the cross-link back trail, but a choice spends it", () => {
    // Why a walk is not routed through `onSelect`: that callback is App's
    // `setTab`, DEFINED to clear the "← Back to …" control a cross-link left
    // above the panel. Manual activation was the first answer to this and it
    // cost every look a second keypress; splitting the two callbacks keeps the
    // trail without taking the arrows away.
    const onSelect = vi.fn();
    const onWalk = vi.fn();
    const view = renderPanel("presets", onSelect, "tests", onWalk);
    const strip = view.getByRole("tablist");

    fireEvent.keyDown(strip, { key: "ArrowRight" });
    fireEvent.keyDown(strip, { key: "End" });
    expect(onSelect).not.toHaveBeenCalled();

    // Enter and Space are the browser's own activation of a focused `<button>`
    // — they arrive as a click, which is the path asserted here, and that one
    // DOES mean "I chose this tab".
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

  it("renders the button App's landings reach for by selector", () => {
    // App focuses a NAMED tab from outside this component (the digit jump, the
    // apply-fix landing) — it can only find one by selector, across the lazy
    // results boundary. Before the review the selector was spelled once here
    // and once in App.tsx, so renaming the attribute fixed the arrows above and
    // silently broke both landings. Now both spellings come from
    // `results-tab-dom.ts`, and this is the assertion that they still describe
    // the button this strip actually renders.
    const view = renderPanel("presets", () => undefined);

    for (const tab of TABS) {
      expect(document.querySelectorAll(tabButtonSelector(tab.id))).toHaveLength(1);
      expect(document.querySelector(tabButtonSelector(tab.id))).toHaveProperty(
        "id",
        `tab-${tab.id}`,
      );
    }
    expect(view.getAllByRole("tab")).toHaveLength(TABS.length);
  });

  it("leaves only the active panel in the tab order", () => {
    const view = renderPanel("presets", () => undefined);
    const active = view.getByRole("tabpanel");
    expect(active).toHaveProperty("id", "panel-presets");
    // Every other panel is `hidden`, which is what keeps its controls out of
    // the tab order — `getByRole` finding exactly one is that guarantee.
  });
});
