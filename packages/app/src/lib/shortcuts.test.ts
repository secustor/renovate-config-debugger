import { describe, expect, it } from "vitest";
import {
  codeMirrorKey,
  formatShortcut,
  type KeyChord,
  matchShortcut,
  RUN_SHORTCUT,
} from "./shortcuts";

/**
 * Roadmap 067 — the shortcut registry's three pure functions. What is worth
 * pinning here is the deliberate leniency of `matchShortcut` (either modifier,
 * on every platform) and the fact that the CodeMirror spelling is DERIVED, not
 * written twice: the editor's keymap and the page listener drifting apart is
 * precisely the bug that would make ⌘⏎ insert a blank line again.
 */

function chord(overrides: Partial<KeyChord> = {}): KeyChord {
  return {
    key: "Enter",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

describe("matchShortcut", () => {
  it("accepts either ⌘ or Ctrl for the Run chord", () => {
    expect(matchShortcut(chord({ metaKey: true }), RUN_SHORTCUT)).toBe(true);
    expect(matchShortcut(chord({ ctrlKey: true }), RUN_SHORTCUT)).toBe(true);
  });

  it("rejects the unmodified key, so plain Enter still belongs to forms", () => {
    expect(matchShortcut(chord(), RUN_SHORTCUT)).toBe(false);
  });

  it("rejects extra modifiers", () => {
    expect(matchShortcut(chord({ metaKey: true, shiftKey: true }), RUN_SHORTCUT)).toBe(false);
    // Alt composes characters — swallowing it would break typing.
    expect(matchShortcut(chord({ metaKey: true, altKey: true }), RUN_SHORTCUT)).toBe(false);
  });

  it("rejects a different key", () => {
    expect(matchShortcut(chord({ key: "Escape", metaKey: true }), RUN_SHORTCUT)).toBe(false);
  });

  it("compares the key case-insensitively", () => {
    const lower = { ...RUN_SHORTCUT, key: "enter" };
    expect(matchShortcut(chord({ metaKey: true }), lower)).toBe(true);
  });
});

describe("formatShortcut", () => {
  it("uses Apple glyphs with no separators", () => {
    expect(formatShortcut(RUN_SHORTCUT, true)).toBe("⌘⏎");
  });

  it("spells the chord out everywhere else", () => {
    expect(formatShortcut(RUN_SHORTCUT, false)).toBe("Ctrl+Enter");
  });

  it("includes shift when the binding wants it", () => {
    const shifted = { ...RUN_SHORTCUT, shift: true };
    expect(formatShortcut(shifted, true)).toBe("⌘⇧⏎");
    expect(formatShortcut(shifted, false)).toBe("Ctrl+Shift+Enter");
  });
});

describe("codeMirrorKey", () => {
  it("derives the editor keymap's spelling from the same entry", () => {
    expect(codeMirrorKey(RUN_SHORTCUT)).toBe("Mod-Enter");
    expect(codeMirrorKey({ ...RUN_SHORTCUT, shift: true })).toBe("Mod-Shift-Enter");
  });
});
