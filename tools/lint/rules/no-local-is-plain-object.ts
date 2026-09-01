import { defineRule, type ESTree } from "@oxlint/plugins";

/**
 * `isPlainObject` existed four times, byte-identical, three of them private
 * copies (structure review, finding 13). `lib/input-schemas.ts` exports the
 * one the repo has decided to own.
 *
 * The cheapest rule of the set and the most generalisable: ban a LOCAL
 * declaration of a name the repo owns centrally. The designated file is
 * exempted by path in `.oxlintrc.json`, which is the same shape as the
 * single-import-site exemptions already there for zod, the schema stack and the
 * engine root.
 *
 * SECOND ARM: THE COPY THAT NEVER GETS A NAME. Banning the declaration only
 * catches a copy someone bothered to name. Three copies that did not — the
 * predicate written straight into the `if` — were collapsed by hand in
 * 90855e63 (`custom-host-rules.ts`, `preset-hover.ts`, `verdict-sentence.ts`,
 * both polarities), and the same sweep's own commit missed a fourth in
 * `features/simulator/pin-probe.ts`. A declaration-only rule is blind to every
 * one of them, which is exactly how they accumulated UNDER this rule.
 *
 * WHY THE SHAPE IS THIS NARROW. `typeof x === "object"` on its own is not this
 * helper and must never be rewritten to it: eight two-clause sites in the app
 * deliberately ACCEPT arrays (a parsed payload, a diff node). So the match
 * requires a CONTIGUOUS RUN of three operands — object-ness, null-ness and
 * array-ness — and requires all three to name the same subject byte-for-byte,
 * which is what excludes `row-notes.ts`'s four-clause comparison of two values.
 * Both requirements are structural; neither is an allowlist.
 *
 * The run is a SUB-run rather than the whole chain because one of the four real
 * copies was buried mid-chain. `verdict-sentence.ts:52` was five operands —
 * `m.key === updateType && <the triple> && (m.after as …).automerge === true` —
 * so a whole-node match sees only the leftmost three, rejects on `m.key === …`,
 * and walks past the copy it was written to catch.
 *
 * KNOWN FALSE NEGATIVE, kept deliberately: a triple SPLIT by an unrelated
 * operand (`typeof v === "object" && v !== undefined && v !== null &&
 * !Array.isArray(v)`). Matching any three operands regardless of position would
 * start collapsing chains whose interleaved clauses change what the predicate
 * asserts, so adjacency is the line.
 *
 * Nothing double-reports: a same-operator chain is handled once, at its
 * outermost node. `a || b || c` parses as `((a || b) || c)`, so the inner node
 * — whose parent is a `||` — returns immediately, and the outer one flattens
 * the whole chain and scans every run in it.
 */

/** Helpers this repo owns in exactly one place, each mapped to the specifier
 *  that exports it. The module is DATA rather than message prose so a helper
 *  cannot be added without saying where it lives — a diagnostic that names the
 *  offence without naming the import is a rule the reader still has to go
 *  research, and the five sibling rules all name theirs.
 *
 *  Add sparingly: a name belongs here once a second copy has actually
 *  appeared, not in anticipation. */
const PLAIN_OBJECT = { name: "isPlainObject", from: "@/lib/input-schemas" } as const;
const OWNED_HELPERS = new Map<string, string>([[PLAIN_OBJECT.name, PLAIN_OBJECT.from]]);

/** The two spellings of the same predicate. `||` is the early-return form
 *  (`typeof x !== "object" || x === null || Array.isArray(x)`), `&&` the
 *  positive one, whose array clause is wrapped in a `!`. */
const POLARITIES = {
  "||": { typeofOperator: "!==", nullOperator: "===", arrayCheckNegated: false },
  "&&": { typeofOperator: "===", nullOperator: "!==", arrayCheckNegated: true },
} as const;

/** What one operand asserts about its subject. All three, one subject, is the
 *  helper. */
type Clause = { kind: "typeof" | "null" | "array"; subject: ESTree.Expression };

/** Object-ness, null-ness, array-ness: the run length the match scans for. */
const TRIPLE = 3;

/** `a || b || c` → `[a, b, c]`, expanding only nodes with the SAME operator so
 *  a nested `(p && q)` inside a `||` chain stays one opaque operand. */
function operandsOf(node: ESTree.LogicalExpression): ESTree.Expression[] {
  const flat: ESTree.Expression[] = [];
  for (const side of [node.left, node.right]) {
    if (side.type === "LogicalExpression" && side.operator === node.operator) {
      flat.push(...operandsOf(side));
    } else {
      flat.push(side);
    }
  }
  return flat;
}

/** The sole argument of `Array.isArray(x)`, or undefined for anything else. */
function arrayIsArrayArgument(node: ESTree.Expression): ESTree.Expression | undefined {
  if (node.type !== "CallExpression" || node.arguments.length !== 1) {
    return undefined;
  }
  const callee = node.callee;
  if (callee.type !== "MemberExpression" || callee.computed) {
    return undefined;
  }
  if (callee.object.type !== "Identifier" || callee.object.name !== "Array") {
    return undefined;
  }
  if (callee.property.type !== "Identifier" || callee.property.name !== "isArray") {
    return undefined;
  }
  const [argument] = node.arguments;
  return argument === undefined || argument.type === "SpreadElement" ? undefined : argument;
}

/** `null`, and not a regex literal the parser failed to compile (whose `value`
 *  is also `null`). */
function isNullLiteral(node: ESTree.Expression): boolean {
  return node.type === "Literal" && node.value === null && !("regex" in node);
}

function classify(
  operand: ESTree.Expression,
  polarity: (typeof POLARITIES)[keyof typeof POLARITIES],
): Clause | undefined {
  if (polarity.arrayCheckNegated) {
    if (operand.type === "UnaryExpression" && operand.operator === "!") {
      const subject = arrayIsArrayArgument(operand.argument);
      return subject === undefined ? undefined : { kind: "array", subject };
    }
  } else {
    const subject = arrayIsArrayArgument(operand);
    if (subject !== undefined) {
      return { kind: "array", subject };
    }
  }
  // `#x in obj` is also a `BinaryExpression`; its left is not an expression.
  if (operand.type !== "BinaryExpression" || operand.left.type === "PrivateIdentifier") {
    return undefined;
  }
  const { left, right } = operand;
  if (
    operand.operator === polarity.typeofOperator &&
    left.type === "UnaryExpression" &&
    left.operator === "typeof" &&
    right.type === "Literal" &&
    right.value === "object"
  ) {
    return { kind: "typeof", subject: left.argument };
  }
  if (operand.operator === polarity.nullOperator && isNullLiteral(right)) {
    return { kind: "null", subject: left };
  }
  return undefined;
}

/** Whether one contiguous run of operands IS the helper. */
function isPlainObjectTriple(
  run: ESTree.Expression[],
  polarity: (typeof POLARITIES)[keyof typeof POLARITIES],
  textOf: (node: ESTree.Expression) => string,
): boolean {
  const clauses: Clause[] = [];
  for (const operand of run) {
    const clause = classify(operand, polarity);
    if (clause === undefined) {
      return false;
    }
    clauses.push(clause);
  }
  const kinds = new Set(clauses.map((clause) => clause.kind));
  const subjects = new Set(clauses.map((clause) => textOf(clause.subject)));
  return kinds.size === TRIPLE && subjects.size === 1;
}

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      ownedElsewhere:
        "Import `{{name}}` from `{{from}}` instead of declaring a local copy — byte-identical private copies of this helper are exactly what the shared one replaced.",
      inlinePlainObjectCheck:
        "Use `{{name}}` from `{{from}}` instead of spelling the object/not-null/not-array triple inline — an unnamed copy is still a copy, and three of these were collapsed by hand once already.",
    },
  },
  createOnce(context) {
    return {
      FunctionDeclaration(node) {
        const name = node.id?.name;
        const from = name === undefined ? undefined : OWNED_HELPERS.get(name);
        if (name !== undefined && from !== undefined) {
          context.report({ node, messageId: "ownedElsewhere", data: { name, from } });
        }
      },
      LogicalExpression(node) {
        const polarity =
          node.operator === "||" || node.operator === "&&" ? POLARITIES[node.operator] : undefined;
        if (polarity === undefined) {
          return;
        }
        // The outermost node of a same-operator chain flattens the whole chain,
        // so an inner one has nothing of its own to say.
        const { parent } = node;
        if (parent.type === "LogicalExpression" && parent.operator === node.operator) {
          return;
        }
        const operands = operandsOf(node);
        const textOf = (subject: ESTree.Expression): string => context.sourceCode.getText(subject);
        for (let start = 0; start + TRIPLE <= operands.length; start++) {
          if (isPlainObjectTriple(operands.slice(start, start + TRIPLE), polarity, textOf)) {
            context.report({
              node,
              messageId: "inlinePlainObjectCheck",
              data: { name: PLAIN_OBJECT.name, from: PLAIN_OBJECT.from },
            });
            return;
          }
        }
      },
    };
  },
});
