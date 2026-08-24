import type { Dispatch, ReactNode, SetStateAction } from "react";
import { DATASOURCE_LIST_ID } from "./datalist-ids";
import type { FormState } from "./form";

/**
 * One blank in the sentence: a borderless mono input on a dashed accent
 * underline. It has no visible label — the words around it are the label — so
 * it carries the field's own name as `aria-label`, which is also what every
 * test and every `getByLabel` addresses it by.
 */
function Blank({
  name,
  value,
  onChange,
  width,
  strong = false,
  listId,
  title,
  placeholder,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** The design's per-blank widths — a version blank is narrower than a name. */
  width: "name" | "version" | "datasource";
  strong?: boolean;
  listId?: string;
  title?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      className={`sim-blank sim-blank-${width}${strong ? " strong" : ""}`}
      aria-label={name}
      value={value}
      placeholder={placeholder}
      list={listId}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      // Roadmap 021: select-on-focus, the same reason the grouped fields have
      // it — a quick-fill leaves every blank pre-filled, and the persona study
      // caught users typing into one and getting `reactgradle`.
      onFocus={(e) => e.target.select()}
      spellCheck={false}
    />
  );
}

/**
 * Roadmap 079: the design's sentence card — "A ⟨updateType⟩ update of
 * ⟨packageName⟩ from ⟨currentValue⟩ to ⟨newValue⟩ from the ⟨datasource⟩
 * registry." The four fields that identify an update are the sentence's
 * blanks, so the form reads as the thing it describes instead of as a grid of
 * Renovate field names.
 */
export function SentenceLine({
  form,
  setForm,
  datasourceNames,
  updateTypeChip,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  /** null until the engine chunk resolves — then the count is real, not a
   *  number baked into the copy. */
  datasourceNames: readonly string[] | null;
  updateTypeChip: ReactNode;
}) {
  const datasourceTitle =
    datasourceNames === null
      ? "Type to search Renovate's datasources"
      : `Type to search Renovate's ${datasourceNames.length} datasources`;
  return (
    <div className="sim-sentence">
      <p>
        <span>A</span>
        {updateTypeChip}
        <span>update of</span>
        <Blank
          name="packageName"
          width="name"
          strong
          value={form.packageName}
          onChange={(v) => setForm({ ...form, packageName: v })}
          placeholder="lodash"
        />
        <span>from</span>
        <Blank
          name="currentValue"
          width="version"
          value={form.currentValue}
          onChange={(v) => setForm({ ...form, currentValue: v })}
          placeholder="4.17.20"
        />
        <span>to</span>
        <Blank
          name="newValue"
          width="version"
          value={form.newValue}
          onChange={(v) => setForm({ ...form, newValue: v })}
          placeholder="4.17.21"
        />
        <span>from the</span>
        <Blank
          name="datasource"
          width="datasource"
          value={form.datasource}
          onChange={(v) => setForm({ ...form, datasource: v })}
          listId={DATASOURCE_LIST_ID}
          title={datasourceTitle}
          placeholder="npm"
        />
        <span>registry.</span>
      </p>
    </div>
  );
}
