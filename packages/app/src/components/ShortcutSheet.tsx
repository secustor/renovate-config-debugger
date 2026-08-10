import { useEffect, useMemo, useRef } from "react";
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
 * already knows that.
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
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      className="shortcut-sheet"
      ref={dialogRef}
      aria-label="Keyboard shortcuts"
      onCancel={onClose}
      // A click on the backdrop lands on the dialog element itself — anything
      // inside it targets a child, so this is the whole light-dismiss test.
      onClick={(e) => {
        if (e.target === dialogRef.current) {
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
