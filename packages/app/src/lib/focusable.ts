/**
 * Roadmap 067: what "the first focusable thing inside this element" means,
 * shared by the two surfaces that have to answer it for a region they did not
 * build and cannot enumerate ahead of time — the session menu panel moving
 * focus onto its first item on open, and the shortcut sheet's ancestor
 * fallback picking a landing spot on close.
 *
 * Widened past the original `a[href], button:not([disabled])` to also match
 * the plain form controls this app actually uses elsewhere on the page — the
 * repo-load form and the simulator are bare `<input>` fields (067's own
 * problem statement), and the file-name picker is a `<select>` — so a
 * fallback that only knew about links and buttons would silently give up in
 * front of a perfectly good control, right where `ShortcutSheet`'s own
 * `restoreFocus` comment already admits it "cannot classify" a checkbox.
 * `[tabindex='-1']` stays excluded: it marks a roving-tabindex member (the
 * results tab strip) that arrow keys reach, not Tab, and it is not where an
 * unrelated jump should land. The exclusion is repeated on every clause
 * rather than left as the trailing `[tabindex]` one alone — a selector list is
 * an OR, so a real `<button tabindex="-1">` (every inactive tab in the strip)
 * already matches `button:not([disabled])` on its own and never falls through
 * to the clause that was supposed to reject it.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]:not([tabindex='-1'])",
  "button:not([disabled]):not([tabindex='-1'])",
  "input:not([disabled]):not([tabindex='-1'])",
  "select:not([disabled]):not([tabindex='-1'])",
  "textarea:not([disabled]):not([tabindex='-1'])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");
