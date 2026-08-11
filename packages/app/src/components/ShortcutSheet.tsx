import { useEffect, useMemo, useRef } from "react";
import { claimModalKeyboard } from "@/lib/escape-stack";
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

/** What is worth landing on inside a surviving ancestor — the same shape
 *  `use-session-menu` uses to put focus on a menu's first item. */
const FOCUSABLE = "a[href], button:not([disabled])";

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
 * Focuses the opener if it is still there — the normal path, and the only one
 * that can hand focus back to a control this component cannot classify (a
 * checkbox, a tree row). Otherwise the first control inside the nearest
 * ancestor that outlived it, stopping at the first page landmark rather than
 * climbing into it — a landmark's first focusable descendant belongs to
 * whatever section it is, not to wherever the sheet was opened from, so
 * beyond that point there is nothing left worth guessing at. Silent in both
 * gaps — nothing survived below a landmark, or nothing survived at all —
 * because leaving focus alone is honest and the top of the page is not.
 */
function restoreFocus(chain: readonly HTMLElement[]): void {
  const [opener, ...ancestors] = chain;
  if (opener?.isConnected === true) {
    opener.focus({ preventScroll: true });
    return;
  }
  for (const el of ancestors) {
    if (LANDMARK_TAGS.has(el.tagName)) {
      return;
    }
    const target = el.isConnected ? el.querySelector<HTMLElement>(FOCUSABLE) : null;
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
  }
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
      // That test has to run on `mousedown`, not on the `click` that follows
      // it. A user drag-selecting a shortcut row's text to copy it releases
      // the mouse wherever the selection ends, which is often past the
      // sheet's edge — the browser dispatches `click` on the nearest common
      // ancestor of press and release (the dialog) with the RELEASE
      // coordinates, so a click-coordinate rect test reads a text selection
      // as a backdrop dismissal. Where the gesture STARTED is the honest
      // signal, so the rect test runs there and `click` only reads the
      // verdict.
      onMouseDown={(e) => {
        const box = dialogRef.current?.getBoundingClientRect();
        pressStartedOutsideRef.current =
          box !== undefined &&
          (e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom);
      }}
      // `detail === 0` is a keyboard-synthesized click (Enter/Space on a
      // focused element), which carries no real press to have started
      // anywhere and must not be read as one.
      onClick={(e) => {
        const startedOutside = pressStartedOutsideRef.current;
        pressStartedOutsideRef.current = false;
        if (e.detail === 0) {
          return;
        }
        if (startedOutside) {
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
