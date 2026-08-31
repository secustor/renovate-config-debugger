import { PIN_FORM_ID } from "./datalist-ids";
import { motionScrollOptions } from "@/lib/motion";

/**
 * The Add-a-test form's first input, or null while the card is collapsed (the
 * ghost row) or on another tab — same file-level discipline as
 * `rule-pop-dom.ts`: the one DOM query lives beside the id it depends on,
 * not inline in a component. The GHOST rework moved the focusing itself into
 * `AddTestBox` (only IT knows when the form has actually rendered), so this
 * exports the target rather than the gesture.
 */
export function pinAddFocusTarget(): HTMLInputElement | null {
  const form = document.getElementById(PIN_FORM_ID);
  if (!(form instanceof HTMLElement)) {
    return null;
  }
  form.scrollIntoView(motionScrollOptions("nearest"));
  return form.querySelector("input");
}
