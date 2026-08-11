/**
 * Roadmap 067: the keyboard shortcut registry — one source of truth for what a
 * binding IS (so a handler and the hint printed on the control it duplicates
 * can never drift), and the two pure functions around it: does this event match
 * it, and how is it spelled on this platform.
 *
 * DOM-free by design (`matchShortcut` takes the four modifier flags, which a
 * real `KeyboardEvent` satisfies structurally), so it unit-tests in the `unit`
 * project without jsdom.
 */

import { RESULTS_TAB_IDS } from "@/data/results-tabs";

export interface Shortcut {
  readonly id: string;
  /**
   * Compared against `KeyboardEvent.key`. Lowercase-insensitively for named
   * keys (`Enter`) and punctuation (`?`), which never change case; case-
   * SENSITIVELY for a single letter with `shift` pinned to a boolean, because
   * that is the only way to reject a Caps-Lock-produced uppercase letter —
   * see `matchShortcut`.
   */
  readonly key: string;
  /** ⌘ on Apple platforms, Ctrl elsewhere — see `matchShortcut`. */
  readonly mod: boolean;
  /**
   * `undefined` = don't care, which is what a punctuation key needs: `?` is
   * Shift+/ on a US layout and an unshifted key on others, so requiring either
   * value would break one of them.
   */
  readonly shift?: boolean;
  /** What it does, in the imperative — used in `title` text and the sheet. */
  readonly label: string;
  /**
   * Fires even while a popover or menu covers the page — the gate `useShortcut`
   * otherwise applies to every bare key (`overlayKeyboardOwned()`).
   *
   * Roadmap 067 review: that gate is right for the JUMP keys, which MOVE the
   * page under a layer the reader is looking at — `2` beneath a rule-evidence
   * card left it explaining a rule no longer on screen. Help is a different kind
   * of key: it opens a modal that claims the keyboard outright, so nothing
   * shifts underneath, and "how do I use this" is exactly the question of
   * someone stuck under an open layer. The session menu's own row advertises
   * `?`, so suppressing it there made the app break a promise it had printed one
   * line above the key.
   *
   * Declared on the ENTRY, not tested by id in the hook, so the exemption is
   * visible where the binding is defined. It never exempts anything from
   * `isTextEditingTarget`: `?` is a character a user can be in the middle of
   * typing.
   */
  readonly firesUnderOverlay?: boolean;
}

/** The event shape `matchShortcut` needs; `KeyboardEvent` satisfies it. */
export interface KeyChord {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** The app's one global verb. Bound twice — a window listener for the page,
 *  and a high-precedence DOM handler inside the editor that has to outrank
 *  `insertBlankLine` (see `run-keymap.ts`). Both match through
 *  `matchShortcut`, so the two cannot drift apart. */
export const RUN_SHORTCUT: Shortcut = {
  id: "run",
  key: "Enter",
  mod: true,
  shift: false,
  label: "Run the pipeline",
};

/** Run AND go read it. `RUN_SHORTCUT` deliberately leaves focus alone (a share
 *  link can start a run nobody asked for); this is the explicit opt-in. */
export const RUN_AND_READ_SHORTCUT: Shortcut = {
  id: "run-and-read",
  key: "Enter",
  mod: true,
  shift: true,
  label: "Run, then jump to the results",
};

/**
 * The bare-key jump layer. Bare because the modified space is a minefield —
 * ⌘⇧E is Firefox's network panel, ⌘⇧C/I/J are devtools, ⌘⇧G is find-previous —
 * while single letters are free and are what every keyboard-first web app
 * (GitHub, Gmail, Linear) already trained users to expect. Safe only because
 * `useShortcut` refuses to fire a bare key while the user is typing, and
 * `isTextEditingTarget` counts a focused `<select>` as typing, so these never
 * eat its type-ahead either.
 */
export const FOCUS_EDITOR_SHORTCUT: Shortcut = {
  id: "focus-editor",
  key: "e",
  mod: false,
  // Unlike `?`, `e` has an unshifted meaning on every layout, so Shift+E is
  // deliberately a different keystroke — and so is a Caps-Lock-on `E`. Both
  // produce `event.key: "E"`, only one holds Shift, so `shift: false` alone
  // cannot tell them apart; what does is that `matchShortcut` compares a
  // single-letter key CASE-SENSITIVELY once `shift` is pinned, so the
  // uppercase "E" Caps Lock produces fails the key check outright. A
  // Caps-Lock-on `R` must not yank a user reading results into the tab strip.
  shift: false,
  label: "Jump to the config editor",
};

export const FOCUS_RESULTS_SHORTCUT: Shortcut = {
  id: "focus-results",
  key: "r",
  mod: false,
  shift: false,
  label: "Jump to the results",
};

export const HELP_SHORTCUT: Shortcut = {
  id: "help",
  key: "?",
  mod: false,
  // The one binding that survives an open menu or popover — see
  // `firesUnderOverlay`. The session menu prints "Press ? any time".
  firesUnderOverlay: true,
  label: "Show this list",
};

/**
 * Every GLOBAL binding, in the order the shortcut sheet lists them. The sheet
 * is built from this array, so a binding cannot be added without appearing
 * there — the rule 067 set for itself when it deferred the sheet.
 */
export const GLOBAL_SHORTCUTS: readonly Shortcut[] = [
  RUN_SHORTCUT,
  RUN_AND_READ_SHORTCUT,
  FOCUS_EDITOR_SHORTCUT,
  FOCUS_RESULTS_SHORTCUT,
  HELP_SHORTCUT,
];

/**
 * Whether ⌘ is this keyboard's modifier. `userAgentData.platform` is the
 * un-deprecated source and is absent in Safari/Firefox, where `navigator.
 * platform` still answers — neither is spoof-proof, and neither has to be: the
 * cost of guessing wrong is a hint that reads `Ctrl+Enter` on a Mac, because
 * `matchShortcut` accepts either modifier regardless of what this returns.
 */
export function isApplePlatform(): boolean {
  const nav: Navigator & { userAgentData?: { platform?: string } } = navigator;
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const APPLE_KEY_GLYPHS: Record<string, string> = {
  Enter: "⏎",
  Escape: "⎋",
};

/**
 * The binding as a human reads it: `⌘⏎` on Apple (glyphs, no separators — the
 * platform convention), `Ctrl+Enter` everywhere else. The platform is a
 * parameter so the unit tests can assert both spellings.
 */
export function formatShortcut(shortcut: Shortcut, apple = isApplePlatform()): string {
  const parts: string[] = [];
  if (shortcut.mod) {
    parts.push(apple ? "⌘" : "Ctrl");
  }
  if (shortcut.shift) {
    parts.push(apple ? "⇧" : "Shift");
  }
  parts.push(apple ? (APPLE_KEY_GLYPHS[shortcut.key] ?? shortcut.key) : shortcut.key);
  return parts.join(apple ? "" : "+");
}

/**
 * Deliberately accepts EITHER ⌘ or Ctrl for `mod`, on every platform. The
 * alternative — branch on `isApplePlatform()` — makes the primary action of
 * the app fail for anyone whose platform detection guessed wrong (a Mac
 * keyboard on Linux, a browser that reports nothing), and there is no shortcut
 * in this app that means one thing with ⌘ and another with Ctrl for the
 * ambiguity to matter. Alt never participates: it is how the OS composes
 * characters, and swallowing it would break typing in a text field.
 *
 * The key comparison's case sensitivity depends on the key itself. Named keys
 * (`Enter`, `Escape`) never change case, whoever is holding Shift or however
 * Caps Lock is set, so they always compare lowercase-insensitively. A single
 * letter is the one shape Caps Lock or Shift can re-case, and for one of
 * those WITH `shift` pinned to a boolean the compare goes case-SENSITIVE —
 * `event.shiftKey` alone can't reject Caps Lock, because a Caps-Lock-on `R`
 * arrives as `key: "R", shiftKey: false`, which satisfies `shift: false` on
 * its own. Comparing the key too catches that: the uppercase glyph fails to
 * match a lowercase-only binding regardless of which key produced it.
 */
export function matchShortcut(event: KeyChord, shortcut: Shortcut): boolean {
  const caseSensitive = shortcut.shift !== undefined && shortcut.key.length === 1;
  const keyMatches = caseSensitive
    ? event.key === shortcut.key
    : event.key.toLowerCase() === shortcut.key.toLowerCase();
  if (!keyMatches) {
    return false;
  }
  if (event.altKey) {
    return false;
  }
  if (shortcut.shift !== undefined && event.shiftKey !== shortcut.shift) {
    return false;
  }
  const mod = event.metaKey || event.ctrlKey;
  return mod === shortcut.mod;
}

/** One printed row of the shortcut sheet. */
export interface ShortcutRow {
  readonly keys: string;
  readonly what: string;
}

export interface ShortcutSection {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

/**
 * The whole keyboard surface, as the `?` sheet prints it.
 *
 * The first section is DERIVED from `GLOBAL_SHORTCUTS`, so a global binding
 * cannot exist without a row. The rest are contextual keys that belong to a
 * widget rather than to a registry entry — native form behavior, CodeMirror's
 * own keymap, the ARIA tablist pattern — written out here because they are
 * real keys the user can press and nowhere else documents them.
 */
export function shortcutSheet(apple = isApplePlatform()): ShortcutSection[] {
  const mod = apple ? "⌘" : "Ctrl";
  const join = apple ? "" : "+";
  // Roadmap 067 review: DERIVED, never written out. `useTabDigits` is wired to
  // the live tab count and `roving-tabs.ts` forbids a frozen digit-to-tab map
  // for the same reason — 062 renames `Simulator` and inserts `Extraction`, and
  // a hardcoded "1 – 7" would then leave `8` working while the app's only
  // keyboard documentation said the range stopped at 7. Clamped at 9 because
  // that is where `digitTabIndex` stops: a tenth tab has no digit to print.
  const lastTabDigit = Math.min(RESULTS_TAB_IDS.length, 9);
  return [
    {
      title: "Anywhere",
      rows: [
        ...GLOBAL_SHORTCUTS.map((shortcut) => ({
          keys: formatShortcut(shortcut, apple),
          what: shortcut.label,
        })),
        { keys: `1 – ${lastTabDigit}`, what: "Jump straight to that results tab" },
        // Roadmap 067 review: this is NOT true inside a text field, a
        // <select>, or the results tab strip — `isTextEditingTarget` bails
        // `useHomeEndPageScroll` on the first, and the strip claims the key
        // for its own first/last-tab behavior (see the Results section
        // below). "Anywhere" here means "everywhere else", the same
        // qualifier the bare `e`/`r`/`?` rows above already carry.
        { keys: "Home / End", what: "Scroll the page to top / bottom (outside a field)" },
      ],
    },
    {
      title: "Results",
      rows: [
        { keys: "← →", what: "Move between tabs" },
        { keys: "Home / End", what: "First / last tab" },
        { keys: "Escape", what: "Dismiss the topmost popover, menu or pill" },
      ],
    },
    {
      title: "Config editor",
      rows: [
        { keys: "Tab", what: "Leave the editor (it does not indent)" },
        { keys: `${mod}${join}]`, what: "Indent" },
        { keys: `${mod}${join}[`, what: "Outdent" },
        { keys: `${mod}${join}F`, what: "Search the config" },
        { keys: `${mod}${join}Z`, what: "Undo" },
      ],
    },
    {
      title: "Forms",
      rows: [
        { keys: "Enter", what: "Submit — simulate, or load the repo config" },
        // A <select> inside a form (like the simulator's updateType picker)
        // defers Enter to that same implicit submission instead — see
        // `select-picker.ts`. This row is only true of a standalone select.
        { keys: "Enter", what: "Open a dropdown, for a select outside a form" },
        // Roadmap 067 review: the row above is NOT true of the simulator's
        // `datasource` / `manager` comboboxes, where Enter is how the native
        // suggestion list is accepted — `SimulatorForm` declines implicit
        // submission there rather than let one key mean both things.
        {
          keys: "Enter",
          what: "Take the suggestion, in a type-to-search field — it does not submit",
        },
      ],
    },
  ];
}
