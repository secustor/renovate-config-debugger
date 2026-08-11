import { useEffect, useMemo, useRef } from "react";
import { claimModalKeyboard } from "@/lib/escape-stack";
import { FOCUSABLE_SELECTOR } from "@/lib/focusable";
import { tookFocus } from "@/lib/focus-restore";
import { type ShortcutRow, type ShortcutSection, shortcutSheet } from "@/lib/shortcuts";

/**
 * Roadmap 067 tier 1: the `?` sheet.
 *
 * 067 deferred this deliberately — with three bindings, the `<kbd>` on the Run
 * button and the `title` attributes were the whole visible surface. Tier 1
 * takes the count past ten, which is the threshold that document set for
 * itself, so the sheet ships in the same change as the bindings it lists.
 *
 * A native `<dialog>` opened with `showModal()`, because it brings the two
 * things a hand-rolled overlay gets wrong: a real focus trap, and inertness for
 * everything behind it. Escape is the dialog's own (`cancel`) rather than the
 * 067 Escape ladder — a modal dialog IS the topmost layer, and the browser
 * already knows that. The page's key layers have to be told, though: `inert`
 * does not reach a document- or window-level listener, so the sheet declares
 * that a modal owns the keyboard for as long as it is up (see
 * `claimModalKeyboard`, which the ladder and the 016 Home/End page scroll both
 * read), the same way every other page-level key is gated on App's `keysLive`.
 * Home/End matter here in particular: these rows overflow the sheet's own
 * `max-height` box, so they are the keys that scroll it.
 */

/**
 * Page landmarks bound how far the ancestor fallback below is allowed to
 * climb. Past one of these, "the nearest surviving ancestor" stops meaning
 * "near where the sheet was opened from" — `<main>` is the worst case:
 * its first focusable descendant is the "Skip to the config editor" link,
 * the page's very first tab stop, which is exactly the top-of-the-page
 * landing this fallback exists to avoid.
 */
const LANDMARK_TAGS = new Set(["MAIN", "HEADER", "NAV", "FOOTER", "ASIDE"]);

/**
 * The opener, plus every ancestor it had at the moment the sheet opened, up to
 * (but not including) `<body>`.
 *
 * The plain `document.activeElement` is not enough on its own: press `?` with
 * the session menu open and focus is on a menu ITEM, `showModal()` then moves
 * focus into the dialog, and that `focusin` is what tells the menu to close —
 * so by the time the sheet restores, the element it captured has been unmounted
 * along with the panel around it. Recording the chain while it is still intact
 * gives the fallback something real to aim at: the nearest ancestor that
 * outlived the opener (for the menu, the `<span class="session-menu">` holding
 * its trigger), which is as close to "where the user was" as this component can
 * know without reaching into a surface that is not its business.
 */
function focusChain(from: Element | null): HTMLElement[] {
  const chain: HTMLElement[] = [];
  for (let el = from; el instanceof HTMLElement && el !== document.body; el = el.parentElement) {
    chain.push(el);
  }
  return chain;
}

/**
 * Focuses the opener if it is still there AND still able to take focus — the
 * normal path, and the only one that hands focus back to the exact control the
 * sheet was opened from, whatever kind of element it is. The fallback path
 * below is a selector (`FOCUSABLE_SELECTOR`), so it can only find *something*
 * focusable in the nearest surviving ancestor, not necessarily the opener's
 * own kind of control.
 *
 * Every candidate — the opener included — is checked after the call rather
 * than assumed (see `tookFocus`), so a refusal moves on instead of ending the
 * restore with focus still on `<body>` and the user's next Tab restarting at
 * the skip link. That is also why each ancestor is searched exhaustively: the
 * element that refused is usually the ancestor's FIRST match, and the control
 * next to it is the closest place left worth landing.
 *
 * The climb stops at the first page landmark rather than searching inside
 * it — a landmark's first focusable descendant belongs to whatever section it
 * is, not to wherever the sheet was opened from, so beyond that point there
 * is nothing left worth guessing at. Silent in both gaps — nothing took focus
 * below a landmark, or nothing took it at all — because leaving focus alone is
 * honest and the top of the page is not.
 */
function restoreFocus(chain: readonly HTMLElement[]): void {
  const [opener, ...ancestors] = chain;
  if (opener?.isConnected === true && tookFocus(opener)) {
    return;
  }
  for (const el of ancestors) {
    if (LANDMARK_TAGS.has(el.tagName)) {
      return;
    }
    if (!el.isConnected) {
      continue;
    }
    for (const target of el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
      if (tookFocus(target)) {
        return;
      }
    }
  }
}

/** Whether a point sits outside `box` — the shared test for both ends of a
 *  backdrop gesture, so the mousedown and click handlers below read one
 *  definition of "outside" rather than two that could drift. */
function isOutside(box: DOMRect, x: number, y: number): boolean {
  return x < box.left || x > box.right || y < box.top || y > box.bottom;
}

function SheetRow({ row }: { row: ShortcutRow }) {
  return (
    <div className="shortcut-row">
      <kbd className="shortcut-keys">{row.keys}</kbd>
      <span>{row.what}</span>
    </div>
  );
}

function SheetSection({ section }: { section: ShortcutSection }) {
  return (
    <section className="shortcut-section">
      <h3>{section.title}</h3>
      {section.rows.map((row) => (
        <SheetRow key={`${row.keys}-${row.what}`} row={row} />
      ))}
    </section>
  );
}

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sections = useMemo(() => shortcutSheet(), []);
  // Set on `mousedown`, read on `click` — see the click handler below for why
  // the click's own coordinates are the wrong signal.
  const pressStartedOutsideRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    // Whatever the sheet was opened from — the results tab under `?`, the
    // session-menu item under the pointer. The browser restores it when IT
    // closes the dialog (the Escape path), but the Close button and the
    // backdrop unmount this component first, so React removes the element
    // before the cleanup below can call `close()` and focus lands on <body>:
    // the user's next Tab restarts at the skip link. 067's rule is that a
    // layer which closes hands focus back, so do it here for all three paths —
    // and through the ancestor chain, because the opener itself may not be
    // there any more (see `focusChain`).
    const chain = focusChain(document.activeElement);
    dialog?.showModal();
    const release = claimModalKeyboard();
    return () => {
      release();
      dialog?.close();
      restoreFocus(chain);
    };
  }, []);

  return (
    <dialog
      className="shortcut-sheet"
      ref={dialogRef}
      aria-label="Keyboard shortcuts"
      onCancel={onClose}
      // A click on the backdrop lands on the dialog element itself — but so
      // does one on its padding band, which is part of the element's own box,
      // so `e.target === dialog` would close the sheet on a click in the inner
      // margin. The rect is the real boundary; it also spares a click on the
      // dialog's own scrollbar.
      //
      // The PRESS end of the gesture has to be read on `mousedown`, not on the
      // `click` that follows it. A user drag-selecting a shortcut row's text to
      // copy it releases the mouse wherever the selection ends, which is often
      // past the sheet's edge — the browser dispatches `click` on the nearest
      // common ancestor of press and release (the dialog) with the RELEASE
      // coordinates, so reading only the click's own coordinates would read a
      // text selection released outside as a backdrop dismissal.
      //
      // But the press location alone is not the whole story either: the
      // reverse drag — press a few pixels outside the sheet's rounded border
      // (easy when reaching for the first row) and drag onto a row before
      // releasing — starts outside and ends inside, and that is a read, not a
      // dismissal. A light-dismiss backdrop click has to be outside at BOTH
      // ends, so `click`'s own coordinates (the release point) get the same
      // `isOutside` test the mousedown handler already runs.
      onMouseDown={(e) => {
        const box = dialogRef.current?.getBoundingClientRect();
        pressStartedOutsideRef.current = box !== undefined && isOutside(box, e.clientX, e.clientY);
      }}
      // `detail === 0` is a keyboard-synthesized click (Enter/Space on a
      // focused element), which carries no real press to have started
      // anywhere and must not be read as one.
      onClick={(e) => {
        const startedOutside = pressStartedOutsideRef.current;
        pressStartedOutsideRef.current = false;
        if (e.detail === 0 || !startedOutside) {
          return;
        }
        const box = dialogRef.current?.getBoundingClientRect();
        if (box !== undefined && isOutside(box, e.clientX, e.clientY)) {
          onClose();
        }
      }}
    >
      <div className="shortcut-sheet-head">
        <h2>Keyboard shortcuts</h2>
        <button type="button" className="btn quiet" onClick={onClose}>
          Close
        </button>
      </div>
      {sections.map((section) => (
        <SheetSection key={section.title} section={section} />
      ))}
    </dialog>
  );
}
