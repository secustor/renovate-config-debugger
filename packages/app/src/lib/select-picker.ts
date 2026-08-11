/**
 * Roadmap 068 tier 1: Enter opens a focused `<select>` — unless the select
 * belongs to a form, where Enter keeps its native job of submitting it.
 *
 * Reported against the `renovate.json` / `renovate.json5` picker, and it is
 * native behavior rather than a bug we introduced: a closed `<select>` opens on
 * Space or Alt+Down, and Enter does nothing at all outside a form. It became
 * visible because 068 untrapped Tab — that select is now the first thing Tab
 * reaches from the editor, so people land on it and press the key the rest of
 * this app just taught them means "activate".
 *
 * The form exception exists because the simulator's `updateType` select lives
 * inside `#simulator-inputs`, where every other field submits on Enter (that
 * is the whole point of making it a real `<form>`). Opening the picker there
 * would make that select the one control in the form where Enter does not
 * submit. `select.form !== null` is the one signal that generalizes across
 * every call site without each one having to know whether it happens to sit
 * in a form — standalone selects (file name, results filters) still get the
 * picker; form-bound ones defer to implicit submission.
 *
 * `showPicker()` is the only way to open a native dropdown programmatically. It
 * needs transient user activation, which a keydown supplies, and it throws
 * rather than returning a failure — hence the try/catch. Where it is missing
 * (older Safari/Firefox), the handler stands aside and Space still works: no
 * fallback can conjure the popup, and a hand-built menu would be a worse
 * control than the native one.
 */

import { anyModifierHeld, type KeyModifiers } from "@/lib/shortcuts";

interface PickerKeyEvent extends KeyModifiers {
  readonly key: string;
  preventDefault: () => void;
  /** `value` and `form` are here only so this isn't an all-optional "weak"
   *  type, which a real `HTMLSelectElement` could not be assigned to on a TS
   *  lib that does not yet declare `showPicker`. They also keep the unit
   *  test's stub honest. */
  readonly currentTarget: {
    readonly value: string;
    readonly form?: unknown;
    showPicker?: () => void;
  };
}

export function openPickerOnEnter(event: PickerKeyEvent): void {
  if (event.key !== "Enter") {
    return;
  }
  // Bare Enter only. ⌘⏎ is Run and has to keep working from a focused control;
  // `anyModifierHeld` is the right half of that pair for a NAMED key, where
  // Shift is a gesture of its own rather than part of typing the key.
  if (anyModifierHeld(event)) {
    return;
  }
  // A select that belongs to a form lets Enter do its native job — implicit
  // submission — instead of opening the dropdown. See the module doc.
  if (event.currentTarget.form) {
    return;
  }
  const showPicker = event.currentTarget.showPicker;
  if (typeof showPicker !== "function") {
    return;
  }
  event.preventDefault();
  try {
    showPicker.call(event.currentTarget);
  } catch {
    // No user activation, or a browser that refuses — the select is untouched.
  }
}
