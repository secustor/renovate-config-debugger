/**
 * How a rule's verdict is CLASSIFIED, as opposed to how it is rendered.
 *
 * The predicates themselves now live in the engine
 * (`src/simulate-missing-inputs.ts`), which is where their raw material is: the
 * matcher table's `readFields`, the fail-closed branch that produces a
 * `no-input` clause, and the `catch` that produces an `error` one. The engine
 * also aggregates them into `SimulationResult.missingInputs` /
 * `evaluationErrors`, and one predicate has to decide both, or the summary
 * stops counting what the filter shows.
 *
 * The seam stays because the import path is load-bearing on this side: the
 * rules-drawer badge, the drawer's verdict filter (`rule-filters.ts`) and the
 * headless barrel (`headless.ts`, which `packages/cli` reads) all reach the
 * predicate through here. A row filtered as "no input" that then says "no
 * match" is the exact confusion Replay-02 R3/R4 was about.
 */
export { hasEvaluationError, isNoInputNoMatch } from "@renovate-config-debugger/engine";
