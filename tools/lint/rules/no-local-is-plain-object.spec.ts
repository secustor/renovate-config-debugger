import { ruleTester } from "../rule-tester.ts";
import rule from "./no-local-is-plain-object.ts";

ruleTester.run("no-local-is-plain-object", rule, {
  valid: [
    // importing the owned one is the point
    `import { isPlainObject } from "@/lib/input-schemas";`,
    // a differently-named local predicate is nobody's business
    "function isPlainRecord(v: unknown) { return typeof v === 'object'; }",
    "function isObject(v: unknown) { return typeof v === 'object'; }",
    // calling it is fine, obviously
    "if (isPlainObject(raw)) { read(raw); }",
    // an arrow assigned to a const is not a declaration the rule claims — a
    // narrow rule that says exactly what it checks beats a broad one that
    // surprises people
    "const isPlainObject = (v: unknown) => typeof v === 'object';",

    // ---- the inline arm's escapes -----------------------------------------
    // TWO clauses is a different predicate: it ACCEPTS arrays. Eight sites in
    // the app want exactly that (a parsed payload, a diff node), and rewriting
    // any of them to `isPlainObject` would be a behaviour change.
    'if (typeof raw !== "object" || raw === null) { return undefined; }',
    'if (v !== null && typeof v === "object") { walk(v); }',
    // the array clause alone, without the null clause, is still only two
    'if (typeof raw !== "object" || Array.isArray(raw)) { return undefined; }',
    // four operands whose inner three are not the triple (share.ts:302's shape)
    'if (typeof parsed !== "object" || parsed === null || (v !== 1 && v !== 2) || typeof parsed.config !== "string") { fail(); }',
    // …and description-attribution.ts:194's, where the two extra clauses lead
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
    // `typeof v === "function"` is a different question entirely
    'if (typeof v !== "function" || v === null || Array.isArray(v)) { return undefined; }',
    // `??` is neither polarity
    "const x = a ?? b ?? c;",
    // the documented false negative: the triple is all there, but SPLIT by an
    // unrelated operand, so no contiguous run of three is the helper
    'if (typeof v === "object" && v !== undefined && v !== null && !Array.isArray(v)) { use(v); }',
  ],
  invalid: [
    // The rendered message is asserted, not just the id: the whole point of the
    // owned-helper map is that the diagnostic NAMES the import, and a
    // `messageId`-only expectation passes just as happily when `{{from}}`
    // interpolates to nothing.
    {
      code: "function isPlainObject(value: unknown): value is Record<string, unknown> { return true; }",
      errors: [
        {
          message:
            "Import `isPlainObject` from `@/lib/input-schemas` instead of declaring a local copy — byte-identical private copies of this helper are exactly what the shared one replaced.",
        },
      ],
    },
    // exported copies are no better — this is about ownership, not visibility
    {
      code: "export function isPlainObject(v: unknown) { return typeof v === 'object'; }",
      errors: [{ messageId: "ownedElsewhere" }],
    },

    // ---- the inline arm ----------------------------------------------------
    // pin-probe.ts:68, the copy that survived the hand sweep that fixed the
    // other three. Message asserted for the same reason as above.
    {
      code: 'if (typeof body !== "object" || body === null || Array.isArray(body)) { return undefined; }',
      errors: [
        {
          message:
            "Use `isPlainObject` from `@/lib/input-schemas` instead of spelling the object/not-null/not-array triple inline — an unnamed copy is still a copy, and three of these were collapsed by hand once already.",
        },
      ],
    },
    // custom-host-rules.ts:40's spelling, which also carried a cast on the next
    // line that the helper's type predicate removes
    {
      code: 'if (typeof raw !== "object" || raw === null || Array.isArray(raw)) { return []; }',
      errors: [{ messageId: "inlinePlainObjectCheck" }],
    },
    // the positive polarity — preset-hover.ts:50's shape
    {
      code: 'const resolved = typeof node === "object" && node !== null && !Array.isArray(node) ? node : undefined;',
      errors: [{ messageId: "inlinePlainObjectCheck" }],
    },
    // …and verdict-sentence.ts:52's, verbatim (90855e63^): the triple buried in
    // the MIDDLE of a five-operand chain, inside a predicate callback. This is
    // the case a whole-node match walked past — its leftmost three operands
    // start at `m.key === updateType`, which classify() rejects.
    {
      code: 'const hit = ms.find((m) => m.key === updateType && typeof m.after === "object" && m.after !== null && !Array.isArray(m.after) && (m.after as Record<string, unknown>).automerge === true);',
      errors: [{ messageId: "inlinePlainObjectCheck" }],
    },
    // the triple in the TRAILING position of a longer chain, reported once on
    // the outermost node rather than twice
    {
      code: 'if (fresh || typeof v !== "object" || v === null || Array.isArray(v)) { return undefined; }',
      errors: [{ messageId: "inlinePlainObjectCheck" }],
    },
    // clause ORDER is not part of the shape: set membership, not position
    {
      code: 'if (Array.isArray(v) || v === null || typeof v !== "object") { return undefined; }',
      errors: [{ messageId: "inlinePlainObjectCheck" }],
    },
    {
      code: 'if (v !== null && !Array.isArray(v) && typeof v === "object") { use(v); }',
      errors: [{ messageId: "inlinePlainObjectCheck" }],
    },
    // the subject may be any expression, as long as all three spell it the same
    {
      code: 'if (typeof node.resolved !== "object" || node.resolved === null || Array.isArray(node.resolved)) { return undefined; }',
      errors: [{ messageId: "inlinePlainObjectCheck" }],
    },
    // ONE report for a three-operand chain: the inner `(a || b)` node has a
    // same-operator parent and returns before it looks at anything.
    {
      code: 'const plain = typeof v !== "object" || v === null || Array.isArray(v);',
      errors: [{ messageId: "inlinePlainObjectCheck" }],
    },
    // a fourth operand does not add a second report
    {
      code: 'if (typeof v !== "object" || v === null || Array.isArray(v) || v.bad) { return undefined; }',
      errors: [{ messageId: "inlinePlainObjectCheck" }],
    },
  ],
});
