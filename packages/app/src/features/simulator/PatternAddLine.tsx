import { type KeyboardEvent, useState } from "react";

/**
 * Roadmap 094: the dashed "add pattern ⏎" / "add input ⏎" line at the foot of
 * each column. Enter commits and clears; the field is otherwise inert, so a
 * half-typed value is never a pattern. Bare Enter only — ⌘⏎ stays the Run
 * chord (the `MultiValueInput` rule).
 */
export function PatternAddLine({
  label,
  placeholder,
  onAdd,
}: {
  /** The accessible name; the placeholder is the visible one. */
  label: string;
  placeholder: string;
  onAdd: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.metaKey || e.ctrlKey) {
      return;
    }
    e.preventDefault();
    const value = draft.trim();
    if (value === "") {
      return;
    }
    onAdd(value);
    setDraft("");
  }
  return (
    <input
      type="text"
      className="pattern-add-line"
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={keyDown}
    />
  );
}
