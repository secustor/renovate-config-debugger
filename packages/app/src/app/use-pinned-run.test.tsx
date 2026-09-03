import { act, renderHook, type RenderHookResult } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EMPTY_FORM } from "@/features/simulator/form";
import { type PinnedRun, usePinnedRun } from "./use-pinned-run";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 091: the starter-pin latch. Seeding happens at most once per session
 * and never over a reader who has touched the list — what counts as a touch IS
 * the behaviour, so the ledger of touches is tested as one.
 */

type Mounted = RenderHookResult<PinnedRun, unknown>["result"];

/** Deliberately snapshotted at mount and driven through afterwards: calling
 *  the callbacks off the FIRST render is the stability exercise. `result`
 *  itself is what a test reads for the live list. */
function mount(): { api: PinnedRun; result: Mounted } {
  const { result } = renderHook(() => usePinnedRun());
  return { api: result.current, result };
}

function form(packageName: string): FormState {
  return { ...EMPTY_FORM, manager: "npm", packageName, currentValue: "1.0.0", newValue: "1.1.0" };
}

function names(result: Mounted): string[] {
  return result.current.pins.map((pin) => pin.form.packageName);
}

describe("usePinnedRun starter seeding", () => {
  it("seeds marked starters into an untouched list, once", () => {
    const { api, result } = mount();
    act(() => api.seedStarterPins([form("react"), form("lodash")]));
    expect(names(result)).toStrictEqual(["react", "lodash"]);
    expect(result.current.pins.every((pin) => pin.starter === true)).toBe(true);

    act(() => api.seedStarterPins([form("vue")]));
    expect(names(result)).toStrictEqual(["react", "lodash"]);
  });

  it("does not seed after the reader has pinned, or removed, anything", () => {
    const { api, result } = mount();
    act(() => api.addPin(form("react")));
    act(() => api.removePin(result.current.pins[0]?.id ?? ""));
    expect(names(result)).toStrictEqual([]);
    // The list is empty again, but it is not UNTOUCHED — the reader deleted
    // that pin, and a starter arriving in its place would undo the gesture.
    act(() => api.seedStarterPins([form("lodash")]));
    expect(names(result)).toStrictEqual([]);
  });

  it("trips the latch even when a run derived nothing", () => {
    const { api, result } = mount();
    act(() => api.seedStarterPins([]));
    act(() => api.seedStarterPins([form("react")]));
    expect(names(result)).toStrictEqual([]);
  });

  it("stands down for a link that carried pins", () => {
    const { api, result } = mount();
    act(() => api.setPinsFromShare([{ packageName: "react", manager: "npm" }]));
    act(() => api.seedStarterPins([form("lodash")]));
    expect(names(result)).toStrictEqual(["react"]);
    expect(result.current.pins.some((pin) => pin.starter === true)).toBe(false);
  });

  it("still seeds for a link that carried none — that is someone else's config", () => {
    const { api, result } = mount();
    act(() => api.setPinsFromShare([]));
    act(() => api.seedStarterPins([form("lodash")]));
    expect(names(result)).toStrictEqual(["lodash"]);
  });

  it("leaves starters out of the share link", () => {
    const { api, result } = mount();
    act(() => api.seedStarterPins([form("react")]));
    act(() => api.addPin(form("lodash")));
    expect(names(result)).toStrictEqual(["react", "lodash"]);
    expect(result.current.pinsAsShareFields()).toStrictEqual([
      { manager: "npm", packageName: "lodash", currentValue: "1.0.0", newValue: "1.1.0" },
    ]);
  });
});
