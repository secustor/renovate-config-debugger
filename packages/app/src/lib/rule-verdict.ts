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
 *
 * It reaches the ENGINE by its own subpath rather than by the root barrel, and
 * that spelling is load-bearing too. This was the app's only static value
 * import of the engine root, and the chain behind it is all static:
 * `ResultsColumn` → `TestsPanel` → `rule-filters` → here. Through the root it
 * therefore put the whole Renovate graph on the `lazy()` results chunk's
 * critical path, defeating the invariant `platform/engine-chunk.ts` states —
 * that the graph is reached only through `loadEngine()`.
 *
 * Measured, by building it both ways and reading the emitted chunk's static
 * imports: through the root, `ResultsColumn-*.js` opened with a static
 * `import … from "./src-*.js"`, a 584 kB sibling the browser has to fetch and
 * execute before ResultsColumn can run. Through the subpath it is a 2.4 kB
 * chunk with no imports of its own. The ResultsColumn chunk's OWN size is
 * unchanged either way, which is why this hid: the engine was always a separate
 * file, it was just a statically required one.
 *
 * The subpath's runtime graph is this module plus `text.ts`, and neither
 * touches Renovate. `.oxlintrc.json` bans the root spelling under
 * `packages/app/src/**` so it cannot come back, and
 * `src/oxlint-boundaries.test.ts` keeps that ban from being dropped by an
 * override that forgets to restate it.
 */
export {
  hasEvaluationError,
  isNoInputNoMatch,
} from "@renovate-config-debugger/engine/simulate-missing-inputs";
