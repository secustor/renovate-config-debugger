import { createPortal } from "react-dom";

/**
 * Roadmap 054 (layer 4): the way back. A thread's own jumps — the step link
 * into the demoted replay, the popover's "open in matched rules" — are the only
 * navigation variant A has, and both land the reader somewhere the thread they
 * came from is off-screen. This pill sits on the app's existing bottom-pill
 * plane (`.back-to-top` / `.rcv-toast`) naming that thread, and returns to it:
 * expanded, scrolled to, flashed.
 *
 * Ephemeral by construction — a click, a new run or Escape ends it — and NEVER
 * encoded in a share link: a link says where to look, not that the reader once
 * walked away from a row.
 *
 * Portalled to `<body>` for the same reason the rule-evidence popover is: a
 * `position: fixed` box rendered inside the results column is re-anchored by
 * any ancestor that gains containment (035), and the stale-run veil it would
 * live under is exactly such an ancestor waiting to happen.
 *
 * It lives in features/simulator rather than components/ because nothing about
 * it is app-generic: the label IS a thread key, and the plane it borrows is
 * already shared through CSS, which is where that sharing belongs.
 */
export function ReturnPill({
  threadKey,
  onReturn,
  onFocusFrom,
}: {
  threadKey: string;
  onReturn: () => void;
  /** Roadmap 068 review: Escape's landing needs to know which stop the user
   *  reached this pill from, and this is the element that knows — a `focusin`
   *  names its predecessor, a blur says the answer has expired. Reporting it
   *  here is what let `useThreadNav` stop watching the whole document's focus
   *  moves to work it out. */
  onFocusFrom: (from: EventTarget | null) => void;
}) {
  return createPortal(
    <button
      type="button"
      className="sim-return-pill"
      onClick={onReturn}
      onFocus={(e) => onFocusFrom(e.relatedTarget)}
      onBlur={() => onFocusFrom(null)}
      aria-label={`Back to ${threadKey}`}
    >
      ↩ Back to <code>{threadKey}</code>
    </button>,
    document.body,
  );
}
