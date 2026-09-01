import { defineRule } from "@oxlint/plugins";

/**
 * The lie `tsc` agrees with. `JSON.stringify` is declared to return `string`,
 * but it returns `undefined` for `undefined`, a function and a symbol —
 * lib.es5's overload hides that, so neither the compiler nor a reviewer sees a
 * `string`-returning function that can hand back `undefined`.
 *
 * It shipped. `cli/src/output.ts`'s `json(value: unknown): string` was a bare
 * `return JSON.stringify(value, null, 2)`, and `run`/`tree` pass optionally
 * undefined fields (`finalConfig`, `presetTree`), so `rcd run --select tree` on
 * a run with no tree printed the header and then a blank line (structure
 * review, finding 9). The fix was the `?? "null"` now on output.ts:29.
 *
 * That guard is a hand-maintained idiom with eight deliberate instances across
 * the packages and one forgotten copy that shipped, which is what makes it
 * mechanical rather than a preference — and finding 9's own fix note says the
 * `??` "reads as dead code to the next reader", i.e. a guard that looks
 * unnecessary is a guard that gets deleted.
 *
 * WHY THE SHAPE IS THIS NARROW. The rule matches only a `JSON.stringify` call
 * that IS the returned expression — a `ReturnStatement`'s argument or an arrow's
 * expression body. Every already-honest site falls out with no rule logic:
 * `return JSON.stringify(x) ?? "null"` is a `LogicalExpression` and
 * `return JSON.stringify(a) === JSON.stringify(b)` a `BinaryExpression`, so the
 * five guarded sites and the six equality tests are never even visited. The one
 * carve-out is a literal aggregate argument (`JSON.stringify([a, b])`,
 * `JSON.stringify({ a })`), which always stringifies to a string.
 *
 * KNOWN FALSE NEGATIVE, kept deliberately: the same lie inside a
 * `ConditionalExpression` (`(v) => (typeof v === "string" ? v : JSON.stringify(v))`)
 * is not matched. Widening to "any `JSON.stringify` in a return position" would
 * start reaching the equality comparisons, which are the whole false-positive
 * surface.
 */

interface CalleeLike {
  type: string;
  computed?: boolean;
  object?: { type: string; name?: string };
  property?: { type: string; name?: string };
}

/** `JSON.stringify(<not an array or object literal>, …)` */
function isUnguardedStringify(node: { type: string } | null | undefined): boolean {
  if (node?.type !== "CallExpression") {
    return false;
  }
  const call = node as { callee?: CalleeLike; arguments?: { type: string }[] };
  const callee = call.callee;
  if (
    callee?.type !== "MemberExpression" ||
    callee.computed ||
    callee.object?.type !== "Identifier" ||
    callee.object.name !== "JSON" ||
    callee.property?.type !== "Identifier" ||
    callee.property.name !== "stringify"
  ) {
    return false;
  }
  // A literal aggregate always stringifies to a string, so the lie cannot bite.
  const first = call.arguments?.[0]?.type;
  return first !== "ArrayExpression" && first !== "ObjectExpression";
}

export default defineRule({
  meta: {
    type: "problem",
    messages: {
      unguardedStringify:
        '`JSON.stringify` is declared to return `string` but returns `undefined` for `undefined`, a function or a symbol — lib.es5\'s overload hides that from `tsc`. Append the fallback its siblings use (`?? "null"` in the CLI, `?? "undefined"` in the app, `?? String(value)` where the input is arbitrary). This rule is syntactic and never reads the signature, so widening the declared return to `string | undefined` does NOT silence it — if that is the right call here, take it and add an `// oxlint-disable-next-line rcd/no-unguarded-json-stringify -- <why>` stating that the caller handles `undefined`.',
    },
  },
  createOnce(context) {
    return {
      // `return JSON.stringify(value);`
      ReturnStatement(node) {
        const returned = node.argument;
        if (returned !== null && isUnguardedStringify(returned)) {
          context.report({ node: returned, messageId: "unguardedStringify" });
        }
      },
      // `(value) => JSON.stringify(value)` — expression body only; a block body
      // reaches the `ReturnStatement` visitor instead.
      ArrowFunctionExpression(node) {
        if (isUnguardedStringify(node.body)) {
          context.report({ node: node.body, messageId: "unguardedStringify" });
        }
      },
    };
  },
});
