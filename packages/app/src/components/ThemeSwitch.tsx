import { useSyncExternalStore } from "react";
import { applyTheme, getTheme, persistTheme, subscribeTheme, type Theme } from "@/platform/storage";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

/**
 * Roadmap 037 — the Auto / Light / Dark override, in the header beside the
 * version badge. All the switching happens in `applyTheme` (one
 * `color-scheme` on `:root`); this component only owns which segment is lit
 * and writes the choice through to storage.
 *
 * Roadmap 039: the lit segment now comes from the theme store in storage.ts
 * rather than a local `useState` copy — `applyTheme` is the app's single
 * writer, and the editor's `useEffectiveScheme()` reads the same store, so
 * header and editor can never disagree about which theme is in force.
 */

/** Octicons: half-filled circle (auto), sun (light), moon (dark). */
const ICONS: Record<Theme, string> = {
  auto: "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm0 1.5v13a6.5 6.5 0 0 0 0-13Z",
  light:
    "M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0Zm0 13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13ZM2.343 2.343a.75.75 0 0 1 1.061 0l1.06 1.061a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm9.193 9.193a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 0-1.061ZM16 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8ZM3 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 3 8Zm10.657-5.657a.75.75 0 0 1 0 1.061l-1.061 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0Zm-9.193 9.193a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0Z",
  dark: "M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Zm1.616 1.945a7 7 0 0 1-7.678 7.678 5.499 5.499 0 1 0 7.678-7.678Z",
};

/** A segment's face: the theme's icon and its word. The icon is decoration —
 *  the segment's own `aria-label` carries the name. */
function ThemeLabel({ theme, label }: { theme: Theme; label: string }) {
  return (
    <>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d={ICONS[theme]} />
      </svg>
      {label}
    </>
  );
}

const OPTIONS: readonly SegmentedOption<Theme>[] = [
  {
    value: "auto",
    label: <ThemeLabel theme="auto" label="Auto" />,
    ariaLabel: "Auto",
    title: "Follow the system theme",
  },
  {
    value: "light",
    label: <ThemeLabel theme="light" label="Light" />,
    ariaLabel: "Light",
    title: "Light theme",
  },
  {
    value: "dark",
    label: <ThemeLabel theme="dark" label="Dark" />,
    ariaLabel: "Dark",
    title: "Dark theme",
  },
];

export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);

  return (
    <SegmentedControl
      className="theme-switch"
      label="Color theme"
      value={theme}
      options={OPTIONS}
      onChange={(next) => {
        applyTheme(next);
        persistTheme(next);
      }}
    />
  );
}
