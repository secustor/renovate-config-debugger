import { defineRule } from "@oxlint/plugins";

/**
 * Arm (a). The home is `jsonSnippet(value, max)` in
 * `packages/app/src/lib/value-preview.ts`, whose docblock declares itself the
 * app's one rendering of raw JSON at a display budget.
 *
 * `truncate(jsonText(value), n)` had already been spelled out twice before the
 * helper existed: `fixSnippet`'s body, and the simulator's own
 * `previewValue(value, max = 60)` — byte-identical, with the same two imports,
 * living in a feature slice while `lib/value-preview.ts` declared itself the
 * home (sweep IV finding 48, fixed in 75684991 by deleting `previewValue` and
 * calling `jsonSnippet`). Two more copies were still live when this rule
 * landed, in `description-ledger.ts` and `option-docs.tsx`, and each is
 * trivially correct on its own — which is exactly why review never caught
 * them.
 *
 * WHY THE SHAPE IS THIS NARROW. The two-name coincidence IS the narrowing. The
 * rule never inspects what is being truncated (the `use-truncate` move), never
 * looks at the budget, and never checks the import: `truncate` and `jsonText`
 * are only ever imported under `packages/app/src` — from `@/lib/truncate` and
 * `@renovate-config-debugger/engine/json` — and no local binding shadows
 * either, so a shadowed name is the sole theoretical false positive.
 *
 * DELIBERATE FALSE NEGATIVE. A site that parks the JSON in a variable first
 * (`const text = jsonText(v); truncate(text, n);`) is not reported. Literal
 * composition is the price of the zero-false-positive count; the alternative is
 * scope analysis for a shape that has never appeared.
 */
export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      useJsonSnippet:
        "Use `jsonSnippet(value, max)` from `@/lib/value-preview` instead of composing `truncate(jsonText(value), n)` — that composition is the app's one rendering of raw JSON at a display budget, and `value-preview.ts` exists because it had already been spelled inline twice.",
    },
  },
  createOnce(context) {
    return {
      // `truncate(jsonText(value), n)`
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "truncate") {
          return;
        }
        const [text] = node.arguments;
        if (
          text?.type === "CallExpression" &&
          text.callee.type === "Identifier" &&
          text.callee.name === "jsonText" &&
          text.arguments.length === 1
        ) {
          context.report({ node, messageId: "useJsonSnippet" });
        }
      },
    };
  },
});
