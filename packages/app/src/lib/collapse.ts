/**
 * Rows a collapsed list renders before its "show all" line (see
 * `components/ShowAllMore`). ONE cap across every such list rather than a
 * per-surface count: the lists hold whatever a config produced, and a cap that
 * differed by surface would be a rule the reader has to learn instead of a list
 * that stops. Roadmap 082 (GAP-7) settled the number — it is also what replaced
 * the `max-height` scrollers those lists used to carry, since a scrollbar
 * inside a scrolling page hides the same rows without saying how many. Four
 * modules had spelled it `8` independently by the time this became the one
 * place it lives.
 *
 * In `lib/` rather than next to the component because both sides need it:
 * `components/ShowAllMore` renders the line, and feature view-models
 * (`description-ledger`) count against the same cap — and a DOM-free module
 * must not import a `.tsx` one.
 */
export const COLLAPSE_AFTER = 8;
