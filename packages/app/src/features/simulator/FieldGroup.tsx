import type { ReactNode } from "react";

/**
 * Roadmap 079: one collapsible group of descriptor fields — the successor to
 * 047's single "More about this update" drawer, which held fourteen fields in
 * one undifferentiated grid.
 *
 * The header is the abstract a collapsed layer owes the reader (047's rule):
 * the group's own question ("Where it comes from"), and a count pill saying
 * how many of its fields currently hold a value, so a wrong quick-fill is
 * catchable without opening anything. One group is open at a time — the parent
 * owns that index, so a re-run never folds what the reader opened.
 */
export function FieldGroup({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  /** Non-empty fields in this group — the pill's number. */
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sim-group">
      <button type="button" className="sim-group-head" aria-expanded={open} onClick={onToggle}>
        <span className="sim-group-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="sim-group-title">{title}</span>
        <span className={`sim-group-count${count > 0 ? " set" : ""}`}>
          {count > 0 ? `${count} set` : "none set"}
        </span>
      </button>
      {open ? <div className="sim-group-body">{children}</div> : null}
    </div>
  );
}
