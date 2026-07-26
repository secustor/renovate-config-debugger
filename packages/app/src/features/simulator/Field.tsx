import type { ReactNode } from "react";

export function Field({
  label,
  value,
  onChange,
  placeholder,
  datalistId,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Roadmap 047: a `<datalist>` id — turns the field into a native
   *  type-to-search combobox without changing anything else about it. */
  datalistId?: string;
}) {
  return (
    <label className="sim-field">
      {label}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        list={datalistId}
        onChange={(e) => onChange(e.target.value)}
        // Roadmap 021: select-on-focus. A quick-fill or a re-run leaves a
        // field pre-filled; without this, the persona study's users typed
        // straight into it and got "reactgradle" instead of "gradle" without
        // noticing. Selecting the content on focus makes the first keystroke
        // replace it — repositioning the caret with a second click still
        // works, since that click doesn't refire `focus`.
        onFocus={(e) => e.target.select()}
        spellCheck={false}
      />
    </label>
  );
}
