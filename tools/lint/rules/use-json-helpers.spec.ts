import { ruleTester } from "../rule-tester.ts";
import rule from "./use-json-helpers.ts";

ruleTester.run("use-json-helpers", rule, {
  valid: [
    // ---- the helpers themselves are the point ------------------------------
    `import { jsonEqual, jsonText } from "@renovate-config-debugger/engine/json";`,
    "function text(value) { return jsonText(value); }",
    "function same(a, b) { return jsonEqual(a, b); }",
    // ---- `JSON.parse` is out of scope entirely: the rule matches only the
    // `stringify` member, and every round-trip clone in the tree is one call
    "function f(value) { return JSON.parse(value); }",
    // ---- lookalikes that are not this call. These are what pin the matcher,
    // and they are carried over verbatim from `no-unguarded-json-stringify`.
    "function f(value) { return stringify(value); }",
    "function f(value) { return json.stringify(value); }",
    'function f(value) { return JSON["stringify"](value); }',
    "function f(value) { return serializer.JSON.stringify(value); }",
    // ---- a bare `return` and a return of something else
    "function f() { return; }",
    "function f(value) { return String(value); }",
  ],
  invalid: [
    // ---- the equality arm: 18 of the 74 calls, the largest single class -----
    // features/simulator/pins.ts:46. The rendered message is asserted, not just
    // the id: the point of the arm is that the diagnostic names `jsonEqual`
    // rather than sending each side to `jsonText` separately.
    {
      code: "function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }",
      errors: [
        {
          message:
            "Use `jsonEqual(a, b)` from `@renovate-config-debugger/engine/json` instead of comparing two `JSON.stringify` results — nine sites spelled this pair by hand. It is ORDER-SENSITIVE, same as what it replaces; `deepEqual` in `engine/src/lib.ts` is the order-insensitive one.",
        },
      ],
    },
    // lib/value-preview.ts:48 — the negated spelling names the `!`
    {
      code: "function changed(before, after) { return JSON.stringify(before) !== JSON.stringify(after); }",
      errors: [
        {
          message:
            "Use `!jsonEqual(a, b)` from `@renovate-config-debugger/engine/json` instead of comparing two `JSON.stringify` results — nine sites spelled this pair by hand.",
        },
      ],
    },
    // features/simulator/verdict-threads.ts:134
    {
      code: "const equal = (item, i) => JSON.stringify(item) === JSON.stringify(after[i]);",
      errors: [{ messageId: "preferJsonEqual" }],
    },
    // ONE error, not three: the two operand calls stand down for the comparison
    // that already claims them.
    {
      code: "const equal = JSON.stringify(pinShareFields(a)) == JSON.stringify(pinShareFields(b));",
      errors: [{ messageId: "preferJsonEqual" }],
    },
    // an indent or a replacer is NOT `jsonEqual`'s shape, so the comparison arm
    // stands down and each side reports on its own
    {
      code: "const equal = JSON.stringify(a, null, 2) === JSON.stringify(b, null, 2);",
      errors: [{ messageId: "useJsonHelper" }, { messageId: "useJsonHelper" }],
    },
    // …and a comparison with only one stringify side is likewise just a call
    {
      code: 'const equal = JSON.stringify(a) === "{}";',
      errors: [{ messageId: "useJsonHelper" }],
    },

    // ---- the call arm ------------------------------------------------------
    // the defect as it shipped: cli/src/output.ts before 118e367c. The full
    // message is asserted once, because it is what tells the author how to pick
    // between the four wrappers.
    {
      code: "export function json(value) { return JSON.stringify(value, null, 2); }",
      errors: [
        {
          message:
            "Use a helper from `@renovate-config-debugger/engine/json` instead of `JSON.stringify` (inside `packages/engine`, `./json`). Pick by SINK, not by site: `jsonText` for something a human reads or an identity key (no-JSON-form values read as `undefined`); `jsonLiteral` for text that must parse back — storage, a request body, a share payload, a byte budget (they become `null`); `jsonDocument` for 2-space document text; `jsonFile` for the same plus a trailing newline. `JSON.stringify` is declared to return `string` but returns `undefined` for `undefined`, a function or a symbol, and lib.es5's overload hides that from `tsc` — that is what shipped in `cli/src/output.ts` (sweep finding 9) and it is the only thing these four wrappers do. If this call genuinely produces no text (a replacer, or a `JSON.parse(JSON.stringify(x))` clone), add an `// oxlint-disable-next-line rcd/use-json-helpers -- <why>`.",
        },
      ],
    },
    // lib/verdict-sentence.ts:9, the ternary the OLD rule documented as a
    // deliberate false negative. Arm (a) has somewhere to send it, so it reports.
    {
      code: 'const plain = (v) => (typeof v === "string" ? v : JSON.stringify(v));',
      errors: [{ messageId: "useJsonHelper" }],
    },
    // every hand-maintained fallback in the tree is still a call: the `??` was
    // the decision the helper now owns, not an exemption
    {
      code: 'function json(value) { return JSON.stringify(value, null, 2) ?? "null"; }',
      errors: [{ messageId: "useJsonHelper" }],
    },
    {
      code: 'function text(value) { return JSON.stringify(value) ?? "undefined"; }',
      errors: [{ messageId: "useJsonHelper" }],
    },
    {
      code: "const show = (value) => JSON.stringify(value) ?? String(value);",
      errors: [{ messageId: "useJsonHelper" }],
    },
    // NO carve-out for a literal aggregate. The old rule exempted these because
    // such a call always returns a string; under the helper design the point is
    // that one module knows the fallback, and dropping the carve-out removes the
    // rule's only piece of type reasoning. app/App.tsx:90 is one of the three.
    {
      code: "function key() { return JSON.stringify([globalConfig ?? null, inheritedConfig ?? null]); }",
      errors: [{ messageId: "useJsonHelper" }],
    },
    {
      code: "const snapshot = () => JSON.stringify({ renderCounts, appCommits });",
      errors: [{ messageId: "useJsonHelper" }],
    },
    // …and no narrowing to a return position either: an argument, an
    // initialiser and a bare statement all produce text somebody consumes
    {
      code: "log(JSON.stringify(value));",
      errors: [{ messageId: "useJsonHelper" }],
    },
    {
      code: "const body = JSON.stringify(value);",
      errors: [{ messageId: "useJsonHelper" }],
    },
    {
      code: "JSON.stringify(value);",
      errors: [{ messageId: "useJsonHelper" }],
    },
    {
      code: "const line = `${JSON.stringify(value, null, 2)}\\n`;",
      errors: [{ messageId: "useJsonHelper" }],
    },
    // a replacer has no helper shape; it is one site in the tree and carries an
    // inline disable rather than a rule carve-out, so it still reports here
    {
      code: "const flat = JSON.parse(JSON.stringify(value, replacerFn));",
      errors: [{ messageId: "useJsonHelper" }],
    },
    // two hits in one function body
    {
      code: "function f(a, b) { if (a) { return JSON.stringify(a); } return JSON.stringify(b); }",
      errors: [{ messageId: "useJsonHelper" }, { messageId: "useJsonHelper" }],
    },
  ],
});
