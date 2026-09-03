import { defineRule } from "@oxlint/plugins";

/**
 * `void` is this repo's marker for "deliberately detached" — and a detached
 * chain has, by construction, nowhere for a rejection to go.
 *
 * The defect shipped. `use-one-off-simulation` ran the one-off check as `void
 * runSimulation(…).then(…).finally(() => setSimulating(false))`: a rejected
 * simulation cleared the spinner and left the previous verdict standing beside
 * a check that never happened. The fix (bad2836a) inserted the `.catch` that
 * sets the error and drops the stale verdict.
 *
 * The CLASS recurs, in a second spelling this rule deliberately does NOT fire
 * on: `use-engine-helpers` detached an engine load as `void (async () => { … })()`
 * and dropped its rejection the same way, fixed in b693f53c. That spelling is
 * left to per-site judgement (see the narrowing below), so it is evidence that
 * detach-and-forget is a habit here — not a second site this rule catches.
 *
 * NOT A DUPLICATE of `promise/catch-or-return`, which is already enabled: that
 * rule reports `p().then(f)` and does NOT report `void p().then(f)` — the
 * `void` half, which is the half both defects were written in, is uncovered.
 *
 * WHY THE SHAPE IS THIS NARROW. Only an `ExpressionStatement` counts, so a
 * chain in an ARGUMENT (`lazy(() => load().then(pick))`) or an INITIALIZER
 * (`const run = queue.then(…)`) is never seen — those hand the promise to
 * someone who can still await or reject it. Any `catch` anywhere in the chain
 * silences the report, wherever it sits, and so does a `.then` called with two
 * arguments, since the second argument IS the rejection handler. And `void
 * (async () => { … })()` is deliberately not matched: the callee is a function
 * expression, the walk collects nothing, and whether the handling inside the
 * body is right is a per-site judgement rather than a shape.
 */

interface ChainLink {
  name: string;
  argCount: number;
}

/**
 * The method names called on `node`'s callee chain, innermost call last.
 * Walks down through non-computed member calls only, stopping at anything else
 * — an identifier callee, a function expression, a computed access.
 */
function chainLinks(node: unknown): ChainLink[] {
  const links: ChainLink[] = [];
  let current = node as { type?: string; callee?: unknown; arguments?: unknown[] } | undefined;
  while (current?.type === "CallExpression") {
    const callee = current.callee as
      | {
          type?: string;
          computed?: boolean;
          object?: unknown;
          property?: { type?: string; name?: string };
        }
      | undefined;
    if (
      callee?.type !== "MemberExpression" ||
      callee.computed === true ||
      callee.property?.type !== "Identifier" ||
      typeof callee.property.name !== "string"
    ) {
      return links;
    }
    links.push({ name: callee.property.name, argCount: (current.arguments ?? []).length });
    current = callee.object as { type?: string; callee?: unknown; arguments?: unknown[] };
  }
  return links;
}

export default defineRule({
  meta: {
    type: "problem",
    messages: {
      uncaughtVoidChain:
        "`void` detaches this promise chain, so a rejection has nowhere to go — the failure is dropped and the UI keeps whatever state the success path was meant to replace. Chain a `.catch` that reports the failure (or pass the handler as `.then`'s second argument). If dropping it really is correct here, an `// oxlint-disable-next-line rcd/no-uncaught-void-chain -- <why>` is the escape — a plain comment does not silence this rule.",
    },
  },
  createOnce(context) {
    return {
      // `void <call>.then(…)…;` as a statement of its own
      ExpressionStatement(node) {
        const expression = node.expression;
        if (
          expression.type !== "UnaryExpression" ||
          expression.operator !== "void" ||
          expression.argument.type !== "CallExpression"
        ) {
          return;
        }
        const links = chainLinks(expression.argument);
        const handled = links.some(
          (link) => link.name === "catch" || (link.name === "then" && link.argCount >= 2),
        );
        const settles = links.some((link) => link.name === "then" || link.name === "finally");
        if (settles && !handled) {
          context.report({ node: expression, messageId: "uncaughtVoidChain" });
        }
      },
    };
  },
});
