/** Roadmap 047: the two `<datalist>` ids the registry comboboxes reference —
 *  the lists themselves are rendered once per simulator card. */
export const DATASOURCE_LIST_ID = "sim-datasource-names";
export const MANAGER_LIST_ID = "sim-manager-names";

/**
 * Roadmap 067: the simulator's inputs are a real `<form>`, so Enter in a field
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
