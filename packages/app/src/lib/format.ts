/**
 * The app's number formatting, in one place. `Intl.NumberFormat` construction
 * is the expensive part (locale data lookup), so ONE instance is shared rather
 * than one per module — and, more importantly, so every count in the UI reads
 * the same way: before this existed, half the plural helpers routed the number
 * through a formatter and half interpolated it raw, which is visible the moment
 * a run has four figures of anything.
 */
export const nf = new Intl.NumberFormat();

/**
 * `12 presets` / `1 preset`. Regular English plural — every noun this is asked
 * for happens to take a plain trailing "s", so one helper covers them all.
 *
 * The count is ALWAYS formatted through `nf`; that is the whole reason this is
 * shared rather than re-spelled per surface.
 */
export function plural(n: number, word: string): string {
  return `${nf.format(n)} ${word}${n === 1 ? "" : "s"}`;
}

/** The plural WORD on its own, no count — for the places that print the
 *  number separately (a stat tile whose value is its own element, a sentence
 *  that already formatted the figure). {@link plural} is the one that prints
 *  both. Same regular-English caveat: every noun this is asked for takes a
 *  plain trailing "s".
 *
 *  Here rather than in the preset slice it grew up in: the shared "N more … —
 *  show all" line needs it too, and `components/` may not import a feature. */
export function pluralWord(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
