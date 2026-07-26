import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import { DATASOURCE_LIST_ID, MANAGER_LIST_ID } from "./datalist-ids";
import { Field } from "./Field";
import { type FormState, QUICK_FILLS } from "./form";
import { MoreFieldsDrawer } from "./MoreFieldsDrawer";
import { UpdateTypeLine, UpdateTypeSelect } from "./UpdateTypeControl";

/**
 * Roadmap 047: `datasource` (81 entries) and `manager` (115) are backed by
 * Renovate's own registries, but they are far too long for a `<select>` — so
 * they are native comboboxes: a plain text input with a `<datalist>`. Typing
 * filters the list natively, focus/arrow still shows all of it, and free text
 * stays legal, which matters twice over — `FormState` remains a plain string
 * (share-link encoding untouched) and a value the registry doesn't know (a
 * custom datasource, a newer Renovate) is neither rejected nor rewritten.
 *
 * The options ride along with the engine chunk. Before it resolves the input
 * is a perfectly ordinary text field — typing is never blocked on a fetch —
 * and the suggestions simply appear once the list arrives.
 */
function RegistryDatalist({
  id,
  names,
}: {
  id: string;
  /** null until the engine module has loaded — then no options, no dropdown. */
  names: readonly string[] | null;
}) {
  return (
    <datalist id={id}>
      {(names ?? []).map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  );
}

/**
 * Roadmap 047: the simulator's inputs — quick-fill chips, then four fields
 * before the first decision (what identifies the dependency and what
 * identifies the update), the updateType line or its manual override, and the
 * "More about this update" drawer holding everything else.
 */
export function SimulatorForm({
  form,
  setForm,
  updateTypeTouched,
  setUpdateTypeTouched,
  effectiveUpdateType,
  derivedUpdateType,
  updateTypeKeyDown,
  datasourceNames,
  managerNames,
  moreFieldsOpen,
  onMoreFieldsToggle,
  onQuickFill,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  updateTypeTouched: boolean;
  setUpdateTypeTouched: Dispatch<SetStateAction<boolean>>;
  effectiveUpdateType: string;
  derivedUpdateType: string | undefined;
  updateTypeKeyDown: (e: KeyboardEvent<HTMLSelectElement>) => void;
  datasourceNames: readonly string[] | null;
  managerNames: readonly string[] | null;
  moreFieldsOpen: boolean;
  onMoreFieldsToggle: (open: boolean) => void;
  onQuickFill: (fill: Partial<FormState>) => void;
}) {
  return (
    <>
      <div className="sim-presets">
        {QUICK_FILLS.map(({ label, fill }) => (
          <button key={label} type="button" onClick={() => onQuickFill(fill)}>
            {label}
          </button>
        ))}
      </div>
      <RegistryDatalist id={DATASOURCE_LIST_ID} names={datasourceNames} />
      <RegistryDatalist id={MANAGER_LIST_ID} names={managerNames} />
      <div className="sim-form">
        <Field
          label="datasource"
          value={form.datasource}
          onChange={(v) => setForm({ ...form, datasource: v })}
          placeholder="(unset) — type to search"
          datalistId={DATASOURCE_LIST_ID}
        />
        <Field
          label="packageName"
          value={form.packageName}
          onChange={(v) => setForm({ ...form, packageName: v })}
          placeholder="lodash"
        />
        <Field
          label="currentValue"
          value={form.currentValue}
          onChange={(v) => setForm({ ...form, currentValue: v })}
          placeholder="4.17.20"
        />
        <Field
          label="newValue"
          value={form.newValue}
          onChange={(v) => setForm({ ...form, newValue: v })}
          placeholder="4.17.21"
        />
      </div>
      {updateTypeTouched ? (
        <UpdateTypeSelect
          value={effectiveUpdateType}
          onChange={(value) => {
            setUpdateTypeTouched(true);
            setForm({ ...form, updateType: value });
          }}
          onKeyDown={updateTypeKeyDown}
        />
      ) : (
        <UpdateTypeLine
          effectiveUpdateType={effectiveUpdateType}
          derivedUpdateType={derivedUpdateType}
          currentValue={form.currentValue}
          newValue={form.newValue}
          onOverride={() => setUpdateTypeTouched(true)}
        />
      )}
      <MoreFieldsDrawer
        form={form}
        setForm={setForm}
        open={moreFieldsOpen}
        onToggle={onMoreFieldsToggle}
      />
    </>
  );
}
