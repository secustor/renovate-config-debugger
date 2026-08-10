import { useEffect, useMemo, useRef } from "react";
import { suspendEscapeLayers } from "@/lib/escape-stack";
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
 * already knows that. The ladder has to be told, though: `inert` does not reach
 * a document-level listener, so the sheet suspends it for as long as it is up
 * (see `suspendEscapeLayers`), the same way every other page-level key is gated
 * on App's `keysLive`.
 */

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
    // layer which closes hands focus back, so do it here for all three paths.
    const opener = document.activeElement;
    dialog?.showModal();
    const resume = suspendEscapeLayers();
    return () => {
      resume();
      dialog?.close();
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
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
