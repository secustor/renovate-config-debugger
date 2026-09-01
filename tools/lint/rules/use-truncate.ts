import { defineRule } from "@oxlint/plugins";

/**
 * The strongest case of the set despite the lowest count: this one guards a
 * defect that shipped.
 *
 * `ProblemCard` and `ErrorTranslationView` each carried a byte-identical
 * `formatSnippet` doing `text.slice(0, 140)` with an ellipsis appended
 * (structure review, finding 3). `slice` cuts UTF-16 code UNITS, so a cut
 * landing between the halves of a surrogate pair leaves an orphan — an emoji
 * rendered as U+FFFD by the very code meant to make the value readable.
 * `lib/truncate.ts` exists precisely so no caller does this.
 *
 * WHY THE SHAPE IS THIS NARROW. A first cut matched any `.slice(0, N)` and was
 * wrong on every single hit in this repo: `QUICK_FILLS.slice(0, 3)`,
 * `changedKeys.slice(0, 3)`, `files.slice(0, 4)`, `names.slice(0, 2)` are all
 * ARRAY slices, and without type information an AST rule cannot tell an array
 * from a string. So it does not try. It matches the one thing that is
 * unambiguously text truncation: a slice whose result has an ELLIPSIS stuck
 * directly onto it, which is the shape of both defect sites and is what makes
 * the intent "shorten this for display" rather than "take the first few".
 *
 * The adjacent ellipsis, not the literalness of N, is what makes the match
 * unambiguous — so the length may also be an identifier: the two sites this
 * widening caught (`previewValue`, `pin-probe`'s clip) passed a named constant.
 */

const ELLIPSIS = "…";

/** `<expr>.slice(0, <number literal | identifier>)` */
function isFirstNSlice(node: { type: string; callee?: unknown; arguments?: unknown[] }): boolean {
  if (node.type !== "CallExpression") {
    return false;
  }
  const callee = node.callee as {
    type: string;
    computed?: boolean;
    property?: { type: string; name?: string };
  };
  if (
    callee?.type !== "MemberExpression" ||
    callee.computed ||
    callee.property?.type !== "Identifier" ||
    callee.property.name !== "slice"
  ) {
    return false;
  }
  const args = (node.arguments ?? []) as { type: string; value?: unknown }[];
  if (args.length !== 2) {
    return false;
  }
  if (args[0]?.type !== "Literal" || args[0].value !== 0) {
    return false;
  }
  return (
    args[1]?.type === "Identifier" ||
    (args[1]?.type === "Literal" && typeof args[1].value === "number")
  );
}

function isEllipsisLiteral(node: { type: string; value?: unknown } | undefined): boolean {
  return (
    node?.type === "Literal" && typeof node.value === "string" && node.value.includes(ELLIPSIS)
  );
}

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      useTruncate:
        "Use `truncate(text, max)` from `@/lib/truncate` instead of slicing display text and appending an ellipsis — a cut between the halves of a surrogate pair renders an emoji as a replacement glyph.",
    },
  },
  createOnce(context) {
    return {
      // `text.slice(0, 140) + "…"` (either operand order)
      BinaryExpression(node) {
        if (node.operator !== "+") {
          return;
        }
        const pairs = [
          [node.left, node.right],
          [node.right, node.left],
        ] as const;
        for (const [slice, ellipsis] of pairs) {
          if (isFirstNSlice(slice) && isEllipsisLiteral(ellipsis)) {
            context.report({ node: slice, messageId: "useTruncate" });
            return;
          }
        }
      },
      // `` `${text.slice(0, 140)}…` `` — the quasi that FOLLOWS the expression
      // is the one that would carry the ellipsis.
      TemplateLiteral(node) {
        for (const [index, expression] of node.expressions.entries()) {
          const following = node.quasis[index + 1];
          if (isFirstNSlice(expression) && following?.value.raw.startsWith(ELLIPSIS)) {
            context.report({ node: expression, messageId: "useTruncate" });
          }
        }
      },
    };
  },
});
