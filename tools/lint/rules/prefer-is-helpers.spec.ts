import { ruleTester } from "../rule-tester.ts";
import rule from "./prefer-is-helpers.ts";

ruleTester.run("prefer-is-helpers", rule, {
  valid: [
    // importing the owned ones is the point
    `import { isPlainObject, isString } from "@renovate-config-debugger/engine/is";`,
    // a differently-named local predicate is nobody's business
    "function isPlainRecord(v: unknown) { return true; }",
    "function isObject(v: unknown) { return true; }",
    // calling them is fine, obviously
    "if (isPlainObject(raw)) { read(raw); }",
    "const items = raw.filter(isTruthy);",
    // an arrow assigned to a const is not a declaration the rule claims — a
    // narrow rule that says exactly what it checks beats a broad one that
    // surprises people
    "const isPlainObject = (v: unknown) => true;",

    // ---- the four literals the map deliberately omits -----------------------
    // a helper call on an undeclared binding throws `ReferenceError`, so the
    // three real `"undefined"` sites are global probes `typeof` alone can do
    'if (typeof BroadcastChannel === "undefined") { return fallback(); }',
    'if (typeof v === "undefined") { return; }',
    // one real discriminator, three capability probes: not a helper
    'if (typeof v === "function") { v(); }',
    // zero sites each
    'if (typeof v === "symbol") { skip(); }',
    'if (typeof v === "bigint") { skip(); }',
    // `"object"` belongs to the triple arm, never to a one-clause rewrite
    'if (typeof v === "object") { walk(v); }',
    // `typeof` in TYPE position is a `TSTypeQuery`, never a `UnaryExpression`,
    // so it can never match — asserted so a parser change breaks this on purpose
    "let found: typeof NOT_FOUND;",
    "function f(): Promise<string | typeof NOT_FOUND> { return g(); }",
    // a comparison against a non-literal, and one against an unmapped literal
    "if (typeof v === kind) { skip(); }",
    'if (typeof v === "String") { skip(); }',

    // ---- the triple arm's escapes ------------------------------------------
    // TWO clauses is a different predicate: it ACCEPTS arrays. Twenty-five
    // sites want exactly that (a parsed payload, a diff node), and rewriting
    // any of them to `isPlainObject` would be a behaviour change.
    'if (typeof raw !== "object" || raw === null) { return undefined; }',
    'if (v !== null && typeof v === "object") { walk(v); }',
    // the array clause alone, without the null clause, is still only two
    'if (typeof raw !== "object" || Array.isArray(raw)) { return undefined; }',
    // description-attribution.ts:194's shape, where the two extra clauses lead
    'if (!attribution || attribution.cards.length === 0 || typeof doc !== "object" || doc === null) { fail(); }',
    // three clauses, TWO subjects — row-notes.ts compares two values and must
    // not be collapsed into one call
    'if (typeof a === "object" && typeof b === "object" && a !== null) { compare(a, b); }',
    // same shape, subject differs only in a property path: text identity is the
    // test, so `node.resolved` and `node.raw` are two subjects
    'if (typeof node.resolved === "object" && node.raw !== null && !Array.isArray(node.resolved)) { use(node); }',
    // mixed polarity: the operator picks the spelling, and `&&` wants a negated
    // array check, not a bare one
    'if (typeof v === "object" && v !== null && Array.isArray(v)) { both(v); }',
    // `||` wants the bare array check, not a negated one
    'if (typeof v !== "object" || v === null || !Array.isArray(v)) { neither(v); }',
    // a duplicated clause is three operands but only two kinds
    'if (typeof v !== "object" || v === null || v === null) { return undefined; }',
    // `Array.isArray` is the check; `isArray` from somewhere else is not
    'if (typeof v !== "object" || v === null || isArray(v)) { return undefined; }',
    'if (typeof v !== "object" || v === null || Array.isArray(v, extra)) { return undefined; }',
    // `??` is neither polarity
    "const x = a ?? b ?? c;",

    // ---- the non-empty-string arm's escapes --------------------------------
    // an emptiness check with no string check is not the composite
    'if (v !== "") { use(v); }',
    "if (v.length > 0) { use(v); }",

    // ---- the nullish arm's escapes -----------------------------------------
    // two subjects
    "if (a === null || b === undefined) { skip(); }",
    // one nullish kind twice
    "if (v === null || v === null) { skip(); }",
    // the operator picks the operators: `&&` reads inequalities only
    "if (v === null && v === undefined) { skip(); }",
    "if (v !== null || v !== undefined) { skip(); }",
    // a comparison against something that is neither
    "if (v === null || v === NOT_SET) { skip(); }",

    // ---- `.filter(Boolean)` lookalikes -------------------------------------
    "const items = filter(Boolean);",
    "const items = raw.filter(Boolean, thisArg);",
    "const items = raw[filter](Boolean);",
    "const items = raw.map(Boolean);",
    "const items = raw.filter((v) => Boolean(v.id));",
  ],
  invalid: [
    // ---- the declaration arm ------------------------------------------------
    // The rendered message is asserted, not just the id: the whole point of the
    // owned-helper set is that the diagnostic NAMES the import, and a
    // `messageId`-only expectation passes just as happily when `{{from}}`
    // interpolates to nothing.
    {
      code: "function isPlainObject(value: unknown): value is Record<string, unknown> { return true; }",
      errors: [
        {
          message:
            "Import `isPlainObject` from `@renovate-config-debugger/engine/is` instead of declaring a local copy — byte-identical private copies of this helper are exactly what the shared one replaced.",
        },
      ],
    },
    // exported copies are no better — this is about ownership, not visibility
    {
      code: "export function isStringArray(v: unknown) { return true; }",
      errors: [{ messageId: "ownedElsewhere" }],
    },
    // the set is eight names wide, not one
    {
      code: "function isTruthy(v: unknown) { return true; }",
      errors: [{ messageId: "ownedElsewhere" }],
    },
    {
      code: "function isNonEmptyString(v: unknown) { return true; }",
      errors: [{ messageId: "ownedElsewhere" }],
    },
    // `isRecord` is a plain-object copy under a name the set does not hold, so
    // the declaration arm is blind to it — and the triple arm catches its BODY.
    // That is why no alias is added to the set.
    {
      code: 'function isRecord(v: unknown) { return typeof v === "object" && v !== null && !Array.isArray(v); }',
      errors: [{ messageId: "preferIsPlainObject" }],
    },

    // ---- the typeof arm -----------------------------------------------------
    {
      code: 'if (typeof value === "string") { use(value); }',
      errors: [
        {
          message:
            "Use `isString()` from `@renovate-config-debugger/engine/is` instead of comparing `typeof` against 'string' — the repo owns these predicates in one place (inside `packages/engine`, import it as `./is`).",
        },
      ],
    },
    {
      code: 'if (typeof value !== "number") { return; }',
      errors: [{ messageId: "preferIsHelperForTypeof" }],
    },
    // either operand order
    {
      code: 'const ok = "boolean" === typeof flag;',
      errors: [{ messageId: "preferIsHelperForTypeof" }],
    },
    // `==` and `!=` count too — `typeof` always yields a string, so the loose
    // form is the same question spelled worse
    {
      code: 'if (typeof value == "string") { use(value); }',
      errors: [{ messageId: "preferIsHelperForTypeof" }],
    },
    // the string-array shape gets no arm of its own: the inner comparison fires,
    // which puts the author in `is.ts`, where `isStringArray` sits next to
    // `isString`. Exactly ONE error is the assertion.
    {
      code: 'const all = Array.isArray(v) && v.every((item) => typeof item === "string");',
      errors: [{ messageId: "preferIsHelperForTypeof" }],
    },
    // a `.trim()` composite is not `isNonEmptyString` — both real sites need the
    // trimmed value in the same expression — but the `typeof` half is still
    // `isString`, so one error and not two
    {
      code: 'if (typeof v === "string" && v.trim() !== "") { use(v.trim()); }',
      errors: [{ messageId: "preferIsHelperForTypeof" }],
    },
    // share.ts:302's four-operand shape: the triple arm stays silent (its inner
    // three are not the triple) and only the trailing `typeof` reports
    {
      code: 'if (typeof parsed !== "object" || parsed === null || (v !== 1 && v !== 2) || typeof parsed.config !== "string") { fail(); }',
      errors: [{ messageId: "preferIsHelperForTypeof" }],
    },

    // ---- the triple arm -----------------------------------------------------
    // pin-probe.ts:68, the copy that survived the hand sweep that fixed the
    // other three. Message asserted for the same reason as above.
    {
      code: 'if (typeof body !== "object" || body === null || Array.isArray(body)) { return undefined; }',
      errors: [
        {
          message:
            "Use `isPlainObject` from `@renovate-config-debugger/engine/is` instead of spelling the object/not-null/not-array triple inline — an unnamed copy is still a copy, and three of these were collapsed by hand once already.",
        },
      ],
    },
    // custom-host-rules.ts:40's spelling, which also carried a cast on the next
    // line that the helper's type predicate removes
    {
      code: 'if (typeof raw !== "object" || raw === null || Array.isArray(raw)) { return []; }',
      errors: [{ messageId: "preferIsPlainObject" }],
    },
    // the positive polarity — preset-hover.ts:50's shape
    {
      code: 'const resolved = typeof node === "object" && node !== null && !Array.isArray(node) ? node : undefined;',
      errors: [{ messageId: "preferIsPlainObject" }],
    },
    // …and verdict-sentence.ts:52's, verbatim (90855e63^): the triple buried in
    // the MIDDLE of a five-operand chain, inside a predicate callback. This is
    // the case a whole-node match walked past — its leftmost three operands
    // start at `m.key === updateType`, which classify() rejects.
    {
      code: 'const hit = ms.find((m) => m.key === updateType && typeof m.after === "object" && m.after !== null && !Array.isArray(m.after) && (m.after as Record<string, unknown>).automerge === true);',
      errors: [{ messageId: "preferIsPlainObject" }],
    },
    // the triple in the TRAILING position of a longer chain, reported once on
    // the outermost node rather than twice
    {
      code: 'if (fresh || typeof v !== "object" || v === null || Array.isArray(v)) { return undefined; }',
      errors: [{ messageId: "preferIsPlainObject" }],
    },
    // clause ORDER is not part of the shape: set membership, not position
    {
      code: 'if (Array.isArray(v) || v === null || typeof v !== "object") { return undefined; }',
      errors: [{ messageId: "preferIsPlainObject" }],
    },
    {
      code: 'if (v !== null && !Array.isArray(v) && typeof v === "object") { use(v); }',
      errors: [{ messageId: "preferIsPlainObject" }],
    },
    // the subject may be any expression, as long as all three spell it the same
    {
      code: 'if (typeof node.resolved !== "object" || node.resolved === null || Array.isArray(node.resolved)) { return undefined; }',
      errors: [{ messageId: "preferIsPlainObject" }],
    },
    // ONE report for a three-operand chain: the inner `(a || b)` node has a
    // same-operator parent and returns before it looks at anything.
    {
      code: 'const plain = typeof v !== "object" || v === null || Array.isArray(v);',
      errors: [{ messageId: "preferIsPlainObject" }],
    },
    // a fourth operand does not add a second report
    {
      code: 'if (typeof v !== "object" || v === null || Array.isArray(v) || v.bad) { return undefined; }',
      errors: [{ messageId: "preferIsPlainObject" }],
    },
    // the old rule's documented false negative — a triple SPLIT by an unrelated
    // operand — is STILL not the triple. It now reports for a different reason:
    // the interloper and the null clause are themselves the nullish pair.
    {
      code: 'if (typeof v === "object" && v !== undefined && v !== null && !Array.isArray(v)) { use(v); }',
      errors: [{ messageId: "preferNotIsNullOrUndefined" }],
    },

    // ---- the non-empty-string arm -------------------------------------------
    // the composite reports ONCE: the `typeof` arm stands down for the half it
    // already claims, so the obvious half-fix (`isString(x) && x !== ""`) cannot
    // silence the rule while leaving `isNonEmptyString` unused
    {
      code: 'if (typeof v === "string" && v !== "") { use(v); }',
      errors: [
        {
          message:
            'Use `isNonEmptyString()` from `@renovate-config-debugger/engine/is` instead of pairing a `typeof … === "string"` with an emptiness check — twelve sites spelled this by hand.',
        },
      ],
    },
    {
      code: 'if (typeof name === "string" && name.length > 0) { use(name); }',
      errors: [{ messageId: "preferIsNonEmptyString" }],
    },
    // the early-return polarity, both spellings
    {
      code: 'if (typeof v !== "string" || v === "") { return; }',
      errors: [{ messageId: "preferIsNonEmptyString" }],
    },
    {
      code: 'if (typeof v !== "string" || v.length === 0) { return; }',
      errors: [{ messageId: "preferIsNonEmptyString" }],
    },
    // buried mid-chain, like the triple: a sub-run, not the whole node
    {
      code: 'if (ready && typeof v === "string" && v !== "" && v !== "none") { use(v); }',
      errors: [{ messageId: "preferIsNonEmptyString" }],
    },
    // clause order is not part of the shape here either
    {
      code: 'if (v !== "" && typeof v === "string") { use(v); }',
      errors: [{ messageId: "preferIsNonEmptyString" }],
    },
    // …and the near-misses, each of which falls back to the `typeof` arm alone.
    // ONE error is the assertion: the composite arm claimed nothing.
    // two subjects
    {
      code: 'if (typeof a === "string" && b !== "") { use(a, b); }',
      errors: [{ messageId: "preferIsHelperForTypeof" }],
    },
    // wrong polarity for the operator: `&&` wants `!== ""`, not `=== ""`
    {
      code: 'if (typeof v === "string" && v === "") { empty(v); }',
      errors: [{ messageId: "preferIsHelperForTypeof" }],
    },
    // a `length` read on something else, and a computed one
    {
      code: 'if (typeof v === "string" && v.size > 0) { use(v); }',
      errors: [{ messageId: "preferIsHelperForTypeof" }],
    },
    {
      code: 'if (typeof v === "string" && v[key] > 0) { use(v); }',
      errors: [{ messageId: "preferIsHelperForTypeof" }],
    },

    // ---- the nullish arm ----------------------------------------------------
    {
      code: "if (doc.default === null || doc.default === undefined) { return; }",
      errors: [
        {
          message:
            "Use `isNullOrUndefined()` from `@renovate-config-debugger/engine/is` instead of comparing against both `null` and `undefined`.",
        },
      ],
    },
    {
      code: "if (copy !== null && copy !== undefined) { use(copy); }",
      errors: [{ messageId: "preferNotIsNullOrUndefined" }],
    },
    // either operand order, and a sub-run of a longer chain
    {
      code: "if (null === part || undefined === part) { skip(); }",
      errors: [{ messageId: "preferIsNullOrUndefined" }],
    },
    {
      code: "if (stale || part === null || part === undefined) { skip(); }",
      errors: [{ messageId: "preferIsNullOrUndefined" }],
    },

    // ---- `.filter(Boolean)` -------------------------------------------------
    {
      code: "const items = raw.filter(Boolean);",
      errors: [
        {
          message:
            "Use `.filter(isTruthy)` with `isTruthy` from `@renovate-config-debugger/engine/is` instead of `.filter(Boolean)` — `Boolean` gives no narrowing, so the result stays `(T | undefined)[]`.",
        },
      ],
    },
    {
      code: "const items = [a, b, c].filter(Boolean);",
      errors: [{ messageId: "preferIsTruthy" }],
    },
  ],
});
