import { defineRule, type ESTree } from "@oxlint/plugins";

/**
 * Arm (a). The home is `plural(n, word)` in `packages/app/src/lib/format.ts`,
 * whose own docblock states the charter: "the count is ALWAYS formatted through
 * `nf`; that is the whole reason this is shared".
 *
 * The defect shipped. `JsonDiff`'s footer read `Showing the first
 * {MAX_RENDERED_LINES} of {stat.total} diff lines` — both counts interpolated
 * raw, so a four-figure diff rendered "1234" where the rest of the UI rendered
 * "1,234" (sweep finding 27, fixed in 7619e7bb by routing both through `nf`).
 * The hand-spelled `{n} {pluralWord(n, word)}` pair is that same divergence
 * with a helper in it: `pluralWord` returns the WORD only, so the count beside
 * it is still raw. 27b81f43 swept the ad-hoc `rule{s}` spellings onto the two
 * helpers and left seventeen of these pairs behind — each trivially correct on
 * its own, which is exactly why review never caught them, and every one of them
 * in a module that already imports from `@/lib/format`, so the fix is a name
 * added to an import that is already there (`CascadeStack` had `plural` on that
 * line already).
 *
 * WHY THE SHAPE IS THIS NARROW. `plural` prints "<nf count> <word>" and nothing
 * else, so the rule fires only where that exact string is what the site builds:
 * the count must be the IMMEDIATELY PRECEDING sibling expression, and its
 * source text must be identical to the argument `pluralWord` is handed. Three
 * things fall out of that, all deliberate:
 *
 *   - Chrome the helper cannot produce stays silent. `<strong>{nf.format(p)}
 *     </strong>{" "}{pluralWord(p, "preset")}` puts the number in its own
 *     element, so the previous rendered child is an element, not a container.
 *   - A sentence with a word between — `${hidden} more ${pluralWord(hidden, …)}`,
 *     `${count} of your ${pluralWord(count, …)}` — is not a shape `plural` can
 *     express at all, and the adjacency requirement is what leaves it alone.
 *   - Textual identity is what makes this safe with no type information, and it
 *     costs a false negative: `{nf.format(total)}{" "}{pluralWord(total, …)}` is
 *     a real hit the rule does not report, because the preceding expression
 *     reads `nf.format(total)` and the argument reads `total`. That is the
 *     price of a zero false-positive count, and it is worth paying.
 *
 * THE SEPARATOR IS CHECKED, NOT SKIPPED, and the two whitespace spellings are
 * not interchangeable. JSX renders a whitespace-only `JSXText` run that
 * contains a NEWLINE as nothing at all, so `<p>{n}\n{pluralWord(n, "rule")}</p>`
 * renders "5rules" and `plural` would render "5 rules" — reporting it would be
 * advice that changes the output. A run with no newline, and the `{" "}` the
 * formatter leaves in its place whenever the line wraps, both render one space,
 * which is exactly what `plural` prints between the count and the word. So the
 * rule drops the newline runs (they render nothing, and one sits between the
 * `{" "}` and the call in two of the seventeen sites) and REQUIRES what is left
 * between the two containers to be a single rendered space.
 *
 * Those two spellings are all the rule sees. A count assembled any other way —
 * split across an attribute boundary, or routed through a variable so the two
 * texts no longer match — is out of shape and deliberately not guessed at: the
 * `use-truncate` move, match the one spelling that is unambiguous rather than
 * widen and be wrong.
 */

const HELPER = "pluralWord";

type TextOf = (node: ESTree.Node) => string;

/** `pluralWord(<count>, <word>)` — the hand-spelled half, two arguments exactly. */
function pluralWordCall(node: ESTree.JSXExpression): ESTree.CallExpression | undefined {
  if (node.type !== "CallExpression") {
    return undefined;
  }
  const callee = node.callee;
  if (callee.type !== "Identifier" || callee.name !== HELPER || node.arguments.length !== 2) {
    return undefined;
  }
  return node;
}

/** The single rendered space `plural` itself prints, either spelling of it. */
const SPACE = "space";
type Rendered = ESTree.JSXChild | typeof SPACE;

/** `{" "}` — a container holding one space and nothing else. */
function isSpaceString(node: ESTree.JSXExpression): boolean {
  return node.type === "Literal" && node.value === " ";
}

/** A whitespace-only `JSXText` run holding a newline renders NOTHING — JSX
 *  strips it — so it is not a sibling, and it is what sits between a wrapped
 *  `{" "}` and the call on the next line. */
function isStripped(child: ESTree.JSXChild): boolean {
  return child.type === "JSXText" && child.value.trim() === "" && child.value.includes("\n");
}

/** One rendered space, spelled as `JSXText` or as the wrapped `{" "}`. */
function isSingleSpace(child: ESTree.JSXChild): boolean {
  if (child.type === "JSXText") {
    return child.value === " ";
  }
  return child.type === "JSXExpressionContainer" && isSpaceString(child.expression);
}

/** What the children render, with each one-space separator collapsed to `SPACE`
 *  — a newline-only run renders nothing and is dropped; anything else stays a
 *  sibling, so it breaks the adjacency the rule requires. */
function renderedChildren(children: readonly ESTree.JSXChild[]): Rendered[] {
  const rendered: Rendered[] = [];
  for (const child of children) {
    if (isStripped(child)) {
      continue;
    }
    rendered.push(isSingleSpace(child) ? SPACE : child);
  }
  return rendered;
}

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      preferPlural:
        "Use `plural(n, word)` from `@/lib/format` instead of writing the count next to `pluralWord(n, word)` — `plural` runs the count through the shared `nf` and this pair interpolates it raw, so the two spellings diverge the moment the number reaches four figures.",
    },
  },
  createOnce(context) {
    // Read lazily: oxlint throws on `context.sourceCode` touched in the
    // `createOnce` prologue, so the access has to happen inside a visitor.
    const textOf: TextOf = (node) => context.sourceCode.getText(node);

    // `{count} {pluralWord(count, word)}` — two JSX children with exactly the
    // one space between them that `plural` prints itself.
    const checkChildren = (children: readonly ESTree.JSXChild[]): void => {
      const kids = renderedChildren(children);
      for (const [index, child] of kids.entries()) {
        if (child === SPACE || child.type !== "JSXExpressionContainer") {
          continue;
        }
        const call = pluralWordCall(child.expression);
        const count = call?.arguments[0];
        const previous = kids[index - 2];
        if (call === undefined || count === undefined || kids[index - 1] !== SPACE) {
          continue;
        }
        if (
          previous !== undefined &&
          previous !== SPACE &&
          previous.type === "JSXExpressionContainer" &&
          textOf(previous.expression) === textOf(count)
        ) {
          context.report({ node: call, messageId: "preferPlural" });
        }
      }
    };

    return {
      JSXElement(node) {
        checkChildren(node.children);
      },
      JSXFragment(node) {
        checkChildren(node.children);
      },
      // `` `${count} ${pluralWord(count, word)}` `` — the quasi BETWEEN the two
      // expressions is the whole separator, so it must be exactly one space.
      TemplateLiteral(node) {
        for (const [index, expression] of node.expressions.entries()) {
          const call = pluralWordCall(expression);
          const count = call?.arguments[0];
          const previous = node.expressions[index - 1];
          if (call === undefined || count === undefined || previous === undefined) {
            continue;
          }
          if (node.quasis[index]?.value.raw === " " && textOf(previous) === textOf(count)) {
            context.report({ node: call, messageId: "preferPlural" });
          }
        }
      },
    };
  },
});
