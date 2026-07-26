import { useSyncExternalStore } from "react";
import { getTheme, subscribeTheme } from "./storage";

/**
 * Roadmap 039 — the scheme the app is ACTUALLY painted in, subscribed.
 *
 * Everything else in the app resolves its colors through `light-dark()` over
 * the `color-scheme` the 037 switcher pins on `:root`, so it follows the theme
 * for free. CodeMirror does not: it needs a `theme` prop, a JS value. Before
 * 039 `ConfigEditor` computed that value from
 * `matchMedia("(prefers-color-scheme: dark)")` once per render — the OS, never
 * the switcher, and not even reactive to the OS itself. This hook is the
 * missing bridge: the stored 037 override when there is one, the LIVE OS
 * preference otherwise, and a re-render the moment either changes.
 */
export type Scheme = "light" | "dark";

const OS_DARK = "(prefers-color-scheme: dark)";

function subscribeOsScheme(onChange: () => void): () => void {
  const query = window.matchMedia(OS_DARK);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function osScheme(): Scheme {
  return window.matchMedia(OS_DARK).matches ? "dark" : "light";
}

export function useEffectiveScheme(): Scheme {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  // Subscribed unconditionally: hooks cannot be conditional, and an OS change
  // while an override stands simply resolves to the same value.
  const os = useSyncExternalStore(subscribeOsScheme, osScheme);
  return theme === "auto" ? os : theme;
}
