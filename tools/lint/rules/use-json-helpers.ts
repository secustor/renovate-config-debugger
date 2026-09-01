import { defineRule, type ESTree } from "@oxlint/plugins";

/**
 * The lie `tsc` agrees with, and the module that now tells it the truth once.
 *
 * `JSON.stringify` is declared to return `string`, but it returns `undefined`
 * for `undefined`, a function and a symbol — lib.es5's overload hides that, so
 * neither the compiler nor a reviewer sees a `string`-returning function that
 * can hand back `undefined`. It shipped: `cli/src/output.ts`'s
 * `json(value: unknown): string` was a bare `return JSON.stringify(value, null, 2)`,
 * and `rcd run --select tree` on a run with no tree printed the header and then
 * a blank line (structure review, finding 9).
 *
 * SUPERSEDES `no-unguarded-json-stringify`, which banned the construct and
 * named no import — arm (b) of the bar in `rules.ts`. That forced it into a
 * very narrow shape: it matched only a `JSON.stringify` in RETURN position,
 * because widening would have started reaching the equality comparisons, which
 * were its whole false-positive surface, and its own header named the ternary
 * it therefore missed. PR 316's review asked for a helper rather than a ban, so
 * `packages/engine/src/json.ts` is now the home, the rule moves to arm (a), and
 * the narrowness is no longer needed: every shape has somewhere to go.
 *
 * WHAT THE HELPER REPLACES IS THE DECISION, NOT THE CALL. Across app, CLI and
 * engine there were 74 non-test calls and FIVE different hand-maintained
 * fallbacks for the same lie (`?? "undefined"`, `?? String(value)`, `?? "null"`,
 * `?? ""`, `?? blocks`) plus 59 calls with none. Which fallback is right is a
 * property of the SINK, not of the site, so the four wrappers are named for
 * sinks: `jsonText` for something a human reads, `jsonLiteral` for text that
 * must parse back, `jsonDocument` for 2-space document text, `jsonFile` for the
 * same plus a trailing newline.
 *
 * WHY THE EQUALITY ARM EXISTS. `JSON.stringify(a) === JSON.stringify(b)` was
 * spelled nine times — 18 of the 74 calls, the single largest class. Without an
 * arm of its own an author converts each side to `jsonText` and `jsonEqual` is
 * never reached.
 *
 * NO CARVE-OUT FOR A LITERAL AGGREGATE. The old rule exempted
 * `JSON.stringify([…])` because such a call always returns a string. Under the
 * helper design the point is not the return type, it is that one module knows
 * the fallback — and dropping the carve-out removes the rule's only piece of
 * type reasoning. A replacer and a `JSON.parse(JSON.stringify(x))` clone
 * genuinely produce no text; there is exactly one of each in the tree, and the
 * repo's convention is that the rare honest exception carries an inline
 * disable stating its invariant.
 */

/** The specifier the diagnostics name. Inside `packages/engine` the same module
 *  is `./json` / `../json`. */
const JSON_MODULE = "@renovate-config-debugger/engine/json";

/** The operators `jsonEqual` can stand in for. */
const COMPARISON_OPERATORS = new Set(["===", "==", "!==", "!="]);

/** …and the half of them that need a leading `!`. */
const NEGATED_OPERATORS = new Set(["!==", "!="]);

/** A non-computed `JSON.stringify` member callee — not `json.stringify`, not
 *  `JSON["stringify"]`, not `serializer.JSON.stringify`. */
function isJsonStringifyCallee(callee: ESTree.CallExpression["callee"]): boolean {
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "JSON" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "stringify"
  );
}

/** `JSON.stringify(x)` with exactly one plain argument — the only shape
 *  `jsonEqual` is equivalent to, since a replacer or an indent changes the text
 *  on both sides. */
function isSingleArgumentStringify(node: ESTree.Node): boolean {
  if (node.type !== "CallExpression" || node.arguments.length !== 1) {
    return false;
  }
  const [argument] = node.arguments;
  return argument?.type !== "SpreadElement" && isJsonStringifyCallee(node.callee);
}

/** Whether `node` is the comparison the equality arm reports, which is what
 *  stops the call arm reporting its two operands a second time. */
function isStringifyComparison(node: ESTree.Node): boolean {
  return (
    node.type === "BinaryExpression" &&
    COMPARISON_OPERATORS.has(node.operator) &&
    isSingleArgumentStringify(node.left) &&
    isSingleArgumentStringify(node.right)
  );
}

export default defineRule({
  meta: {
    type: "problem",
    messages: {
      useJsonHelper:
        "Use a helper from `@renovate-config-debugger/engine/json` instead of `JSON.stringify` (inside `packages/engine`, `./json`). Pick by SINK, not by site: `jsonText` for something a human reads or an identity key (no-JSON-form values read as `undefined`); `jsonLiteral` for text that must parse back — storage, a request body, a share payload, a byte budget (they become `null`); `jsonDocument` for 2-space document text; `jsonFile` for the same plus a trailing newline. `JSON.stringify` is declared to return `string` but returns `undefined` for `undefined`, a function or a symbol, and lib.es5's overload hides that from `tsc` — that is what shipped in `cli/src/output.ts` (sweep finding 9) and it is the only thing these four wrappers do. If this call genuinely produces no text (a replacer, or a `JSON.parse(JSON.stringify(x))` clone), add an `// oxlint-disable-next-line rcd/use-json-helpers -- <why>`.",
      preferJsonEqual:
        "Use `jsonEqual(a, b)` from `{{from}}` instead of comparing two `JSON.stringify` results — nine sites spelled this pair by hand. It is ORDER-SENSITIVE, same as what it replaces; `deepEqual` in `engine/src/lib.ts` is the order-insensitive one.",
      preferNotJsonEqual:
        "Use `!jsonEqual(a, b)` from `{{from}}` instead of comparing two `JSON.stringify` results — nine sites spelled this pair by hand.",
    },
  },
  createOnce(context) {
    return {
      // `JSON.stringify(a) === JSON.stringify(b)`
      BinaryExpression(node) {
        if (!isStringifyComparison(node)) {
          return;
        }
        context.report({
          node,
          messageId: NEGATED_OPERATORS.has(node.operator)
            ? "preferNotJsonEqual"
            : "preferJsonEqual",
          data: { from: JSON_MODULE },
        });
      },
      // …and every other `JSON.stringify`, wherever it stands.
      CallExpression(node) {
        if (!isJsonStringifyCallee(node.callee) || isStringifyComparison(node.parent)) {
          return;
        }
        context.report({ node, messageId: "useJsonHelper" });
      },
    };
  },
});
