import { describe, expect, it, vi } from "vitest";
import { openPickerOnEnter } from "./select-picker";

/**
 * Roadmap 068 tier 1 — Enter opens a focused `<select>`. The guards matter more
 * than the happy path: ⌘⏎ is Run and must survive a focused control, and a
 * browser without `showPicker` must be left alone rather than half-handled.
 */

function keyEvent(
  overrides: {
    key?: string;
    meta?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    form?: unknown;
  } = {},
  showPicker?: () => void,
) {
  const preventDefault = vi.fn();
  return {
    event: {
      key: overrides.key ?? "Enter",
      metaKey: overrides.meta ?? false,
      ctrlKey: overrides.ctrl ?? false,
      altKey: overrides.alt ?? false,
      shiftKey: overrides.shift ?? false,
      preventDefault,
      currentTarget: { value: "renovate.json", form: overrides.form ?? null, showPicker },
    },
    preventDefault,
  };
}

describe("openPickerOnEnter", () => {
  it("opens the dropdown on a plain Enter", () => {
    const showPicker = vi.fn();
    const { event, preventDefault } = keyEvent({}, showPicker);
    openPickerOnEnter(event);
    expect(showPicker).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("leaves ⌘⏎ alone so Run still works from a focused select", () => {
    const showPicker = vi.fn();
    for (const modifier of [{ meta: true }, { ctrl: true }, { alt: true }, { shift: true }]) {
      const { event, preventDefault } = keyEvent(modifier, showPicker);
      openPickerOnEnter(event);
      expect(showPicker).not.toHaveBeenCalled();
      expect(preventDefault).not.toHaveBeenCalled();
    }
  });

  it("ignores every other key", () => {
    const showPicker = vi.fn();
    const { event } = keyEvent({ key: "ArrowDown" }, showPicker);
    openPickerOnEnter(event);
    expect(showPicker).not.toHaveBeenCalled();
  });

  it("stands aside where showPicker is unsupported, leaving Space to work", () => {
    const { event, preventDefault } = keyEvent({}, undefined);
    openPickerOnEnter(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("swallows a showPicker that throws (no user activation)", () => {
    const showPicker = vi.fn(() => {
      throw new Error("NotAllowedError");
    });
    const { event } = keyEvent({}, showPicker);
    expect(() => openPickerOnEnter(event)).not.toThrow();
  });

  it("defers to implicit submission for a select that belongs to a form", () => {
    const showPicker = vi.fn();
    const { event, preventDefault } = keyEvent({ form: {} }, showPicker);
    openPickerOnEnter(event);
    expect(showPicker).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("still opens the picker for a standalone select (form is null)", () => {
    const showPicker = vi.fn();
    const { event, preventDefault } = keyEvent({ form: null }, showPicker);
    openPickerOnEnter(event);
    expect(showPicker).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
