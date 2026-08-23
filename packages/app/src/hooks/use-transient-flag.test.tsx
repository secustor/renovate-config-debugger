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

function Probe({
  onRender,
  fire,
}: {
  onRender: (flag: boolean) => void;
  fire: { current: (() => void) | null };
}) {
  const [flag, flash] = useTransientFlag(1500);
  fire.current = flash;
  onRender(flag);
  return null;
}

test("flashes on, turns itself off after the window", () => {
  const seen: boolean[] = [];
  const fire: { current: (() => void) | null } = { current: null };
  render(<Probe onRender={(flag) => seen.push(flag)} fire={fire} />);
  act(() => {
    fire.current?.();
  });
  expect(seen.at(-1)).toBe(true);
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  expect(seen.at(-1)).toBe(false);
});

test("a second flash restarts the window instead of ending it early", () => {
  const seen: boolean[] = [];
  const fire: { current: (() => void) | null } = { current: null };
  render(<Probe onRender={(flag) => seen.push(flag)} fire={fire} />);
  act(() => {
    fire.current?.();
  });
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  act(() => {
    fire.current?.();
  });
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
  const fire: { current: (() => void) | null } = { current: null };
  const view = render(<Probe onRender={() => undefined} fire={fire} />);
  act(() => {
    fire.current?.();
  });
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
  const [, flash] = useTransientFlag(1500);
  useEffect(() => {
    flash();
  }, [flash]);
  return null;
}

test("mount-and-flash then unmount leaves no timers", () => {
  const view = render(<Mounter />);
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
