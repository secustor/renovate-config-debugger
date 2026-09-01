import { definePlugin } from "@oxlint/plugins";
import noLocalIsPlainObject from "./rules/no-local-is-plain-object.ts";
import noUncaughtVoidChain from "./rules/no-uncaught-void-chain.ts";
import noUnguardedJsonStringify from "./rules/no-unguarded-json-stringify.ts";
import useErrorMessage from "./rules/use-error-message.ts";
import useGotoAppHelper from "./rules/use-goto-app-helper.ts";
import useRuleRef from "./rules/use-rule-ref.ts";
import useSyncedReset from "./rules/use-synced-reset.ts";
import useTransientValue from "./rules/use-transient-value.ts";
import useTruncate from "./rules/use-truncate.ts";

/**
 * This repo's own lint rules — the "house rules".
 *
 * Every one is derived from something that was ACTUALLY in the tree and had to
 * be fixed by hand during the 2026-08 structure review and the 2026-09 sweep
 * that followed. None is a preference. The bar has two arms, and a rule clears
 * ONE of them:
 *
 *   (a) DUPLICATION WITH A HOME. At least two sites existed, a shared helper
 *       now exists, and a future third copy would be invisible in review
 *       because each copy is trivially correct on its own.
 *   (b) A PROVABLY WRONG CONSTRUCT. There is no helper to point at, because the
 *       fix is not an import: the construct itself is defective wherever it
 *       appears, it shipped that way, and the diagnostic names the correction.
 *
 * Seven of the nine clear (a). `no-uncaught-void-chain` and
 * `no-unguarded-json-stringify` clear (b) — they ban a construct and name no
 * import. Say which arm a new rule is on when you add one.
 *
 * Three earn their place on evidence stronger than a count. `use-truncate`
 * guards a defect that shipped — a fix diff could split a surrogate pair and
 * render an emoji as a replacement glyph. `use-synced-reset` guards a
 * during-render invariant whose violation silently undoes a user's first click.
 * `use-transient-value` guards a leak class the hook was written to close.
 *
 * The 2026-09 structure sweep II added three more. `no-uncaught-void-chain`
 * (arm b) guards a defect that shipped in `use-one-off-simulation` (bad2836a):
 * a promise chain detached with `void`, its rejection dropped. The same class
 * recurred in `use-engine-helpers` (b693f53c) in the `void (async () => …)()`
 * spelling, which the rule deliberately leaves to per-site judgement — a second
 * spelling, not a second site the rule fires on. `no-unguarded-json-stringify`
 * (arm b) guards `JSON.stringify`'s `undefined` return leaking into a string
 * (sweep finding 9, the CLI's `output.ts`); it is enabled on `packages/cli/src`
 * as well as the app, because banning a construct needs no shared helper in
 * scope. `use-goto-app-helper` (arm a) is enabled ONLY outside
 * `packages/app/src` — on `packages/app/e2e/*.spec.ts`, the one tree the Stop
 * hook does not run, so lint is its gate.
 *
 * WHAT IS DELIBERATELY NOT HERE. On arm (a), a rule is the right tool only when
 * the duplicate cannot be REMOVED. The review also found a message phrase the
 * engine produces and the app matches; the first instinct was a rule banning
 * the literal, and the better answer was to share the constant — the app
 * already depends on the engine, so the phrase now lives in
 * `engine/src/contracts.ts` and both sides import it. There is no duplicate to
 * police. Check for that shape before adding anything below.
 *
 * Structure follows renovatebot/renovate's `tools/lint`: one file per rule with
 * a colocated spec, `createOnce` for the fast path, and message ids rather than
 * inline strings so the specs assert on identity instead of prose.
 */
export default definePlugin({
  meta: {
    name: "rcd",
  },
  rules: {
    "no-local-is-plain-object": noLocalIsPlainObject,
    "no-uncaught-void-chain": noUncaughtVoidChain,
    "no-unguarded-json-stringify": noUnguardedJsonStringify,
    "use-error-message": useErrorMessage,
    "use-goto-app-helper": useGotoAppHelper,
    "use-rule-ref": useRuleRef,
    "use-synced-reset": useSyncedReset,
    "use-transient-value": useTransientValue,
    "use-truncate": useTruncate,
  },
});
