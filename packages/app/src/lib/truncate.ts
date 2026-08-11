/**
 * One truncation for the whole app, and a surrogate-safe one.
 *
 * A plain `slice(0, max)` cuts UTF-16 code UNITS, so a cut that lands between
 * the halves of a surrogate pair leaves an orphan half in the string — rendered
 * as U+FFFD, i.e. an emoji turned into a replacement glyph by the very code
 * meant to make the cell readable. Checking the last kept unit is enough (only
 * a trailing HIGH surrogate can be an orphan) and costs nothing on a string of
 * any size, which is why every caller can afford the safe version: the blame
 * ledger's preview (069), the effective config's value cells, the option-docs
 * hover card's default/manager lines.
 *
 * Combining marks and ZWJ sequences are deliberately NOT handled: cutting a
 * grapheme cluster produces a different (still valid) glyph, whereas cutting a
 * surrogate pair produces a broken one — and `Intl.Segmenter` over every cell of
 * a ~90-row table on every keystroke is not a trade this view can make.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const last = text.charCodeAt(max - 1);
  const end = last >= 0xd800 && last <= 0xdbff ? max - 1 : max;
  return `${text.slice(0, end)}…`;
}
