import type { Dispatch, SetStateAction } from "react";
import { Term } from "@/components/glossary";
import { DESCRIPTOR_TERMS } from "@/data/descriptor-fields";
import { Field } from "./Field";
import { FieldGroup } from "./FieldGroup";
import {
  countSet,
  FIELD_GROUPS,
  FIELD_SPECS,
  fieldPlaceholder,
  type GroupedKey,
} from "./field-groups";
import { isMultiValueKey } from "./form";
import { MultiValueInput } from "./MultiValueInput";
import type { FormState } from "@/types/simulator";

/**
 * One descriptor field, rendered from its spec — the text field and the chip
 * editor are the same row to everything except the value they hold, so which
 * one a field gets is `field-groups.ts`'s answer rather than hand-written JSX
 * per field.
 */
function SpecField({
  name,
  form,
  setForm,
  managerNames,
}: {
  name: GroupedKey;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  managerNames: readonly string[] | null;
}) {
  const spec = FIELD_SPECS[name];
  const label = <Term id={DESCRIPTOR_TERMS[name]}>{name}</Term>;
  const placeholder = fieldPlaceholder(spec, { managerNames });
  const onChange = (value: string) => setForm({ ...form, [name]: value });
  if (isMultiValueKey(name)) {
    return (
      <MultiValueInput
        name={name}
        label={label}
        value={form[name]}
        onChange={onChange}
        placeholder={placeholder}
      />
    );
  }
  return (
    <Field
      label={label}
      value={form[name]}
      onChange={onChange}
      placeholder={placeholder}
      datalistId={spec.datalist}
    />
  );
}

/** Roadmap 079: everything the sentence doesn't say, in three named groups —
 *  one open at a time, the index owned by the caller. */
export function FieldGroups({
  form,
  setForm,
  managerNames,
  openGroup,
  onOpenGroupChange,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  managerNames: readonly string[] | null;
  /** -1 = all closed, which is how the form opens. */
  openGroup: number;
  onOpenGroupChange: (index: number) => void;
}) {
  const toggle = (index: number) => onOpenGroupChange(openGroup === index ? -1 : index);
  return (
    <div>
      {FIELD_GROUPS.map((group, index) => (
        <FieldGroup
          key={group.title}
          title={group.title}
          count={countSet(form, group.keys)}
          open={openGroup === index}
          onToggle={() => toggle(index)}
        >
          {group.keys.map((key) => (
            <SpecField
              key={key}
              name={key}
              form={form}
              setForm={setForm}
              managerNames={managerNames}
            />
          ))}
        </FieldGroup>
      ))}
    </div>
  );
}
