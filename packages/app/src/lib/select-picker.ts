/**
 * Roadmap 067 tier 1: Enter opens a focused `<select>`.
 *
 * Reported against the `renovate.json` / `renovate.json5` picker, and it is
 * native behavior rather than a bug we introduced: a closed `<select>` opens on
 * Space or Alt+Down, and Enter does nothing at all outside a form. It became
 * visible because 067 untrapped Tab — that select is now the first thing Tab
 * reaches from the editor, so people land on it and press the key the rest of
 * this app just taught them means "activate".
 *
 * `showPicker()` is the only way to open a native dropdown programmatically. It
 * needs transient user activation, which a keydown supplies, and it throws
 * rather than returning a failure — hence the try/catch. Where it is missing
 * (older Safari/Firefox), the handler stands aside and Space still works: no
 * fallback can conjure the popup, and a hand-built menu would be a worse
 * control than the native one.
 */

interface PickerKeyEvent {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  preventDefault: () => void;
  /** `value` is here only so this isn't an all-optional "weak" type, which a
   *  real `HTMLSelectElement` could not be assigned to on a TS lib that does
   *  not yet declare `showPicker`. It also keeps the unit test's stub honest. */
  readonly currentTarget: { readonly value: string; showPicker?: () => void };
}

export function openPickerOnEnter(event: PickerKeyEvent): void {
  if (event.key !== "Enter") {
    return;
  }
  // ⌘⏎ is Run, and it has to keep working from a focused control.
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
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
