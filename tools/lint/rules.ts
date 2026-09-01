import { definePlugin } from "@oxlint/plugins";
import noUncaughtVoidChain from "./rules/no-uncaught-void-chain.ts";
import preferIsHelpers from "./rules/prefer-is-helpers.ts";
import useErrorMessage from "./rules/use-error-message.ts";
import useGotoAppHelper from "./rules/use-goto-app-helper.ts";
import useJsonHelpers from "./rules/use-json-helpers.ts";
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
 * Eight of the nine clear (a). `no-uncaught-void-chain` alone clears (b) — it
 * bans a construct and names no import. Say which arm a new rule is on when you
 * add one.
 *
 * ARM (b) IS A HOLDING PEN, NOT A DESTINATION. PR 316's review made that
 * explicit: a rule that says "stop doing X" without naming where to go is a rule
 * the reader still has to go research, and it can only ever be enabled where
 * some hand-written idiom happens to be the local convention. Two of the three
 * rules the 2026-09 sweep added started on (b) and have now moved to (a) by
 * BUILDING the home they lacked — see the two paragraphs below. Prefer that move
 * to widening a ban.
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
 * spelling, not a second site the rule fires on. `use-goto-app-helper` (arm a)
 * is enabled ONLY outside `packages/app/src` — on `packages/app/e2e/*.spec.ts`,
 * the one tree the Stop hook does not run, so lint is its gate.
 *
 * `use-json-helpers` is the third, and it is the one that moved. It shipped as
 * `no-unguarded-json-stringify` on arm (b): `JSON.stringify` is declared to
 * return `string` but returns `undefined` for `undefined`, a function and a
 * symbol, which is how the CLI's `output.ts` printed a blank line (sweep
 * finding 9). With no shared home the rule could only ban the construct and
 * point at whichever `??` fallback the local package favoured — five different
 * ones existed — so it matched only a `JSON.stringify` in RETURN position,
 * because widening reached the equality comparisons it had no answer for.
 * `packages/engine/src/json.ts` is now that home (`jsonText`, `jsonLiteral`,
 * `jsonDocument`, `jsonFile`, `jsonEqual`), the rule names an import, and the
 * narrowness is gone: it reports every `JSON.stringify` and the nine
 * hand-written `JSON.stringify(a) === JSON.stringify(b)` pairs.
 *
 * `prefer-is-helpers` is the same move, wider. It shipped as
 * `no-local-is-plain-object`, which named `@/lib/input-schemas` and was
 * therefore app-only — the engine and the CLI each kept a copy of the helper
 * BECAUSE the rule had nowhere to send them. `packages/engine/src/is.ts` now
 * holds the eight predicates, and the rule points all three packages at it:
 * three named copies of `isPlainObject`, two of `isStringArray`, 134 inline
 * `typeof x === "<literal>"` comparisons, twelve `typeof … && x !== ""`
 * composites and four un-narrowable `.filter(Boolean)` calls.
 *
 * WHAT IS DELIBERATELY NOT HERE. On arm (a), a rule is the right tool only when
 * the duplicate cannot be REMOVED. The review also found a message phrase the
 * engine produces and the app matches; the first instinct was a rule banning
 * the literal, and the better answer was to share the constant — the app
 * already depends on the engine, so the phrase now lives in
 * `engine/src/contracts.ts` and both sides import it. There is no duplicate to
 * police. The two rules above are that same instinct applied at scale: the ask
 * was a library, and the rule is only what keeps the tree pointed at it. Check
 * for that shape before adding anything below.
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
    "no-uncaught-void-chain": noUncaughtVoidChain,
    "prefer-is-helpers": preferIsHelpers,
    "use-error-message": useErrorMessage,
    "use-goto-app-helper": useGotoAppHelper,
    "use-json-helpers": useJsonHelpers,
    "use-rule-ref": useRuleRef,
    "use-synced-reset": useSyncedReset,
    "use-transient-value": useTransientValue,
    "use-truncate": useTruncate,
  },
});
