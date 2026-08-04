import { type Dispatch, type KeyboardEvent, type SetStateAction, useMemo, useState } from "react";
import type * as EngineModule from "@renovate-config-debugger/engine";
import { EMPTY_FORM, type FormState, UPDATE_TYPES } from "./form";

export interface SimulatorForm {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  /** Roadmap 015: whether the user picked the updateType select THEMSELVES. */
  updateTypeTouched: boolean;
  setUpdateTypeTouched: Dispatch<SetStateAction<boolean>>;
  derivedUpdateType: string | undefined;
  effectiveUpdateType: string;
  /** null until the engine module has loaded — then no options, no dropdown. */
  datasourceNames: readonly string[] | null;
  managerNames: readonly string[] | null;
  updateTypeKeyDown: (e: KeyboardEvent<HTMLSelectElement>) => void;
}

/**
 * Roadmap 015: the simulator's form fields and the updateType derivation that
 * rides on them. While `updateTypeTouched` is false the effective updateType
 * tracks currentValue/newValue live; the moment the user touches the select
 * (or a quick-fill runs, which resets it) their choice wins outright, even if
 * they go on to edit the versions afterward.
 */
export function useSimulatorForm(engineModule: typeof EngineModule | null): SimulatorForm {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [updateTypeTouched, setUpdateTypeTouched] = useState(false);

  // Roadmap 015: recomputed live as currentValue/newValue/versioning change —
  // undefined until the engine chunk resolves, or when the pair can't be
  // derived (blank, a range, an unparseable value, …).
  const derivedUpdateType = useMemo(
    () => engineModule?.deriveUpdateType(form.currentValue, form.newValue, form.versioning),
    [engineModule, form.currentValue, form.newValue, form.versioning],
  );
  const effectiveUpdateType =
    updateTypeTouched || derivedUpdateType === undefined ? form.updateType : derivedUpdateType;

  // Roadmap 047: Renovate's own datasource/manager registries, for the two
  // dropdowns. They ride along with the engine chunk the derivation above
  // already needs, so they cost no extra fetch — null until it resolves.
  const datasourceNames = useMemo(
    () => engineModule?.listDatasourceNames() ?? null,
    [engineModule],
  );
  const managerNames = useMemo(() => engineModule?.listManagerNames() ?? null, [engineModule]);

  /**
   * Roadmap 015: step the updateType select ourselves on ArrowUp/ArrowDown.
   * Investigation: this select is a plain, unstyled native `<select>` with no
   * other keydown listener anywhere in the app — but its native one-option-
   * at-a-time arrow stepping turned out to be unreliable specifically under
   * the persona study's browser-automation driver (confirmed by reproducing
   * it against a bare, app-free `<select>` under the same driver: even a
   * from-scratch page with zero JS doesn't step). Handling the keys directly
   * makes stepping deterministic for every input path — a real keyboard
   * included, where this exactly mirrors what native stepping already did.
   */
  function updateTypeKeyDown(e: KeyboardEvent<HTMLSelectElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
      return;
    }
    e.preventDefault();
    const values = ["", ...UPDATE_TYPES];
    const currentIndex = values.indexOf(effectiveUpdateType);
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex =
      e.key === "ArrowDown"
        ? Math.min(values.length - 1, baseIndex + 1)
        : Math.max(0, baseIndex - 1);
    setUpdateTypeTouched(true);
    setForm({ ...form, updateType: values[nextIndex] ?? "" });
  }

  return {
    form,
    setForm,
    updateTypeTouched,
    setUpdateTypeTouched,
    derivedUpdateType,
    effectiveUpdateType,
    datasourceNames,
    managerNames,
    updateTypeKeyDown,
  };
}
