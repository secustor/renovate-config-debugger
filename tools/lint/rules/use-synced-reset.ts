import { defineRule } from "@oxlint/plugins";

/**
 * "Reset derived state when this identity changes, during render" — eighteen
 * hand-rolled copies before `hooks/use-synced-reset.ts` (structure review,
 * finding 10, which counted twelve; a full sweep found eighteen).
 *
 * Every copy was the same five lines and carried its own paragraph re-arguing
 * the during-render part. The argument is real — an effect runs after the
 * commit, so a click landing between the paint and the passive flush is
 * enqueued first and then wiped — and it is now made once, in the hook.
 *
 * Detected structurally: an `if` whose test compares two identifiers for
 * INEQUALITY, and whose first statement calls a `setX` with one of the two
 * names the test just compared. That last part is what makes it "adopt the new
 * value" rather than an arbitrary guard that happens to set something.
 */
export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      useSyncedReset:
        "Use `useSyncedReset(value, onChange)` from `@/hooks/use-synced-reset` instead of hand-rolling the owner-state idiom. The hook makes the during-render argument once, and compares with `Object.is` so a NaN owner cannot loop.",
    },
  },
  createOnce(context) {
    return {
      IfStatement(node) {
        const test = node.test;
        if (test.type !== "BinaryExpression") {
          return;
        }
        if (test.operator !== "!==" && test.operator !== "!=") {
          return;
        }
        if (test.left.type !== "Identifier" || test.right.type !== "Identifier") {
          return;
        }
        const compared = new Set([test.left.name, test.right.name]);

        const body = node.consequent;
        const first = body.type === "BlockStatement" ? body.body[0] : body;
        if (first?.type !== "ExpressionStatement") {
          return;
        }
        const call = first.expression;
        if (call.type !== "CallExpression" || call.callee.type !== "Identifier") {
          return;
        }
        if (!/^set[A-Z]/.test(call.callee.name)) {
          return;
        }
        const [argument] = call.arguments;
        if (argument?.type === "Identifier" && compared.has(argument.name)) {
          context.report({ node, messageId: "useSyncedReset" });
        }
      },
    };
  },
});
