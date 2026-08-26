/** Roadmap 047: the two `<datalist>` ids the registry comboboxes reference —
 *  the lists themselves are rendered once per simulator card. */
export const DATASOURCE_LIST_ID = "sim-datasource-names";
export const MANAGER_LIST_ID = "sim-manager-names";

/**
 * Roadmap 068: the simulator's inputs are a real `<form>`, so Enter in a field
 * simulates — the same thing Enter already did in the repo-load form, and the
 * thing it did nowhere in the panel users type in most.
 *
 * The Simulate button lives OUTSIDE that form in the DOM (it sits in the
 * actions row with the stale-inputs notice) and is associated back to it by
 * `form={SIM_FORM_ID}`. That keeps both JSX trees exactly as shallow as they
 * were — a wrapper around the two would have pushed the button past the
 * jsx-max-depth ratchet — while still making it the form's submit button, which
 * is what implicit submission needs.
 */
export const SIM_FORM_ID = "simulator-inputs";

/**
 * Roadmap 075 (iteration 6): the new-pin form's own id. The Tests tab's two
 * views are mutually exclusive, so only one of the two forms is ever in the
 * document — but a form id that says which form it is keeps the submit button's
 * `form=` association readable, and makes it impossible for a future layout
 * that shows both to associate the Pin button with the Simulate one's form.
 */
export const PIN_FORM_ID = "pinned-test-inputs";

/**
 * The new-pin card's tab widget, wired the way `ResultsPanel`'s bar already is.
 *
 * Its tabs carried `role="tab"` and `aria-selected` from the start, but nothing
 * on either side named the other: no `id` on a tab, no `aria-controls`, and no
 * `role="tabpanel"` on the region they switch. A screen reader therefore
 * announced "Paste JSON, tab, 2 of 3, selected" and then had nothing to say
 * about what that selection had DONE — the panel was three anonymous divs
 * further down the document. No jsx-a11y rule reports this (the plugin checks
 * each element on its own; a missing RELATIONSHIP between two of them has no
 * rule), which is why it survived a review that turned every other tab-bar
 * finding over.
 *
 * One panel element rather than three: the card renders exactly one tab's
 * content at a time, so a single region whose `aria-labelledby` follows the
 * selection says the true thing with one id instead of three.
 */
export const PIN_TAB_PANEL_ID = "pin-add-tabpanel";

/** The per-tab id `aria-controls`/`aria-labelledby` point at. */
export function pinTabId(tab: string): string {
  return `pin-add-tab-${tab}`;
}
