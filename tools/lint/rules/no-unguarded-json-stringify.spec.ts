import { ruleTester } from "../rule-tester.ts";
import rule from "./no-unguarded-json-stringify.ts";

ruleTester.run("no-unguarded-json-stringify", rule, {
  valid: [
    // ---- the guarded idiom, in all three spellings that exist in the tree.
    // These are `LogicalExpression`s, so the rule never sees the call at all.
    'function json(value) { return JSON.stringify(value, null, 2) ?? "null"; }', // cli/src/output.ts:29
    'function text(value) { return JSON.stringify(value) ?? "undefined"; }', // features/simulator/rule-format.ts:13
    "const show = (value) => JSON.stringify(value) ?? String(value);",
    // ---- equality tests: a `BinaryExpression`, likewise never visited. The
    // undefined-in/undefined-out case compares equal, which is the intent.
    "function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }", // features/simulator/pins.ts:46
    "function changed(before, after) { return JSON.stringify(before) !== JSON.stringify(after); }", // lib/value-preview.ts:48
    "const equal = (item, i) => JSON.stringify(item) === JSON.stringify(after[i]);", // features/simulator/verdict-threads.ts:134
    // ---- literal aggregates: an array or object literal always stringifies to
    // a string, so the declared `string` is honest.
    "function key() { return JSON.stringify([globalConfig ?? null, inheritedConfig ?? null]); }", // app/App.tsx:89
    "const snapshot = () => JSON.stringify({ renderCounts, appCommits });",
    "function pretty(a, b) { return JSON.stringify([a, b], null, 2); }",
    // ---- not a return position at all: an argument, an initialiser, a
    // statement. The narrowing to a returned expression is what keeps the rule
    // off every incidental call.
    "log(JSON.stringify(value));",
    "const body = JSON.stringify(value);",
    "JSON.stringify(value);",
    // ---- a block-bodied arrow whose stringify is not what it returns
    'const f = (value) => { const s = JSON.stringify(value); return s ?? "null"; };',
    // ---- the deliberate false negative, asserted so a later widening has to
    // change this file on purpose: the ternary spelling (lib/verdict-sentence.ts:9).
    'const plain = (v) => (typeof v === "string" ? v : JSON.stringify(v));',
    // ---- lookalikes that are not this call
    "function f(value) { return JSON.parse(value); }",
    "function f(value) { return stringify(value); }",
    "function f(value) { return json.stringify(value); }",
    'function f(value) { return JSON["stringify"](value); }',
    "function f(value) { return serializer.JSON.stringify(value); }",
    // ---- a bare `return` and a return of something else
    "function f() { return; }",
    "function f(value) { return String(value); }",
  ],
  invalid: [
    // the live hit this rule ships with: `plainValue(value: unknown): string`
    // in lib/verdict-sentence.ts, whose three siblings all guard the identical
    // `unknown`-in/`string`-out shape.
    {
      code: "function plainValue(value) { return JSON.stringify(value); }",
      errors: [{ messageId: "unguardedStringify" }],
    },
    // the defect as it shipped: cli/src/output.ts before 118e367c
    {
      code: "export function json(value) { return JSON.stringify(value, null, 2); }",
      errors: [{ messageId: "unguardedStringify" }],
    },
    // arrow with an expression body
    {
      code: "const text = (value) => JSON.stringify(value);",
      errors: [{ messageId: "unguardedStringify" }],
    },
    {
      code: "const pretty = (value) => JSON.stringify(value, null, 2);",
      errors: [{ messageId: "unguardedStringify" }],
    },
    // a block-bodied arrow reaches the `ReturnStatement` arm
    {
      code: "const text = (value) => { return JSON.stringify(value); };",
      errors: [{ messageId: "unguardedStringify" }],
    },
    // a method, and a nested return — position, not the enclosing function kind
    {
      code: "const o = { serialise(value) { return JSON.stringify(value); } };",
      errors: [{ messageId: "unguardedStringify" }],
    },
    {
      code: 'function f(value) { if (ready) { return JSON.stringify(value); } return ""; }',
      errors: [{ messageId: "unguardedStringify" }],
    },
    // a non-literal argument that merely LOOKS aggregate: an identifier, a
    // spread-built array, a call. None of them promises a string.
    {
      code: "function f(values) { return JSON.stringify(values); }",
      errors: [{ messageId: "unguardedStringify" }],
    },
    {
      code: "function f(a) { return JSON.stringify(a.items); }",
      errors: [{ messageId: "unguardedStringify" }],
    },
    {
      code: "function f(value) { return JSON.stringify(pinShareFields(value)); }",
      errors: [{ messageId: "unguardedStringify" }],
    },
    // two hits in one function body
    {
      code: "function f(a, b) { if (a) { return JSON.stringify(a); } return JSON.stringify(b); }",
      errors: [{ messageId: "unguardedStringify" }, { messageId: "unguardedStringify" }],
    },
  ],
});
