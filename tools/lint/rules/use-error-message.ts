import { defineRule } from "@oxlint/plugins";

/**
 * `catch (err)` gives `unknown`, so every call site has to narrow it — and nine
 * of them had spelled the same narrowing by hand before `lib/errors.ts` existed
 * (structure review, finding 12). Three carried the nested-cause unwrap on top,
 * and one had a comment saying it was copied from another.
 *
 * Matches the shape, not the identifier: `x instanceof Error ? x.message :
 * String(x)` in any spelling. The `String(…)` call and the `.message` access
 * are what make it this idiom rather than a coincidence, so both are required.
 */
export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      useErrorMessage:
        "Use `errorMessage(err)` from `@/lib/errors` (or `causedErrorMessage` when the interesting detail is nested at `err.err.message`) instead of spelling the instanceof narrowing by hand.",
    },
  },
  createOnce(context) {
    return {
      ConditionalExpression(node) {
        const test = node.test;
        if (
          test.type !== "BinaryExpression" ||
          test.operator !== "instanceof" ||
          test.right.type !== "Identifier" ||
          test.right.name !== "Error"
        ) {
          return;
        }
        // `… ? err.message : …`
        const consequent = node.consequent;
        const readsMessage =
          consequent.type === "MemberExpression" &&
          consequent.property.type === "Identifier" &&
          consequent.property.name === "message";
        // `… : String(err)`
        const alternate = node.alternate;
        const fallsBackToString =
          alternate.type === "CallExpression" &&
          alternate.callee.type === "Identifier" &&
          alternate.callee.name === "String";
        if (readsMessage && fallsBackToString) {
          context.report({ node, messageId: "useErrorMessage" });
        }
      },
    };
  },
});
