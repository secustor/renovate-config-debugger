import { defineRule } from "@oxlint/plugins";

/**
 * `isPlainObject` existed four times, byte-identical, three of them private
 * copies (structure review, finding 13). `lib/input-schemas.ts` exports the
 * one the repo has decided to own.
 *
 * The cheapest rule of the set and the most generalisable: ban a LOCAL
 * declaration of a name the repo owns centrally. The designated file is
 * exempted by path in `.oxlintrc.json`, which is the same shape as the
 * single-import-site exemptions already there for zod, the schema stack and the
 * engine root.
 */

/** Helpers this repo owns in exactly one place. Add sparingly: a name belongs
 *  here once a second copy has actually appeared, not in anticipation. */
const OWNED_HELPERS = new Set(["isPlainObject"]);

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      ownedElsewhere:
        "`{{name}}` is owned centrally — import it rather than declaring a local copy. Byte-identical private copies of this helper are what the shared one replaced.",
    },
  },
  createOnce(context) {
    return {
      FunctionDeclaration(node) {
        const name = node.id?.name;
        if (name !== undefined && OWNED_HELPERS.has(name)) {
          context.report({ node, messageId: "ownedElsewhere", data: { name } });
        }
      },
    };
  },
});
