import { ruleTester } from "../rule-tester.ts";
import rule from "./no-uncaught-void-chain.ts";

ruleTester.run("no-uncaught-void-chain", rule, {
  valid: [
    // ---- a `catch` anywhere in the chain is the handling this rule asks for,
    // wherever it sits (`engine-chunk.ts`, `use-repo-deps.ts`).
    "void loadEngine().catch(() => {});",
    "void discover(repo, blocks).then((view) => setState(view)).catch((err) => report(err));",
    "void run().then(ok).catch(report).finally(done);",
    // …including before the `.then` it protects
    "void load().catch(report).then(ok);",
    // `.then`'s second argument IS a rejection handler
    "void load().then(ok, report);",
    "void load().then(ok, report).finally(done);",
    // ---- not an ExpressionStatement: the promise is handed to a caller who can
    // still await or reject it. An ARGUMENT (`ResultsPane`'s lazy import)…
    "lazy(() => loadResultsColumn().then((m) => ({ default: m.ResultsColumn })));",
    // …and an INITIALIZER (`hooks/result-cache.ts`, `engine/src/pipeline.ts`).
    "const promise = Promise.resolve().then(() => compute(deps, key));",
    "const run = queue.then(() => step());",
    "cache.promise = Promise.resolve().then(fill);",
    // an awaited chain is not detached at all
    "await load().then(setThing);",
    // ---- the bare (un-`void`ed) chain is `promise/catch-or-return`'s to report,
    // and it already does; this rule covers only the half that one misses.
    "load().then(setThing);",
    // ---- `void (async () => { … })()` is deliberately not matched: the callee
    // is a function expression, so nothing is collected. Whether the handling
    // inside the body is right is a per-site judgement, not a shape — including
    // `use-engine-helpers`'s pre-fix body (b693f53c^), which was the same class
    // of defect in this spelling and is valid here on purpose.
    "void (async () => { const engine = await loadEngine(); if (live) { setHelpers(engine); } })();",
    "void (async () => { await go(); })();",
    "void (async () => { try { await go(); } catch (err) { report(err); } })();",
    // no `then`/`finally` to settle: nothing is chained onto the detached call
    "void preloadEngine();",
    "void engine.warm();",
    // `void` of something that is not a call at all
    "void enginePromise;",
  ],
  invalid: [
    // the shipped defect, pre-fix (`use-one-off-simulation.ts`, bad2836a^):
    // `.then` + `.finally`, no `.catch` — a rejected check cleared the spinner
    // and left the previous verdict standing.
    {
      code: "void runSimulation(finalConfig, snapshot, touched).then(({ sim }) => setOneOff(sim)).finally(() => setSimulating(false));",
      errors: [{ messageId: "uncaughtVoidChain" }],
    },
    // the two live hits this rule was written against (`App.tsx`), whose
    // `loadEngine()` rethrows on a failed chunk import
    {
      code: "void loadOptionIndex().then(setOptionIndex);",
      errors: [{ messageId: "uncaughtVoidChain" }],
    },
    {
      code: "void loadErrorTranslationLib().then(setErrorLib);",
      errors: [{ messageId: "uncaughtVoidChain" }],
    },
    // `finally` alone: the cleanup runs, the failure still vanishes
    {
      code: "void save(draft).finally(() => setBusy(false));",
      errors: [{ messageId: "uncaughtVoidChain" }],
    },
    // several links, none of them a rejection handler
    {
      code: "void load().then(parse).then(setThing);",
      errors: [{ messageId: "uncaughtVoidChain" }],
    },
    // the chain starts at a member call rather than a bare identifier
    {
      code: "void engine.runPipeline(input).then(setResult);",
      errors: [{ messageId: "uncaughtVoidChain" }],
    },
    // a one-argument `.then` is a success handler only — the second-argument
    // escape needs an actual second argument
    {
      code: "void load().then(ok).finally(done);",
      errors: [{ messageId: "uncaughtVoidChain" }],
    },
  ],
});
