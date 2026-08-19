import { useState } from "react";
import { PIN_FORM_ID } from "./datalist-ids";
import { EMPTY_FORM, type FormState, hasMeaningfulInput } from "./form";
import { MAX_PINS } from "./pins";
import { SimulatorForm } from "./SimulatorForm";
import { useEngineModule } from "./use-engine-module";
import { useSimulatorForm } from "./use-simulator-form";

/**
 * Roadmap 075 (iteration 6): the "+ Pin a dependency…" row at the foot of the
 * pins list, and the new-pin card it opens.
 *
 * The card is the SIMULATOR'S OWN FORM — the same component, the same quick
 * fills, the same updateType derivation and the same combobox behavior — never
 * a second, simplified copy that would drift from it. What differs is only what
 * the submit does: it saves the descriptor instead of running it once.
 */
export function GhostPinRow({
  open,
  pinCount,
  onOpen,
  onCancel,
  onPin,
}: {
  open: boolean;
  pinCount: number;
  onOpen: () => void;
  onCancel: () => void;
  onPin: (form: FormState) => void;
}) {
  const engineModule = useEngineModule();
  const {
    form,
    setForm,
    updateTypeTouched,
    setUpdateTypeTouched,
    derivedUpdateType,
    effectiveUpdateType,
    datasourceNames,
    managerNames,
    updateTypeKeyDown,
  } = useSimulatorForm(engineModule);
  const [moreFieldsOpen, setMoreFieldsOpen] = useState(false);
  // Roadmap 015's empty-form guard, in the one place this card can hit it: a
  // descriptor with nothing identifying in it would be pinned forever and match
  // nothing on every run.
  const [emptyGuard, setEmptyGuard] = useState(false);

  if (pinCount >= MAX_PINS) {
    return (
      <p className="pin-limit-note">
        {MAX_PINS} pinned tests is the maximum — remove one to pin another.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="pin-ghost" onClick={onOpen}>
        + Pin a dependency…
        <span className="pin-ghost-hint">— it is re-tested against the rules on every run</span>
      </button>
    );
  }

  function submit() {
    if (!hasMeaningfulInput(form)) {
      setEmptyGuard(true);
      return;
    }
    // The EFFECTIVE updateType is baked in, not the raw field: a pin is a saved
    // test, and it must keep meaning what it meant when it was made: what the
    // reader saw the form settle on (derived from the versions, or their own
    // override) is what the pin carries, rather than a blank that a future
    // engine's derivation could quietly answer differently.
    onPin({ ...form, updateType: effectiveUpdateType });
    setForm(EMPTY_FORM);
    setUpdateTypeTouched(false);
    setEmptyGuard(false);
  }

  return (
    <div className="card pin-new">
      <SimulatorForm
        form={form}
        setForm={setForm}
        updateTypeTouched={updateTypeTouched}
        setUpdateTypeTouched={setUpdateTypeTouched}
        effectiveUpdateType={effectiveUpdateType}
        derivedUpdateType={derivedUpdateType}
        updateTypeKeyDown={updateTypeKeyDown}
        datasourceNames={datasourceNames}
        managerNames={managerNames}
        moreFieldsOpen={moreFieldsOpen}
        onMoreFieldsToggle={setMoreFieldsOpen}
        onQuickFill={(fill) => {
          setForm({ ...EMPTY_FORM, ...fill });
          setUpdateTypeTouched(false);
          setEmptyGuard(false);
        }}
        onSubmit={submit}
        formId={PIN_FORM_ID}
      />
      {emptyGuard && !hasMeaningfulInput(form) ? (
        <p className="sim-empty-guard">
          Pick an example above, or fill in a package name (or another identifying field) — an empty
          form can’t match anything.
        </p>
      ) : null}
      <div className="pin-new-actions">
        {/* The form's submit button, associated across the DOM by `form=` — so
            Enter in a field and a click here are the same action (roadmap 068). */}
        <button type="submit" form={PIN_FORM_ID} className="btn-primary">
          Pin <kbd>⏎</kbd>
        </button>
        <button type="button" className="btn-quiet" onClick={onCancel} aria-label="Cancel">
          ×
        </button>
      </div>
    </div>
  );
}
