import { PIN_FORM_ID } from "./datalist-ids";

/**
 * The empty state's "+ Pin a dependency…" points at the Add-a-test form that
 * is already on screen below it — same file-level discipline as
 * `rule-pop-dom.ts`: the one DOM query lives beside the id it depends on,
 * not inline in a component.
 */
export function focusAddTestForm(): void {
  const form = document.getElementById(PIN_FORM_ID);
  if (!(form instanceof HTMLElement)) {
    return;
  }
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  form.querySelector("input")?.focus({ preventScroll: true });
}
