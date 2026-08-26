import { definePlugin } from "@oxlint/plugins";
import noLocalIsPlainObject from "./rules/no-local-is-plain-object.ts";
import useErrorMessage from "./rules/use-error-message.ts";
import useRuleRef from "./rules/use-rule-ref.ts";
import useSyncedReset from "./rules/use-synced-reset.ts";
import useTransientValue from "./rules/use-transient-value.ts";
import useTruncate from "./rules/use-truncate.ts";

/**
 * This repo's own lint rules — the "house rules".
 *
 * Every one is derived from duplication that was ACTUALLY in the tree and had
 * to be collapsed by hand during the 2026-08 structure review. None is a
 * preference. The bar each had to clear: at least two sites existed, a shared
 * helper now exists, and a future third copy would be invisible in review
 * because each copy is trivially correct on its own.
 *
 * Three earn their place on evidence stronger than a count. `use-truncate`
 * guards a defect that shipped — a fix diff could split a surrogate pair and
 * render an emoji as a replacement glyph. `use-synced-reset` guards a
 * during-render invariant whose violation silently undoes a user's first click.
 * `use-transient-value` guards a leak class the hook was written to close.
 *
 * WHAT IS DELIBERATELY NOT HERE. A rule is the right tool only when the
 * duplicate cannot be REMOVED. The review also found a message phrase the
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
    "use-error-message": useErrorMessage,
    "use-rule-ref": useRuleRef,
    "use-synced-reset": useSyncedReset,
    "use-transient-value": useTransientValue,
    "use-truncate": useTruncate,
  },
});
