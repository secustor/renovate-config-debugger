import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { EMPTY_FORM } from "@/features/simulator/form";
import { type PinnedRun, usePinnedRun } from "./use-pinned-run";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 091: the starter-pin latch. Seeding happens at most once per session
 * and never over a reader who has touched the list — what counts as a touch IS
 * the behaviour, so the ledger of touches is tested as one.
 */

/** The hook's API, hoisted out of the render so a test can drive it. */
let held: PinnedRun | null = null;

function Harness() {
  const api = usePinnedRun();
  // Written from an effect, never during render (`react/globals`); `render`
  // and `act` both flush effects, so every read below sees the latest.
  useEffect(() => {
    held = api;
  }, [api]);
  return null;
}

function mount(): PinnedRun {
  held = null;
  render(<Harness />);
  if (!held) {
    throw new Error("the harness did not render");
  }
  return held;
}

/** The hook after the last committed render — `mount()`'s value holds the
 *  stable callbacks, this holds the current list. */
function current(): PinnedRun {
  if (!held) {
    throw new Error("the harness did not render");
  }
  return held;
}

function form(packageName: string): FormState {
  return { ...EMPTY_FORM, manager: "npm", packageName, currentValue: "1.0.0", newValue: "1.1.0" };
}

function names(): string[] {
  return current().pins.map((pin) => pin.form.packageName);
}

describe("usePinnedRun starter seeding", () => {
  it("seeds marked starters into an untouched list, once", () => {
    const api = mount();
    act(() => api.seedStarterPins([form("react"), form("lodash")]));
    expect(names()).toStrictEqual(["react", "lodash"]);
    expect(current().pins.every((pin) => pin.starter === true)).toBe(true);

    act(() => api.seedStarterPins([form("vue")]));
    expect(names()).toStrictEqual(["react", "lodash"]);
  });

  it("does not seed after the reader has pinned, or removed, anything", () => {
    const api = mount();
    act(() => api.addPin(form("react")));
    act(() => api.removePin(current().pins[0]?.id ?? ""));
    expect(names()).toStrictEqual([]);
    // The list is empty again, but it is not UNTOUCHED — the reader deleted
    // that pin, and a starter arriving in its place would undo the gesture.
    act(() => api.seedStarterPins([form("lodash")]));
    expect(names()).toStrictEqual([]);
  });

  it("trips the latch even when a run derived nothing", () => {
    const api = mount();
    act(() => api.seedStarterPins([]));
    act(() => api.seedStarterPins([form("react")]));
    expect(names()).toStrictEqual([]);
  });

  it("stands down for a link that carried pins", () => {
    const api = mount();
    act(() => api.setPinsFromShare([{ packageName: "react", manager: "npm" }]));
    act(() => api.seedStarterPins([form("lodash")]));
    expect(names()).toStrictEqual(["react"]);
    expect(current().pins.some((pin) => pin.starter === true)).toBe(false);
  });

  it("still seeds for a link that carried none — that is someone else's config", () => {
    const api = mount();
    act(() => api.setPinsFromShare([]));
    act(() => api.seedStarterPins([form("lodash")]));
    expect(names()).toStrictEqual(["lodash"]);
  });

  it("leaves starters out of the share link", () => {
    const api = mount();
    act(() => api.seedStarterPins([form("react")]));
    act(() => api.addPin(form("lodash")));
    expect(names()).toStrictEqual(["react", "lodash"]);
    expect(current().pinsAsShareFields()).toStrictEqual([
      { manager: "npm", packageName: "lodash", currentValue: "1.0.0", newValue: "1.1.0" },
    ]);
  });
});
