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

export interface Shortcut {
  readonly id: string;
  /** Compared against `KeyboardEvent.key`, case-insensitively. */
  readonly key: string;
  /** ⌘ on Apple platforms, Ctrl elsewhere — see `matchShortcut`. */
  readonly mod: boolean;
  /**
   * `undefined` = don't care, which is what a punctuation key needs: `?` is
   * Shift+/ on a US layout and an unshifted key on others, so requiring either
   * value would break one of them.
   */
  readonly shift?: boolean;
  /**
   * Fires even while the user is typing. Modified chords always do — ⌘⏎ has to
   * work from inside the editor, which is the point of it. A BARE key must opt
   * in explicitly, and only F6 does: its whole job is getting out of a text
   * field.
   */
  readonly whileTyping?: boolean;
  /** What it does, in the imperative — used in `title` text and the sheet. */
  readonly label: string;
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
 *  and a CodeMirror keymap that has to outrank `insertBlankLine` inside the
 *  editor (see `run-keymap.ts`). */
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
  label: "Jump to the config editor",
};

export const FOCUS_RESULTS_SHORTCUT: Shortcut = {
  id: "focus-results",
  key: "r",
  mod: false,
  label: "Jump to the results",
};

/**
 * Region cycling. F6 is the platform convention and the one key that works
 * from INSIDE the editor without inventing a chord — at the cost of shadowing
 * the browser's own F6 (address bar / pane cycling) while this page has focus.
 * Deleting this entry and its handler is all it takes to give that back; plain
 * Tab already leaves the editor since 067 untrapped it, so nothing else depends
 * on F6 existing.
 */
export const REGION_NEXT_SHORTCUT: Shortcut = {
  id: "region-next",
  key: "F6",
  mod: false,
  shift: false,
  whileTyping: true,
  label: "Cycle between the config and results panes",
};

export const REGION_PREV_SHORTCUT: Shortcut = {
  id: "region-prev",
  key: "F6",
  mod: false,
  shift: true,
  whileTyping: true,
  label: "Cycle panes backwards",
};

export const HELP_SHORTCUT: Shortcut = {
  id: "help",
  key: "?",
  mod: false,
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
  REGION_NEXT_SHORTCUT,
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
 * The same binding in CodeMirror's keymap spelling (`Mod-Enter`), so an editor
 * keymap and the page listener are derived from ONE entry instead of written
 * out twice. `Mod` is CodeMirror's own platform-conditional modifier, which is
 * exactly what `matchShortcut` accepts.
 */
export function codeMirrorKey(shortcut: Shortcut): string {
  const parts: string[] = [];
  if (shortcut.mod) {
    parts.push("Mod");
  }
  if (shortcut.shift) {
    parts.push("Shift");
  }
  parts.push(shortcut.key);
  return parts.join("-");
}

/**
 * Deliberately accepts EITHER ⌘ or Ctrl for `mod`, on every platform. The
 * alternative — branch on `isApplePlatform()` — makes the primary action of
 * the app fail for anyone whose platform detection guessed wrong (a Mac
 * keyboard on Linux, a browser that reports nothing), and there is no shortcut
 * in this app that means one thing with ⌘ and another with Ctrl for the
 * ambiguity to matter. Alt never participates: it is how the OS composes
 * characters, and swallowing it would break typing in a text field.
 */
export function matchShortcut(event: KeyChord, shortcut: Shortcut): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
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
  return [
    {
      title: "Anywhere",
      rows: [
        ...GLOBAL_SHORTCUTS.map((shortcut) => ({
          keys: formatShortcut(shortcut, apple),
          what: shortcut.label,
        })),
        { keys: "1 – 7", what: "Jump straight to that results tab" },
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
        { keys: "Enter", what: "Open a dropdown when one is focused" },
        { keys: "Home / End", what: "Scroll the page to top / bottom" },
      ],
    },
  ];
}
