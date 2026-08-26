import { defineRule } from "@oxlint/plugins";

/**
 * `packageRules[N]` is how the app refers to one entry of the merged rule
 * array, and the SPELLING is what a reader matches against their own editor and
 * against Renovate's own validator output. The template was written out about a
 * dozen times across six files before `lib/rule-ref.ts` existed (structure
 * review, finding 14).
 *
 * Each copy is trivially right on its own, which is why nobody minded — and
 * exactly why drift to `packageRules #3` in one view would be a real defect
 * nobody caught in review either.
 *
 * Matches a template literal whose static text opens the subscript, so
 * `` `packageRules[${i}]` `` is caught and a mention inside prose is not (a
 * doc comment is not a TemplateLiteral). `ruleRef`'s own definition is exempted
 * by path in `.oxlintrc.json`, since it is the one place the string may live.
 */
export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      useRuleRef:
        "Use `ruleRef(index)` from `@/lib/rule-ref` — the `packageRules[N]` spelling is what readers match against their own editor and against Renovate's validator messages, so it lives in one place.",
    },
  },
  createOnce(context) {
    return {
      TemplateLiteral(node) {
        const opensSubscript = node.quasis.some((quasi) =>
          quasi.value.raw.includes("packageRules["),
        );
        if (opensSubscript) {
          context.report({ node, messageId: "useRuleRef" });
        }
      },
    };
  },
});
