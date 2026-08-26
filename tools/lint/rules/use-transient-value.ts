import { defineRule } from "@oxlint/plugins";

/**
 * The receipt pattern: show something, then clear it after a moment. Four sites
 * hand-rolled the timer because `useTransientFlag` could only return a boolean
 * and they needed to carry a value (structure review, finding 11) — and the
 * ones that skipped holding the timer LEAKED it, so an unmount inside the
 * window left a dead `setState` firing into a gone component.
 *
 * WHY THE SHAPE IS THIS NARROW. A first cut matched any `setTimeout` whose
 * callback called a setter, and that is also the shape of a DEBOUNCE
 * (`setTimeout(() => setQuery(raw), 150)` in `PresetTree`) and of a
 * close-delay (`hover-card-hooks`). Neither wants this hook, and a rule that
 * fires on them teaches people to reach for a disable.
 *
 * What actually distinguishes a receipt is the PAIR: the same setter is called
 * directly, and then scheduled to be called again. A debounce only ever
 * schedules. So the rule looks for both halves in one block, and reports
 * nothing otherwise.
 */

/** `setTimeout` itself starts with "set", so a name test alone would count the
 *  scheduler as a direct setter and the pair would never be seen. */
const TIMER_APIS = new Set(["setTimeout", "setInterval", "setImmediate"]);

/** A React-style state setter — `setFoo`, never a timer API. */
function isStateSetter(name: string): boolean {
  return /^set[A-Z]/.test(name) && !TIMER_APIS.has(name);
}

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      useTransientValue:
        "Use `useTransientValue(ms)` (or `useTransientFlag`) from `@/hooks` instead of hand-rolling a self-clearing receipt — the hook holds the handle, so an unmount inside the window cannot leave a dead `setState` firing into a gone component.",
    },
  },
  createOnce(context) {
    return {
      BlockStatement(node) {
        /** Setters this block has already called outright. */
        const setDirectly = new Set<string>();

        for (const statement of node.body) {
          if (statement.type !== "ExpressionStatement") {
            continue;
          }
          const expression = statement.expression;

          // `setThing(value);`
          if (
            expression.type === "CallExpression" &&
            expression.callee.type === "Identifier" &&
            isStateSetter(expression.callee.name)
          ) {
            setDirectly.add(expression.callee.name);
            continue;
          }

          // `setTimeout(…)` — bare, or with its handle kept in a ref, which is
          // the careful half of the hand-rolled idiom.
          const call = expression.type === "AssignmentExpression" ? expression.right : expression;
          if (call.type !== "CallExpression") {
            continue;
          }
          const callee = call.callee;
          const schedules =
            (callee.type === "Identifier" && callee.name === "setTimeout") ||
            (callee.type === "MemberExpression" &&
              callee.property.type === "Identifier" &&
              callee.property.name === "setTimeout");
          if (!schedules) {
            continue;
          }

          const [callback] = call.arguments;
          if (
            callback?.type !== "ArrowFunctionExpression" &&
            callback?.type !== "FunctionExpression"
          ) {
            continue;
          }
          // `() => setThing(null)` or `() => { setThing(null); }`
          const body = callback.body;
          if (body === null) {
            continue;
          }
          let cleared = body.type === "BlockStatement" ? undefined : body;
          if (body.type === "BlockStatement" && body.body.length === 1) {
            const only = body.body[0];
            cleared = only?.type === "ExpressionStatement" ? only.expression : undefined;
          }
          if (
            cleared?.type === "CallExpression" &&
            cleared.callee.type === "Identifier" &&
            setDirectly.has(cleared.callee.name)
          ) {
            context.report({ node: statement, messageId: "useTransientValue" });
            return;
          }
        }
      },
    };
  },
});
