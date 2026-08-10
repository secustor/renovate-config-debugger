import { describe, expect, it } from "vitest";
import {
  codeMirrorKey,
  FOCUS_EDITOR_SHORTCUT,
  FOCUS_RESULTS_SHORTCUT,
  formatShortcut,
  GLOBAL_SHORTCUTS,
  HELP_SHORTCUT,
  type KeyChord,
  matchShortcut,
  RUN_AND_READ_SHORTCUT,
  RUN_SHORTCUT,
  shortcutSheet,
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

describe("tier 1 bindings", () => {
  it("separates Run from Run-and-read by Shift alone", () => {
    const plain = chord({ metaKey: true });
    const shifted = chord({ metaKey: true, shiftKey: true });
    expect(matchShortcut(plain, RUN_SHORTCUT)).toBe(true);
    expect(matchShortcut(plain, RUN_AND_READ_SHORTCUT)).toBe(false);
    expect(matchShortcut(shifted, RUN_AND_READ_SHORTCUT)).toBe(true);
    expect(matchShortcut(shifted, RUN_SHORTCUT)).toBe(false);
  });

  it("ignores Shift for `?`, which needs it on some layouts and not others", () => {
    expect(matchShortcut(chord({ key: "?" }), HELP_SHORTCUT)).toBe(true);
    expect(matchShortcut(chord({ key: "?", shiftKey: true }), HELP_SHORTCUT)).toBe(true);
  });

  it("rejects Shift+E / Shift+R (and Caps Lock), unlike the shift-agnostic `?`", () => {
    // `event.key` is already the shifted glyph ("E") when Shift or Caps Lock
    // is down — `shift: false` here is what tells `matchShortcut` to say no.
    expect(matchShortcut(chord({ key: "e" }), FOCUS_EDITOR_SHORTCUT)).toBe(true);
    expect(matchShortcut(chord({ key: "E", shiftKey: true }), FOCUS_EDITOR_SHORTCUT)).toBe(false);
    expect(matchShortcut(chord({ key: "r" }), FOCUS_RESULTS_SHORTCUT)).toBe(true);
    expect(matchShortcut(chord({ key: "R", shiftKey: true }), FOCUS_RESULTS_SHORTCUT)).toBe(false);
  });
});

describe("shortcutSheet", () => {
  it("prints a row for every global binding — the rule 067 set itself", () => {
    const rows = shortcutSheet(true).flatMap((section) => section.rows);
    for (const shortcut of GLOBAL_SHORTCUTS) {
      expect(rows.some((row) => row.what === shortcut.label)).toBe(true);
    }
  });

  it("spells the keys for the platform it is asked about", () => {
    const apple = shortcutSheet(true).flatMap((s) => s.rows.map((r) => r.keys));
    const other = shortcutSheet(false).flatMap((s) => s.rows.map((r) => r.keys));
    expect(apple).toContain("⌘⏎");
    expect(other).toContain("Ctrl+Enter");
  });

  it("documents the digit jump, which has no registry entry of its own", () => {
    const rows = shortcutSheet(true).flatMap((section) => section.rows);
    expect(rows.some((row) => row.keys === "1 – 7")).toBe(true);
  });
});
