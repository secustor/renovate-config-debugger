/**
 * Roadmap 033 — every localStorage/sessionStorage touch goes through here.
 *
 * Storage can be entirely unavailable (Safari private windows historically,
 * cookie-blocking modes, embedded webviews, corporate lockdowns) and then any
 * bare `localStorage.getItem` THROWS. Before 033, the 009 token migration ran
 * at module scope, so a storage-disabled browser died before `createRoot()` —
 * a blank page instead of a degraded-but-working app. These wrappers turn
 * every failure into "the value isn't there" (get → null) or "the write
 * didn't stick" (set/remove → no-op): exactly the behavior the app already
 * has for a value that was never stored, so no caller needs a special path.
 */
import { HOST_TOKENS } from "./host-tokens";

/** localStorage keys for the non-secret platform context (see readLocal). */
export const PLATFORM_KEY = "rcv.platform";
export const ENDPOINT_KEY = "rcv.endpoint";
/** Roadmap 037 — the explicit color-theme override. */
export const THEME_KEY = "rcv.theme";

export function localGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function localSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage disabled/full: the value simply doesn't persist.
  }
}

export function localRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage disabled: nothing was stored to remove.
  }
}

export function sessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function sessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage disabled/full: the value simply doesn't persist.
  }
}

export function sessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage disabled: nothing was stored to remove.
  }
}

/** Non-secret settings (platform/endpoint) persist across tabs → localStorage.
 *  Roadmap 030: a value that fails `isValid` is silently reset to the
 *  default and the bad stored value is removed — storage can drift across
 *  app versions or be hand-edited, and it must never poison every later run. */
export function readLocal(key: string, fallback: string, isValid: (v: string) => boolean): string {
  const raw = localGet(key);
  if (raw === null) {
    return fallback;
  }
  if (isValid(raw)) {
    return raw;
  }
  localRemove(key);
  return fallback;
}

export function persistLocal(key: string, value: string): void {
  if (value) {
    localSet(key, value);
  } else {
    localRemove(key);
  }
}

/** Per-host tokens are secrets → sessionStorage (cleared when the tab closes).
 *  Roadmap 030: same silent-fallback-and-remove rule as {@link readLocal}. */
export function readSession(
  key: string,
  fallback: string,
  isValid: (v: string) => boolean,
): string {
  const raw = sessionGet(key);
  if (raw === null) {
    return fallback;
  }
  if (isValid(raw)) {
    return raw;
  }
  sessionRemove(key);
  return fallback;
}

export function persistSession(key: string, value: string): void {
  if (value) {
    sessionSet(key, value);
  } else {
    sessionRemove(key);
  }
}

// ---------------------------------------------------------------------------
// Color theme (roadmap 037)
// ---------------------------------------------------------------------------

/** "auto" follows `prefers-color-scheme`, exactly as the app did before 037. */
export type Theme = "auto" | "light" | "dark";

export const THEMES: readonly Theme[] = ["auto", "light", "dark"];

function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

/** The stored override, or "auto". A value that isn't one of the three is
 *  dropped and treated as "auto" — the roadmap 030 rule for every stored
 *  setting: storage drifts across app versions and must never poison a run. */
export function readTheme(): Theme {
  const raw = readLocal(THEME_KEY, "auto", isTheme);
  return isTheme(raw) ? raw : "auto";
}

/** "auto" stores nothing — absence IS the default, so a cleared key can never
 *  read back as an override. */
export function persistTheme(theme: Theme): void {
  persistLocal(THEME_KEY, theme === "auto" ? "" : theme);
}

/**
 * The whole switching mechanism: the app is 100 % `light-dark()` over
 * `color-scheme: light dark` on `:root`, so pinning `color-scheme` to one
 * keyword re-resolves every token — no second stylesheet, no class per
 * component. "auto" removes the inline value, handing the choice back to the
 * `:root` rule (and thus the OS). Called from main.tsx BEFORE `createRoot()`
 * so the first paint is already in the chosen scheme.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.style.colorScheme = theme === "auto" ? "" : theme;
}

// ---------------------------------------------------------------------------
// One-time storage migrations
// ---------------------------------------------------------------------------

/** The stored-schema version marker. Absent/invalid = version 0 (a fresh
 *  browser, or one that predates the marker). */
const STORAGE_VERSION_KEY = "rcv.v";

/**
 * Migration i upgrades stored-schema version i → i+1; the marker records how
 * many have been applied, so each runs ONCE ever (pre-033 the 009 loop below
 * reran on every page load forever, because the keys were unversioned) and a
 * future migration is one entry appended here.
 */
const STORAGE_MIGRATIONS: readonly (() => void)[] = [
  // v0 → v1 (roadmap 009): the four PAT fields move from localStorage to
  // sessionStorage. Copy any legacy value across (without clobbering a
  // session value) and drop the localStorage copy. Runs before the App
  // component reads its initial state (see main.tsx). platform/endpoint
  // stay in localStorage.
  () => {
    for (const { storageKey } of HOST_TOKENS) {
      const legacy = localGet(storageKey);
      if (legacy !== null) {
        if (sessionGet(storageKey) === null) {
          sessionSet(storageKey, legacy);
        }
        localRemove(storageKey);
      }
    }
  },
];

/**
 * Applies every not-yet-applied migration, then advances the marker. Called
 * from main.tsx before `createRoot()` — the migrations must have run before
 * the App's `useState` initializers read storage. Guarded by its own
 * try/catch on top of the safe primitives: a storage-disabled browser must
 * reach `createRoot()` no matter what, never white-screen here (in that state
 * the marker cannot persist either, so the migrations retry next load — each
 * is a no-op against unreadable storage).
 */
export function runStorageMigrations(): void {
  try {
    const raw = localGet(STORAGE_VERSION_KEY);
    const from = raw !== null && /^\d+$/.test(raw) ? Number(raw) : 0;
    for (let v = from; v < STORAGE_MIGRATIONS.length; v++) {
      STORAGE_MIGRATIONS[v]?.();
    }
    // Never moves the marker backwards (a marker from a NEWER app version
    // stays, so going back and forth doesn't replay its migrations).
    if (from < STORAGE_MIGRATIONS.length) {
      localSet(STORAGE_VERSION_KEY, String(STORAGE_MIGRATIONS.length));
    }
  } catch {
    // A failed migration must never block rendering the app.
  }
}
