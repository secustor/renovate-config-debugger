/**
 * How a rule's verdict is CLASSIFIED, as opposed to how it is rendered.
 *
 * The predicate itself now lives in the engine
 * (`src/simulate-missing-inputs.ts`), which is where its raw material is: the
 * matcher table's `readFields` and the fail-closed branch that produces a
 * `no-input` clause. The engine also aggregates it into
 * `SimulationResult.missingInputs`, and one predicate has to decide both, or
 * the summary stops counting what the filter shows.
 *
 * The seam stays because the import path is load-bearing on this side: the
 * rules-drawer badge, the drawer's verdict filter (`rule-filters.ts`) and the
 * headless barrel (`headless.ts`, which `packages/cli` reads) all reach the
 * predicate through here. A row filtered as "no input" that then says "no
 * match" is the exact confusion Replay-02 R3/R4 was about.
 */
export { isNoInputNoMatch } from "@renovate-config-debugger/engine";
