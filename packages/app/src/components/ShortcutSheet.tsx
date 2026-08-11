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
 * ancestor that outlived it. Silent when nothing survives: there is then
 * nothing honest to aim at, and the browser's own restore is no worse.
 */
function restoreFocus(chain: readonly HTMLElement[]): void {
  const [opener, ...ancestors] = chain;
  if (opener?.isConnected === true) {
    opener.focus({ preventScroll: true });
    return;
  }
  for (const el of ancestors) {
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
      // margin or on a drag-select released there. The rect is the real
      // boundary; it also spares a click on the dialog's own scrollbar.
      // `detail === 0` is a keyboard-synthesized click, whose 0,0 coordinates
      // would read as "outside" everywhere but the top-left corner.
      onClick={(e) => {
        const box = dialogRef.current?.getBoundingClientRect();
        if (!box || e.detail === 0) {
          return;
        }
        const inside =
          e.clientX >= box.left &&
          e.clientX <= box.right &&
          e.clientY >= box.top &&
          e.clientY <= box.bottom;
        if (!inside) {
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
