import type { KeyProvenance } from "@renovate-config-debugger/engine";

/**
 * Roadmap 058: the effective-config view's own numbers, hoisted out of
 * `EffectiveConfig.tsx`. They were the one derivation trapped inside a
 * component, which meant the CLI's `digest` could only have re-implemented
 * them — and a re-implementation is a second source of truth for a number the
 * Overview paragraph quotes. The component renders these; the CLI imports the
 * same function. Pure and DOM-free, hence `lib/`.
 */

/**
 * Roadmap 016: "did more than one layer touch this key" — NOT "was the value
 * replaced". A concatenating array key (`packageRules`, `labels`, …) touched
 * by several layers is appended to, never overwritten; {@link
 * multiContribBadgeKind} is what picks the accurate word.
 */
export function isOverridden(entry: KeyProvenance): boolean {
  const contributors = entry.chain.filter((s) => !s.noop && s.layer.kind !== "defaults");
  return (
    contributors.length >= 2 ||
    entry.chain.some((s) => s.action === "overwrite" || s.action === "forced")
  );
}

export type MultiContribBadge = "overridden" | "appended" | "merged";

/**
 * Roadmap 016: the badge a multi-contributor row carries, picked from the
 * actual merge actions of the contributing (non-default) steps — calling an
 * appended array "overridden" is actively misleading (the expert persona
 * called this out directly).
 */
export function multiContribBadgeKind(entry: KeyProvenance): MultiContribBadge {
  const contributors = entry.chain.filter((s) => !s.noop && s.layer.kind !== "defaults");
  if (contributors.some((s) => s.action === "overwrite" || s.action === "forced")) {
    return "overridden";
  }
  if (contributors.some((s) => s.action === "shallow-merge" || s.action === "deep-merge")) {
    return "merged";
  }
  // Nothing left but "set" (the first contributor establishing the value) and
  // "concat" (every later contributor appending to it) — this function is only
  // called once `isOverridden` has established there are ≥2 contributors, so
  // nothing here was ever replaced.
  return "appended";
}

/**
 * Roadmap 028/029: the numbers the Effective config tab badge and the Overview
 * digest quote. `overridden` counts only the rows carrying the literal
 * `overridden` badge (a value a later layer really replaced).
 */
export interface EffectiveTally {
  /** Options some layer beyond the defaults set — the rows shown by default. */
  keys: number;
  overridden: number;
  /** Default-only rows, hidden until "show default-only" is ticked. */
  hiddenDefaults: number;
}

/**
 * Roadmap 032: all three numbers in ONE pass over the provenance entries (they
 * used to be three separate filter passes).
 */
export function effectiveTally(entries: Iterable<KeyProvenance>): EffectiveTally {
  let keys = 0;
  let hiddenDefaults = 0;
  let overridden = 0;
  for (const entry of entries) {
    if (entry.isDefaultOnly) {
      hiddenDefaults++;
      continue;
    }
    keys++;
    if (isOverridden(entry) && multiContribBadgeKind(entry) === "overridden") {
      overridden++;
    }
  }
  return { keys, overridden, hiddenDefaults };
}
