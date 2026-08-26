import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import { mayOwnNativePopup } from "@/hooks/scroll-ergonomics";
import { DATASOURCE_LIST_ID, MANAGER_LIST_ID, SIM_FORM_ID } from "./datalist-ids";
import { DescriptorPreview, DescriptorSection } from "./DescriptorPreview";
import { FieldGroups } from "./FieldGroups";
import { QuickFillChips } from "./QuickFillChips";
import { SentenceLine } from "./SentenceLine";
import { UpdateTypeChip } from "./UpdateTypeChip";
import type { FormState } from "@/types/simulator";

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

/** Roadmap 079: the groups, and the descriptor. Standalone gets it as the live
 *  card beside them; compact (the Tests tab's Add-a-test panel) is one narrow
 *  column, so 082 gives it the same document folded away underneath instead. */
function FormBody({
  form,
  setForm,
  managerNames,
  openGroup,
  onOpenGroupChange,
  effectiveUpdateType,
  compact,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  managerNames: readonly string[] | null;
  openGroup: number;
  onOpenGroupChange: (index: number) => void;
  effectiveUpdateType: string;
  compact: boolean;
}) {
  return (
    <div className={`sim-form-body${compact ? "" : " with-preview"}`}>
      <FieldGroups
        form={form}
        setForm={setForm}
        managerNames={managerNames}
        openGroup={openGroup}
        onOpenGroupChange={onOpenGroupChange}
      />
      {compact ? (
        <DescriptorSection form={form} effectiveUpdateType={effectiveUpdateType} />
      ) : (
        <DescriptorPreview form={form} effectiveUpdateType={effectiveUpdateType} />
      )}
    </div>
  );
}

/**
 * Roadmap 079: the simulator's inputs, as the design's form — quick-fill chips
 * ("Start from:"), the sentence card whose blanks ARE the four fields that
 * identify an update, `updateType` as a derived chip inside that sentence, and
 * everything else in three named collapsible groups.
 *
 * What replaced what: 047's labelled 4-field grid became the sentence, its
 * derived-updateType one-liner became the chip, and its single "More about
 * this update" drawer became the three groups. Nothing about the form's
 * BEHAVIOUR moved — 015's derivation and empty-form guard, 068's Enter rules,
 * and 021's select-on-focus are all where they were.
 */
export function SimulatorForm({
  form,
  setForm,
  setUpdateTypeTouched,
  effectiveUpdateType,
  derivedUpdateType,
  updateTypeKeyDown,
  datasourceNames,
  managerNames,
  openGroup,
  onOpenGroupChange,
  onQuickFill,
  onSubmit,
  compact = false,
  formId = SIM_FORM_ID,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  setUpdateTypeTouched: Dispatch<SetStateAction<boolean>>;
  effectiveUpdateType: string;
  derivedUpdateType: string | undefined;
  updateTypeKeyDown: (e: KeyboardEvent<HTMLSelectElement>) => void;
  datasourceNames: readonly string[] | null;
  managerNames: readonly string[] | null;
  /** Roadmap 079: which field group is expanded, or -1. Owned by the caller so
   *  a re-simulation or a new pipeline result never folds it. */
  openGroup: number;
  onOpenGroupChange: (index: number) => void;
  onQuickFill: (fill: Partial<FormState>) => void;
  /** Roadmap 068: Enter in any field — the form owns the simulate action now,
   *  and the Simulate button submits it from the actions row. */
  onSubmit: () => void;
  /** Roadmap 079: the design's `compact` — single column, no descriptor
   *  preview. The Tests tab's Add-a-test panel renders this way. */
  compact?: boolean;
  /** Roadmap 075 (iteration 6): which form this is, for the submit button that
   *  sits outside it (`form=`). Defaults to the simulator's own; the Tests
   *  tab's new-pin card passes `PIN_FORM_ID`. */
  formId?: string;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the keydown below is a key BUBBLING from the fields inside, not an interaction with the form element itself. Declining IMPLICIT SUBMIT is necessarily a form-level decision; the rule has no shape for that.
    <form
      id={formId}
      className="sim-form-shell"
      aria-label="Dependency update to simulate"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      // Roadmap 068 review: accepting a suggestion and submitting the form are
      // two intents on one key. `datasource` and `manager` are native
      // `<datalist>` comboboxes (047), so arrowing to `npm` and pressing Enter
      // to TAKE it also fired implicit submission — a whole verdict against a
      // descriptor the user had filled one field of, and one the 015 empty-form
      // guard cannot catch, since that field is exactly what makes the form
      // non-empty. In a combobox Enter belongs to the suggestion list, so the
      // form declines to be submitted by it; every other field keeps Enter =
      // Simulate, and so
      // does the Simulate button (`type="submit"`, associated by `form=`, and
      // outside this element's subtree — its own Enter never passes here).
      //
      // Declined for the whole field rather than only while the popup is up,
      // because the popup's state is not observable — `mayOwnNativePopup` is
      // where that is written down. The cost is one Tab: from `datasource`,
      // Enter no longer simulates.
      //
      // Roadmap 079 added a THIRD claimant, and it is not handled here: a
      // multi-value field's draft input claims bare Enter for "commit this
      // chip" in its own handler, which runs first and prevents the default
      // itself. This one stays about the comboboxes.
      //
      // 2026-08-11 review: does this ALSO cancel the datalist's own "take the
      // highlighted suggestion" behaviour? Checked, not assumed: in Chrome,
      // the Enter that accepts a highlighted `<datalist>` suggestion never
      // dispatches keydown/keypress/keyup to this input at all — the
      // WHATWG HTML tracking issue for exactly this (whatwg/html#2605) states
      // Chrome fires none of those events for it, so this handler is never
      // even invoked for that keystroke there; `preventDefault` on a keydown
      // that never arrives cancels nothing. Firefox does dispatch the event,
      // but its equivalent native list-control interaction — documented for
      // `<select>` in Mozilla bugs 1428992 and 291082 — runs through a
      // system-group listener that a page script's `preventDefault()`
      // doesn't reach; datalist's suggestion popup is the same native
      // list-selection machinery, so the same immunity is the reasonable
      // expectation there too, though that inference is by architecture, not
      // a datalist-specific report. Either way, what this handler declines is
      // the IMPLICIT SUBMIT, not the pick.
      onKeyDown={(e) => {
        // A handler that claims Enter has to say WHICH Enter it means, and the
        // first cut of this one did not. ⌘/Ctrl+⏎ is the app's Run chord (⌘⇧⏎
        // runs and jumps), `useShortcut` bails on `defaultPrevented`, and the
        // page listener sees this event after React's — so preventing the
        // default of a modified Enter here left the primary shortcut of the app
        // dead in exactly these two fields and nowhere else. Implicit submission
        // is a BARE-Enter behavior, so the guard below never needed to see a
        // modified one: declining what cannot happen only cost us the chord.
        if (e.key !== "Enter" || e.metaKey || e.ctrlKey) {
          return;
        }
        if (mayOwnNativePopup(e.target)) {
          e.preventDefault();
        }
      }}
    >
      <QuickFillChips form={form} onQuickFill={onQuickFill} />
      <RegistryDatalist id={DATASOURCE_LIST_ID} names={datasourceNames} />
      <RegistryDatalist id={MANAGER_LIST_ID} names={managerNames} />
      <SentenceLine
        form={form}
        setForm={setForm}
        datasourceNames={datasourceNames}
        updateTypeChip={
          <UpdateTypeChip
            effectiveUpdateType={effectiveUpdateType}
            derivedUpdateType={derivedUpdateType}
            currentValue={form.currentValue}
            newValue={form.newValue}
            onChange={(value) => {
              setUpdateTypeTouched(true);
              setForm({ ...form, updateType: value });
            }}
            onKeyDown={updateTypeKeyDown}
          />
        }
      />
      <FormBody
        form={form}
        setForm={setForm}
        managerNames={managerNames}
        openGroup={openGroup}
        onOpenGroupChange={onOpenGroupChange}
        effectiveUpdateType={effectiveUpdateType}
        compact={compact}
      />
    </form>
  );
}
