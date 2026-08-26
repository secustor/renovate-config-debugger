import {
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";
import type * as EngineModule from "@renovate-config-debugger/engine";
import { openPickerOnEnter } from "@/lib/select-picker";
import { EMPTY_FORM, hasMeaningfulInput, UPDATE_TYPES } from "./form";
import type { FormState } from "@/types/simulator";

/** What a fill states about itself beyond the fields it carries. */
export interface ReplaceOptions {
  /** Roadmap 015: whether the fill STATED an updateType — a value a log
   *  carried is the user's choice, not something to re-derive from the
   *  versions and silently overwrite. */
  updateTypeTouched?: boolean;
  /** Roadmap 082: the receipt the form wears afterwards, or null — a note
   *  describing a form that no longer exists is cleared with it. */
  note?: string | null;
}

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
  /** Roadmap 082: the receipt an import left on the form, or null. */
  importNote: string | null;
  replaceForm: (fill: Partial<FormState>, opts?: ReplaceOptions) => void;
  guard: (candidate: FormState) => boolean;
  clearGuard: () => void;
  /** Whether the empty-form notice belongs on screen — reactive, not sticky:
   *  the moment the form gains ANY meaningful field it clears itself, without
   *  waiting for another press. */
  showEmptyGuard: boolean;
  pinDescriptor: (
    onAddPin: (form: FormState) => void,
    source?: FormState,
    updateType?: string,
  ) => boolean;
}

/**
 * Roadmap 015: the simulator's descriptor form — the fields, the updateType
 * derivation that rides on them, the doors that fill them, the empty-form
 * guard and the pin they feed. While `updateTypeTouched` is false the effective
 * updateType tracks currentValue/newValue live; the moment the user touches the
 * select (or a quick-fill fills the form, which resets it) their choice wins
 * outright, even if they go on to edit the versions afterward.
 *
 * The form has two homes — the detail view and the Tests tab's Add-a-test
 * panel, which is never a simplified copy of it — and this hook is where the
 * rules they share live, rather than being re-derived in each. The state a
 * home owns alone (a tab's paste draft, the detail view's pin receipt) stays
 * there.
 */
export function useSimulatorForm(engineModule: typeof EngineModule | null): SimulatorForm {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [updateTypeTouched, setUpdateTypeTouched] = useState(false);
  // Roadmap 015: set when a run or a pin is asked for on a form with nothing
  // identifying in it — a descriptor that would match nothing on every run.
  const [emptyGuardTriggered, setEmptyGuardTriggered] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

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
    // Roadmap 068: `openPickerOnEnter` is a no-op here because this select
    // lives inside a simulator form (`select.form !== null`, whichever of the
    // two homes renders it) — Enter keeps
    // its native job of submitting the form, matching every other field in
    // it. Composed here rather than on the element, because this handler
    // already owns the select's keys.
    openPickerOnEnter(e);
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

  /**
   * Every door into this form — a quick-start chip, a quick-fill, a paste, the
   * clear after a pin — REPLACES the descriptor rather than patching it: a fill
   * is a whole dependency, and merging it over whatever the last one left
   * behind would carry a stale `packageFile: package.json` into a Dockerfile
   * descriptor without saying so. One function so the doors cannot drift into
   * several slightly different meanings of "replace".
   */
  function replaceForm(fill: Partial<FormState>, opts: ReplaceOptions = {}) {
    setForm({ ...EMPTY_FORM, ...fill });
    setUpdateTypeTouched(opts.updateTypeTouched ?? false);
    setEmptyGuardTriggered(false);
    setImportNote(opts.note ?? null);
  }

  /**
   * Roadmap 015's empty-form guard: is this descriptor worth acting on? A
   * `false` trips the notice, and a `true` clears one that was already up.
   *
   * Takes the candidate rather than reading `form`, because the caller's
   * descriptor is not always the one on screen (a share link's auto-run
   * carries its own) — and because that keeps this identity-stable for the run
   * hook's effects.
   */
  const guard = useCallback((candidate: FormState): boolean => {
    const ok = hasMeaningfulInput(candidate);
    setEmptyGuardTriggered(!ok);
    return ok;
  }, []);

  const clearGuard = useCallback(() => setEmptyGuardTriggered(false), []);

  /**
   * Roadmap 080: pin the descriptor as a standing test — the guard first, then
   * the EFFECTIVE updateType baked in rather than the raw field, because a pin
   * is a saved test and it must keep meaning what it meant when it was made.
   *
   * What happens AFTERWARDS is the caller's: the panel clears the form it just
   * saved, the detail view deliberately does not (the reader is mid-analysis of
   * that dependency, and the pins list is one click away).
   *
   * @returns whether the pin happened — false means the guard stopped it.
   */
  function pinDescriptor(
    onAddPin: (pinned: FormState) => void,
    source: FormState = form,
    updateType: string = effectiveUpdateType,
  ): boolean {
    if (!guard(source)) {
      return false;
    }
    onAddPin({ ...source, updateType });
    return true;
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
    importNote,
    replaceForm,
    guard,
    clearGuard,
    showEmptyGuard: emptyGuardTriggered && !hasMeaningfulInput(form),
    pinDescriptor,
  };
}
