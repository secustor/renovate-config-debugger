import { afterEach, describe, expect, it, vi } from "vitest";
import { RESULTS_TAB_IDS } from "@/data/results-tabs";
import {
  anyModifierHeld,
  commandModifierHeld,
  FOCUS_EDITOR_SHORTCUT,
  FOCUS_RESULTS_SHORTCUT,
  formatShortcut,
  GLOBAL_SHORTCUTS,
  HELP_SHORTCUT,
  isApplePlatform,
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

describe("the modifier predicates", () => {
  it("agrees on ⌘, Ctrl and Alt", () => {
    for (const held of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      expect(commandModifierHeld(chord(held))).toBe(true);
      expect(anyModifierHeld(chord(held))).toBe(true);
    }
    expect(commandModifierHeld(chord())).toBe(false);
    expect(anyModifierHeld(chord())).toBe(false);
  });

  it("parts company over Shift, which is the point of having two", () => {
    // A named key (the tab strip's arrows, Home/End) must decline Shift, which
    // means "extend the selection". A key identified by the CHARACTER it
    // produced must allow it: `?` is Shift+/ on a US layout, and `1`–`7` are
    // shifted keys on AZERTY.
    const shifted = chord({ shiftKey: true });
    expect(anyModifierHeld(shifted)).toBe(true);
    expect(commandModifierHeld(shifted)).toBe(false);
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

  it("rejects a held Shift+E / Shift+R, unlike the shift-agnostic `?`", () => {
    // A held Shift produces the shifted glyph AND `shiftKey: true` — either
    // signal alone would reject this, but `shift: false` is what does it.
    expect(matchShortcut(chord({ key: "e" }), FOCUS_EDITOR_SHORTCUT)).toBe(true);
    expect(matchShortcut(chord({ key: "E", shiftKey: true }), FOCUS_EDITOR_SHORTCUT)).toBe(false);
    expect(matchShortcut(chord({ key: "r" }), FOCUS_RESULTS_SHORTCUT)).toBe(true);
    expect(matchShortcut(chord({ key: "R", shiftKey: true }), FOCUS_RESULTS_SHORTCUT)).toBe(false);
  });

  it("rejects a Caps-Lock-on `E` / `R`, whose event carries shiftKey: false", () => {
    // The Caps Lock event shape: the glyph is uppercase but `shiftKey` is
    // false, since no Shift is actually held. `shift: false` alone reads that
    // as a match (`event.shiftKey === shortcut.shift`) — it is the key
    // comparison going case-sensitive that has to reject it instead.
    expect(matchShortcut(chord({ key: "E", shiftKey: false }), FOCUS_EDITOR_SHORTCUT)).toBe(false);
    expect(matchShortcut(chord({ key: "R", shiftKey: false }), FOCUS_RESULTS_SHORTCUT)).toBe(false);
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
    // DERIVED from the tab list, not frozen: 062 renames `Simulator` and
    // inserts `Extraction`, and the sheet is the app's only keyboard
    // documentation — a hardcoded "1 – 7" would leave `8` working and
    // undocumented. 9 is where `digitTabIndex` itself stops.
    const lastDigit = Math.min(RESULTS_TAB_IDS.length, 9);
    expect(rows.some((row) => row.keys === `1 – ${lastDigit}`)).toBe(true);
  });
});

describe("isApplePlatform", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the un-deprecated source when it answers", () => {
    vi.stubGlobal("navigator", { userAgentData: { platform: "macOS" }, platform: "Win32" });
    expect(isApplePlatform()).toBe(true);
  });

  it("falls back to navigator.platform where userAgentData is absent (Safari, Firefox)", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(isApplePlatform()).toBe(true);
  });

  it("reads an EMPTY platform as no answer, not as an answer", () => {
    // `??` would take "" as the newer source having spoken and never ask the
    // older one, which is the only one that knows.
    vi.stubGlobal("navigator", { userAgentData: { platform: "" }, platform: "MacIntel" });
    expect(isApplePlatform()).toBe(true);
  });

  it("says no when nothing reports an Apple platform", () => {
    vi.stubGlobal("navigator", { userAgentData: { platform: "Linux" }, platform: "Linux x86_64" });
    expect(isApplePlatform()).toBe(false);
  });
});

describe("the overlay exemption", () => {
  it("is `?` and nothing else", () => {
    // `useShortcut` reads this flag instead of testing the id, so the exemption
    // is visible where the binding is defined. It exists because the session
    // menu prints "Press ? any time" on one of its own rows, and the bare-key
    // overlay gate made that a promise the app broke; the jump keys, which move
    // the page under the layer the reader is looking at, keep the gate.
    expect(HELP_SHORTCUT.firesUnderOverlay).toBe(true);
    expect(GLOBAL_SHORTCUTS.filter((shortcut) => shortcut.firesUnderOverlay)).toEqual([
      HELP_SHORTCUT,
    ]);
  });
});
