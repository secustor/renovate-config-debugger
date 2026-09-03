import { definePlugin } from "@oxlint/plugins";
import commentCitesWhatExists from "./rules/comment-cites-what-exists.ts";
import noUncaughtVoidChain from "./rules/no-uncaught-void-chain.ts";
import noUnsynchronisedReassert from "./rules/no-unsynchronised-reassert.ts";
import preferIsHelpers from "./rules/prefer-is-helpers.ts";
import preferPlural from "./rules/prefer-plural.ts";
import useErrorMessage from "./rules/use-error-message.ts";
import useGotoAppHelper from "./rules/use-goto-app-helper.ts";
import useJsonHelpers from "./rules/use-json-helpers.ts";
import useJsonSnippet from "./rules/use-json-snippet.ts";
import useLookupAccessors from "./rules/use-lookup-accessors.ts";
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
 * Eleven of the fourteen clear (a). Three clear (b): `no-uncaught-void-chain`,
 * which bans a construct and names no import, and the two the third sweep
 * added, which name a correction instead of a ban. Say which arm a new rule is
 * on when you add one.
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
 * The 2026-09 structure sweep III added three more. `prefer-plural` (arm a) is
 * the move done in the preferred order: the home — `plural(n, word)` in
 * `packages/app/src/lib/format.ts` — was built first, and its docblock already
 * stated the charter the tree was not keeping ("the count is ALWAYS formatted
 * through `nf`"). The defect shipped as raw counts in `JsonDiff`'s footer
 * (sweep finding 27, fixed in 7619e7bb); 27b81f43 then swept the ad-hoc
 * `rule{s}` spellings onto `plural`/`pluralWord` and left seventeen
 * `{n} {pluralWord(n, word)}` pairs behind — each trivially correct on its own,
 * and every one of them a `plural` added to an `@/lib/format` import the module
 * already had (one, `CascadeStack`, was importing `plural` on the same line
 * already). That is the invisible-in-review condition, empirically.
 * Landing the rule REMOVED the duplicate: all seventeen are converted here.
 *
 * The other two are on (b), and both are the holding pen used the way the
 * paragraph above asks — a named correction, not a stop sign.
 * `no-unsynchronised-reassert` guards a defect that shipped six times over: a
 * Playwright assertion re-stating a claim that was already true resolves on its
 * first poll against the pre-interaction page, so the test cannot fail for the
 * reason it names. `e2e/helpers.ts`'s `expectRunIdle` docblock had already
 * written the principle down and 335a72ce fixed two by hand; the diagnostic
 * names the sequencing fix, and enabling it forced six more. It is enabled only
 * on `packages/app/e2e/*.spec.ts`, for `use-goto-app-helper`'s recorded reason.
 * `comment-cites-what-exists` is the first arm-(b) rule that names a
 * DESTINATION: six of the twenty-three sweep findings were a docblock citing a
 * file that never existed or naming the file a symbol lives in after the symbol
 * moved (fixed across a721e15f and 7619e7bb), so it resolves both ends of a
 * citation against the real tree and its message says which file DOES define
 * the symbol. Two message ids in one file on purpose — the arms share one repo
 * file index, one `getAllComments()` pass and one comment normalization, and
 * two files would walk the filesystem twice. It is the only house rule that
 * touches the filesystem; the walk is memoized once per lint process.
 *
 * The 2026-09 structure sweep IV added two rules and widened two, all on arm
 * (a). `use-lookup-accessors` guards the sharpest defect of the set:
 * `lib/share.ts:440` read `PLATFORM_ENDPOINTS[platform]` with a platform taken
 * straight out of a share-link fragment, so `platform=constructor` resolved to
 * `Object.prototype.constructor` and returned a FUNCTION as the endpoint
 * (finding 69). 75684991 built the two own-key accessors — `defaultEndpointFor`
 * and `platformForHost` — and converted ten computed accesses across five
 * files; nine were harmless, which is exactly why the tenth went unseen. It is
 * table-driven (two entries today, a third is one line) and purely preventive:
 * zero live hits, because `HOST_PLATFORM[parsed.host]` on a host the user TYPES
 * is the natural thing to write. `use-json-snippet` is the cheapest rule of the
 * set — one visitor, one messageId — and the home, `jsonSnippet(value, max)` in
 * `@/lib/value-preview`, was built by this sweep's own fix commit (finding 48:
 * the simulator's `previewValue` was `fixSnippet`'s body with the budget as a
 * parameter, byte-identical and with the same two imports, living in a feature
 * slice while `value-preview.ts` declared itself the home). Two more literal
 * copies were still live and are converted by landing it. Both rules are
 * app-only, which removes their only false positives structurally rather than
 * by heuristic.
 *
 * The two widenings sit on rules already here. `prefer-plural` grew from the
 * `{n} {pluralWord(n, word)}` adjacency arm to the hand-spelled
 * `n === 1 ? "rule" : "rules"` ternary (`preferPluralWord` /
 * `preferPluralSuffix`), because that is the spelling the defect SHIPPED in:
 * `cli/src/rule-view.ts` pluralised on the hidden count rather than the total
 * and printed "1 of 2 rule hidden" (finding 62, 34421b97 corrected the operand
 * and left the shape). Routing through `plural(n, word)` makes the divergence
 * unspellable — one operand feeds both the count and the noun. Its home now
 * reaches the CLI through `packages/app/src/lib/headless.ts`, so it is no
 * longer app-only, and six sites convert on landing, four of them in the CLI.
 * `comment-cites-what-exists` grew a second citation spelling, the possessive
 * ``File.tsx's `symbol` ``, which the shipped regex could not see because it
 * requires the symbol first: two docblocks citing `App.tsx`'s `signInRef`, a
 * symbol that exists nowhere in the repo, survived the very sweep that was
 * hunting this class. The backtick around the symbol is the whole precision
 * device — without it the possessive matches fifteen lines of ordinary prose,
 * with it five.
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
    "comment-cites-what-exists": commentCitesWhatExists,
    "no-uncaught-void-chain": noUncaughtVoidChain,
    "no-unsynchronised-reassert": noUnsynchronisedReassert,
    "prefer-is-helpers": preferIsHelpers,
    "prefer-plural": preferPlural,
    "use-error-message": useErrorMessage,
    "use-goto-app-helper": useGotoAppHelper,
    "use-json-helpers": useJsonHelpers,
    "use-json-snippet": useJsonSnippet,
    "use-lookup-accessors": useLookupAccessors,
    "use-rule-ref": useRuleRef,
    "use-synced-reset": useSyncedReset,
    "use-transient-value": useTransientValue,
    "use-truncate": useTruncate,
  },
});
