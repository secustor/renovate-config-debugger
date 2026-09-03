import { defineRule, type ESTree } from "@oxlint/plugins";

/**
 * The type checks this repo owns in one place, and the six shapes that spelled
 * them by hand instead.
 *
 * SUPERSEDES `no-local-is-plain-object`. That rule banned a local
 * `isPlainObject` and named `@/lib/input-schemas` — an app-only specifier,
 * which is why it could never be enabled on the engine or the CLI even though
 * both held a copy. PR 316's review asked for the opposite move: not a wider
 * ban, a shared library. `packages/engine/src/is.ts` is now that library, every
 * package here can import it, and this rule is what keeps the tree pointed at
 * it. Both of the old rule's arms live on below, verbatim.
 *
 * WHAT WAS ACTUALLY IN THE TREE. Three named copies of `isPlainObject`
 * (`engine/src/lib.ts`, `app/src/lib/input-schemas.ts`, and `isRecord` in
 * `cli/src/mcp/result.ts`), two of `isStringArray`, 134 inline
 * `typeof x === "<literal>"` comparisons, twelve `typeof x === "string" && x !== ""`
 * composites, three `x === null || x === undefined` pairs and four
 * `.filter(Boolean)` calls whose result TypeScript cannot narrow.
 *
 * WHY THE MAP IS THREE ENTRIES. Only a literal whose helper has EXACTLY the
 * semantics of the `typeof` comparison belongs in `TYPEOF_HELPERS`; the four
 * omissions are documented there with their counts. The plain-object triple,
 * the non-empty-string composite and the nullish pair each need a shape arm
 * instead, because none of them is one comparison.
 *
 * HOW THE SHAPE ARMS IDENTIFY A SUBJECT: by SOURCE TEXT
 * (`sourceCode.getText`), which the old rule already did for the triple and
 * this one extends to the composite and the nullish pair. Renovate's rule
 * excludes calls instead ("anything with possible side effects"), and the
 * divergence is deliberate but has one hazard worth stating: a CALL is the same
 * subject twice, so `typeof getValue() === "string" && getValue() !== ""`
 * reports, and the obvious fix collapses two evaluations into one. There is no
 * autofix and nothing in the tree hits it — for a side-effecting or
 * non-deterministic subject, keep the two calls and disable the line.
 *
 * WHAT IT DELIBERATELY DOES NOT CATCH. A string-array shape
 * (`Array.isArray(x) && x.every((v) => typeof v === "string")`) gets no arm of
 * its own: the `typeof` arm already fires on the inner comparison, which puts
 * the author in `is.ts` where `isStringArray` sits next to `isString`. A fifth
 * shape arm would buy one more diagnostic and a second parent-lookup carve-out.
 * `cli/src/mcp/result.ts`'s `isRecord` is likewise invisible to the
 * declaration arm — it is a plain-object copy under a name the set does not
 * hold — and the triple arm catches its BODY, which is why no alias is added.
 */

/** The one specifier, repo-wide. Inside `packages/engine` the same module is
 *  `./is` / `../is`; the message says so rather than naming two paths. */
const IS_MODULE = "@renovate-config-debugger/engine/is";

/** `typeof` result literals that map onto a helper with EXACTLY the semantics
 *  of the `typeof` comparison. Deliberately absent, each for a measured reason:
 *
 *  - 'object'    — 29 occurrences, and 25 of them are two-clause checks that
 *                  deliberately ACCEPT arrays. `isPlainObject` is a different
 *                  predicate; the triple arm below is what claims the rest.
 *  - 'undefined' — 3 occurrences, ALL THREE bare-identifier global probes
 *                  (`typeof BroadcastChannel === "undefined"`). A helper call
 *                  on an undeclared binding throws `ReferenceError`; `typeof`
 *                  is the only safe spelling. That hazard belongs to the
 *                  SUBJECT, not the literal, so it applies to the three mapped
 *                  literals too: `typeof __BUILD_INFO__ === "string"` on a
 *                  build-time `define` reached through a `declare const` must
 *                  stay `typeof` behind an inline disable, not become
 *                  `isString(__BUILD_INFO__)`.
 *  - 'function'  — 5 occurrences: 1 in an excluded shim, 3 capability probes on
 *                  globals, 1 real discriminator. One site is not a helper.
 *  - 'symbol', 'bigint' — 0 occurrences.
 *
 *  'number' IS here, unlike renovate's rule, because THIS repo's `isNumber` is
 *  exactly `typeof value === "number"` (NaN included) rather than
 *  `@sindresorhus/is`'s NaN-excluding one. See `engine/src/is.ts`. */
const TYPEOF_HELPERS: Record<string, string> = {
  string: "isString",
  number: "isNumber",
  boolean: "isBoolean",
};

/** Helpers the repo owns in exactly one place. Banning the NAME catches a copy
 *  someone bothered to name; the shape arms catch the ones nobody did. Add
 *  sparingly: a name belongs here once a second copy has appeared. */
const OWNED_HELPERS = new Set([
  "isString",
  "isNonEmptyString",
  "isNumber",
  "isBoolean",
  "isPlainObject",
  "isStringArray",
  "isNullOrUndefined",
  "isTruthy",
]);

/** Operators asserting equality with `null` / `undefined` (`x === null || x === undefined`). */
const EQUALITY_OPERATORS = new Set(["===", "=="]);

/** Operators asserting inequality with both (`x !== null && x !== undefined`). */
const INEQUALITY_OPERATORS = new Set(["!==", "!="]);

/** The two spellings of the plain-object predicate. `||` is the early-return
 *  form (`typeof x !== "object" || x === null || Array.isArray(x)`), `&&` the
 *  positive one, whose array clause is wrapped in a `!`. */
const POLARITIES = {
  "||": { typeofOperator: "!==", nullOperator: "===", arrayCheckNegated: false },
  "&&": { typeofOperator: "===", nullOperator: "!==", arrayCheckNegated: true },
} as const;

/** The same two spellings for the non-empty-string composite: `&&` pairs
 *  `typeof x === "string"` with `x !== ""` or `x.length > 0`, `||` pairs
 *  `typeof x !== "string"` with `x === ""` or `x.length === 0`. */
const STRING_POLARITIES = {
  "||": { typeofOperator: "!==", emptyOperator: "===", lengthOperator: "===" },
  "&&": { typeofOperator: "===", emptyOperator: "!==", lengthOperator: ">" },
} as const;

type Polarity = (typeof POLARITIES)[keyof typeof POLARITIES];
type StringPolarity = (typeof STRING_POLARITIES)[keyof typeof STRING_POLARITIES];

/** What one operand asserts about its subject. All three, one subject, is
 *  `isPlainObject`. */
type Clause = { kind: "typeof" | "null" | "array"; subject: ESTree.Expression };

/** …and for the composite: a string check plus an emptiness check is
 *  `isNonEmptyString`. */
type StringClause = { kind: "typeof" | "empty"; subject: ESTree.Expression };

/** Which nullish value one comparison names. Both, one subject, is
 *  `isNullOrUndefined`. */
type NullishComparison = { nullish: "null" | "undefined"; subject: ESTree.Expression };

/** Object-ness, null-ness, array-ness: the run length the triple arm scans for. */
const TRIPLE = 3;

/** …and the run length the two two-clause arms scan for. */
const PAIR = 2;

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

function classify(operand: ESTree.Expression, polarity: Polarity): Clause | undefined {
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

/** The object a `.length` read is taken from, for a non-computed `x.length`. */
function lengthSubject(node: ESTree.Expression): ESTree.Expression | undefined {
  if (
    node.type !== "MemberExpression" ||
    node.computed ||
    node.property.type !== "Identifier" ||
    node.property.name !== "length" ||
    node.object.type === "Super"
  ) {
    return undefined;
  }
  return node.object;
}

function classifyString(
  operand: ESTree.Expression,
  polarity: StringPolarity,
): StringClause | undefined {
  if (operand.type !== "BinaryExpression" || operand.left.type === "PrivateIdentifier") {
    return undefined;
  }
  const { left, right } = operand;
  if (
    operand.operator === polarity.typeofOperator &&
    left.type === "UnaryExpression" &&
    left.operator === "typeof" &&
    right.type === "Literal" &&
    right.value === "string"
  ) {
    return { kind: "typeof", subject: left.argument };
  }
  if (
    operand.operator === polarity.emptyOperator &&
    right.type === "Literal" &&
    right.value === ""
  ) {
    return { kind: "empty", subject: left };
  }
  if (
    operand.operator === polarity.lengthOperator &&
    right.type === "Literal" &&
    right.value === 0
  ) {
    const subject = lengthSubject(left);
    return subject === undefined ? undefined : { kind: "empty", subject };
  }
  return undefined;
}

/** Which nullish value `operand` compares its subject against, under the
 *  operators the enclosing chain's polarity allows. */
function classifyNullish(
  operand: ESTree.Expression,
  operators: Set<string>,
): NullishComparison | undefined {
  if (
    operand.type !== "BinaryExpression" ||
    !operators.has(operand.operator) ||
    operand.left.type === "PrivateIdentifier"
  ) {
    return undefined;
  }
  const { left, right } = operand;
  if (isNullLiteral(right)) {
    return { nullish: "null", subject: left };
  }
  if (right.type === "Identifier" && right.name === "undefined") {
    return { nullish: "undefined", subject: left };
  }
  if (isNullLiteral(left)) {
    return { nullish: "null", subject: right };
  }
  if (left.type === "Identifier" && left.name === "undefined") {
    return { nullish: "undefined", subject: right };
  }
  return undefined;
}

type TextOf = (node: ESTree.Expression) => string;

/** Whether one contiguous run of operands IS the plain-object triple: three
 *  distinct clause kinds naming one subject byte-for-byte. */
function isPlainObjectTriple(
  run: ESTree.Expression[],
  polarity: Polarity,
  textOf: TextOf,
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

/** …and whether one IS the non-empty-string composite. */
function isNonEmptyStringPair(
  run: ESTree.Expression[],
  polarity: StringPolarity,
  textOf: TextOf,
): boolean {
  const clauses: StringClause[] = [];
  for (const operand of run) {
    const clause = classifyString(operand, polarity);
    if (clause === undefined) {
      return false;
    }
    clauses.push(clause);
  }
  const kinds = new Set(clauses.map((clause) => clause.kind));
  const subjects = new Set(clauses.map((clause) => textOf(clause.subject)));
  return kinds.size === PAIR && subjects.size === 1;
}

/** …and whether one names both `null` and `undefined` for one subject. */
function isNullishPair(run: ESTree.Expression[], operators: Set<string>, textOf: TextOf): boolean {
  const comparisons: NullishComparison[] = [];
  for (const operand of run) {
    const comparison = classifyNullish(operand, operators);
    if (comparison === undefined) {
      return false;
    }
    comparisons.push(comparison);
  }
  const nullishes = new Set(comparisons.map((comparison) => comparison.nullish));
  const subjects = new Set(comparisons.map((comparison) => textOf(comparison.subject)));
  return nullishes.size === PAIR && subjects.size === 1;
}

/** The outermost node of the same-operator `&&` / `||` chain `node` is an
 *  operand of, or undefined when it is not an operand of one. */
function chainRootOf(node: ESTree.Node): ESTree.LogicalExpression | undefined {
  let current: ESTree.Node = node;
  let root: ESTree.LogicalExpression | undefined;
  while (
    current.parent?.type === "LogicalExpression" &&
    (root === undefined || current.parent.operator === root.operator)
  ) {
    root = current.parent;
    current = current.parent;
  }
  return root;
}

/** Whether `node` is the `typeof` half of a composite the `LogicalExpression`
 *  arm already reports. Without this the twelve non-empty-string sites report
 *  twice — and worse, the obvious fix (`isString(x) && x !== ""`) would silence
 *  the rule while leaving `isNonEmptyString` unused. */
function claimedByComposite(node: ESTree.BinaryExpression, textOf: TextOf): boolean {
  const root = chainRootOf(node);
  if (root === undefined || (root.operator !== "||" && root.operator !== "&&")) {
    return false;
  }
  const polarity = STRING_POLARITIES[root.operator];
  const operands = operandsOf(root);
  for (let start = 0; start + PAIR <= operands.length; start++) {
    const run = operands.slice(start, start + PAIR);
    if (run.includes(node) && isNonEmptyStringPair(run, polarity, textOf)) {
      return true;
    }
  }
  return false;
}

/** `typeof <expr> ==/===/!=/!== "<literal>"` (either operand order) for a
 *  literal with a helper in `TYPEOF_HELPERS`. */
function typeofHelperOf(
  node: ESTree.BinaryExpression | ESTree.PrivateInExpression,
): { helper: string; literal: string } | undefined {
  if (!EQUALITY_OPERATORS.has(node.operator) && !INEQUALITY_OPERATORS.has(node.operator)) {
    return undefined;
  }
  if (node.left.type === "PrivateIdentifier") {
    return undefined;
  }
  for (const [a, b] of [
    [node.left, node.right],
    [node.right, node.left],
  ]) {
    if (
      a?.type === "UnaryExpression" &&
      a.operator === "typeof" &&
      b?.type === "Literal" &&
      typeof b.value === "string"
    ) {
      const helper = TYPEOF_HELPERS[b.value];
      if (helper !== undefined) {
        return { helper, literal: b.value };
      }
    }
  }
  return undefined;
}

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      preferIsHelperForTypeof:
        "Use `{{helper}}()` from `{{from}}` instead of comparing `typeof` against '{{literal}}' — the repo owns these predicates in one place (inside `packages/engine`, import it as `./is`).",
      preferIsNonEmptyString:
        'Use `isNonEmptyString()` from `{{from}}` instead of pairing a `typeof … === "string"` with an emptiness check — twelve sites spelled this by hand.',
      preferIsPlainObject:
        "Use `isPlainObject` from `{{from}}` instead of spelling the object/not-null/not-array triple inline — an unnamed copy is still a copy, and three of these were collapsed by hand once already.",
      preferIsNullOrUndefined:
        "Use `isNullOrUndefined()` from `{{from}}` instead of comparing against both `null` and `undefined`.",
      preferNotIsNullOrUndefined:
        "Use `!isNullOrUndefined()` from `{{from}}` instead of comparing against both `null` and `undefined`.",
      preferIsTruthy:
        "Use `.filter(isTruthy)` with `isTruthy` from `{{from}}` instead of `.filter(Boolean)` — `Boolean` gives no narrowing, so the result stays `(T | undefined)[]`.",
      ownedElsewhere:
        "Import `{{name}}` from `{{from}}` instead of declaring a local copy — byte-identical private copies of this helper are exactly what the shared one replaced.",
    },
  },
  createOnce(context) {
    const textOf: TextOf = (node) => context.sourceCode.getText(node);
    return {
      CallExpression(node) {
        // `.filter(Boolean)`
        if (
          node.callee.type === "MemberExpression" &&
          !node.callee.computed &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "filter" &&
          node.arguments.length === 1 &&
          node.arguments[0]?.type === "Identifier" &&
          node.arguments[0].name === "Boolean"
        ) {
          context.report({ node, messageId: "preferIsTruthy", data: { from: IS_MODULE } });
        }
      },
      FunctionDeclaration(node) {
        const name = node.id?.name;
        if (name !== undefined && OWNED_HELPERS.has(name)) {
          context.report({
            node,
            messageId: "ownedElsewhere",
            data: { name, from: IS_MODULE },
          });
        }
      },
      BinaryExpression(node) {
        const match = typeofHelperOf(node);
        if (match === undefined || claimedByComposite(node, textOf)) {
          return;
        }
        context.report({
          node,
          messageId: "preferIsHelperForTypeof",
          data: { helper: match.helper, literal: match.literal, from: IS_MODULE },
        });
      },
      LogicalExpression(node) {
        if (node.operator !== "||" && node.operator !== "&&") {
          return;
        }
        // The outermost node of a same-operator chain flattens the whole chain,
        // so an inner one has nothing of its own to say.
        const { parent } = node;
        if (parent.type === "LogicalExpression" && parent.operator === node.operator) {
          return;
        }
        const operands = operandsOf(node);
        const hasRun = (size: number, matches: (run: ESTree.Expression[]) => boolean): boolean => {
          for (let start = 0; start + size <= operands.length; start++) {
            if (matches(operands.slice(start, start + size))) {
              return true;
            }
          }
          return false;
        };
        const polarity = POLARITIES[node.operator];
        if (hasRun(TRIPLE, (run) => isPlainObjectTriple(run, polarity, textOf))) {
          context.report({ node, messageId: "preferIsPlainObject", data: { from: IS_MODULE } });
        }
        const stringPolarity = STRING_POLARITIES[node.operator];
        if (hasRun(PAIR, (run) => isNonEmptyStringPair(run, stringPolarity, textOf))) {
          context.report({ node, messageId: "preferIsNonEmptyString", data: { from: IS_MODULE } });
        }
        const operators = node.operator === "||" ? EQUALITY_OPERATORS : INEQUALITY_OPERATORS;
        if (hasRun(PAIR, (run) => isNullishPair(run, operators, textOf))) {
          context.report({
            node,
            messageId:
              node.operator === "||" ? "preferIsNullOrUndefined" : "preferNotIsNullOrUndefined",
            data: { from: IS_MODULE },
          });
        }
      },
    };
  },
});
