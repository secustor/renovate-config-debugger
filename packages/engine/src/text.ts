/**
 * Engine-internal prose helpers — the few phrasings more than one engine module
 * needs, so the stage titles and the simulator's summary notes count things the
 * same way.
 *
 * Deliberately NOT on the public barrel (`index.ts`): the app has its own
 * `plural()` and keeps it, because this is a package boundary and a shared
 * one-liner is not worth a dependency edge across it.
 */

/** "1 preset" / "2 presets" — regular English nouns only, which is every noun
 *  the engine pluralizes. */
export function countNoun(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
