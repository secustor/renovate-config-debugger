import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useTransientFlag } from "./use-transient-flag";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The hook's flash trigger, hoisted out of the render so a test can pull it.
 * A module binding rather than a ref-shaped prop: mutating a prop is what
 * `react/immutability` forbids, in an effect as much as in the render.
 */
let flash: (() => void) | null = null;

function Probe({ onRender }: { onRender: (flag: boolean) => void }) {
  const [flag, flashNow] = useTransientFlag(1500);
  // Published from an effect, which `render`/`act` flush synchronously — so
  // every `mountProbe()` below still returns with the trigger in hand.
  useEffect(() => {
    flash = flashNow;
  }, [flashNow]);
  onRender(flag);
  return null;
}

function mountProbe(onRender: (flag: boolean) => void) {
  flash = null;
  const view = render(<Probe onRender={onRender} />);
  if (!flash) {
    throw new Error("the probe did not render");
  }
  return view;
}

/** The flash, inside `act` — every caller wants the resulting render flushed. */
function fireFlash() {
  act(() => {
    flash?.();
  });
}

test("flashes on, turns itself off after the window", () => {
  const seen: boolean[] = [];
  mountProbe((flag) => seen.push(flag));
  fireFlash();
  expect(seen.at(-1)).toBe(true);
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  expect(seen.at(-1)).toBe(false);
});

test("a second flash restarts the window instead of ending it early", () => {
  const seen: boolean[] = [];
  mountProbe((flag) => seen.push(flag));
  fireFlash();
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  fireFlash();
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  // The first timer would have fired at 1500ms; the second flash replaced it.
  expect(seen.at(-1)).toBe(true);
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(seen.at(-1)).toBe(false);
});

test("unmount inside the window clears the timer — no dead setState", () => {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => errors.push(event.error);
  window.addEventListener("error", onError);
  const view = mountProbe(() => undefined);
  fireFlash();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  window.removeEventListener("error", onError);
  expect(errors).toEqual([]);
});

/** The hook exists because two receipt timers leaked; the leak was an unmount
 *  with the timer still pending. This pins that the cleanup is the unmount's,
 *  not the flash's. */
function Mounter() {
  const [, flashNow] = useTransientFlag(1500);
  useEffect(() => {
    flashNow();
  }, [flashNow]);
  return null;
}

test("mount-and-flash then unmount leaves no timers", () => {
  const view = render(<Mounter />);
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
