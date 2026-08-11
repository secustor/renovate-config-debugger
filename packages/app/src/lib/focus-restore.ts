/**
 * Roadmap 068 review: asking an element for focus is not the same as it taking
 * focus, and the gap between the two is a whole class of defect in this app.
 *
 * All seven results tab panels stay mounted and six carry `hidden`
 * (`ResultsPanel`), so a control inside one is still `isConnected`, still
 * matches `FOCUSABLE_SELECTOR` — and still unfocusable, because the `hidden`
 * ancestor makes it so. `.focus()` on it is a silent no-op: `document
 * .activeElement` does not move, and that is the only way to tell from script.
 *
 * Two surfaces have to ask, and both are handing focus BACK to where the user
 * came from — which is exactly the moment the panel underneath may have
 * changed. The `?` sheet restores its opener, and a run finishing while the
 * sheet is up re-selects the results tab, so the panel that opener sits in can
 * go `hidden` beneath it (`components/ShortcutSheet.tsx`). The rule-evidence
 * card restores its anchor, and one of the ways that card CLOSES is its
 * anchor's panel going `hidden`, so the refusal is not an edge case there but
 * one of the dismissals itself (`features/simulator/RuleEvidenceCard.tsx`). A refusal that
 * goes unnoticed ends with focus on `<body>`, where the user's next Tab
 * restarts at the skip link.
 */

/** Asks `el` for focus and reports whether it took it. Never scrolls: this is
 *  focus being restored, not given. */
export function tookFocus(el: HTMLElement): boolean {
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}
