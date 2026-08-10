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
  readonly shift: boolean;
  /** What it does, in the imperative — used in `title` text and the hint. */
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
  if (event.shiftKey !== shortcut.shift) {
    return false;
  }
  const mod = event.metaKey || event.ctrlKey;
  return mod === shortcut.mod;
}
