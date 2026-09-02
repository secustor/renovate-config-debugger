import { ruleTester } from "../rule-tester.ts";
import rule from "./use-json-snippet.ts";

ruleTester.run("use-json-snippet", rule, {
  valid: [
    // already using the helper, with and without the budget
    "const out = jsonSnippet(value, 100);",
    "const out = jsonSnippet(value);",
    // `truncate` on text that is not a JSON rendering — the three other real
    // `truncate` sites in the two files this rule converted.
    "const out = truncate(text, 140);",
    "const out = truncate(quoted, PREVIEW_CHARS);",
    'const out = truncate(doc.supportedManagers.join(", "), 120);',
    // `jsonText` on its own is the untruncated rendering, which several sites
    // want (`rule-format`'s copy-as-markdown export).
    "const out = jsonText(value);",
    // THE DELIBERATE FALSE NEGATIVE: the JSON is parked in a variable first, so
    // the composition is not literal and the rule stays silent by design.
    "const text = jsonText(value);\nconst out = truncate(text, 60);",
    // a different outer callee — only `truncate` composes into `jsonSnippet`
    "const out = clip(jsonText(value), 60);",
    // …and a different inner one: `jsonLiteral` is text that must parse back,
    // not a display rendering, so there is no `jsonSnippet` for it.
    "const out = truncate(jsonLiteral(value), 60);",
    "const out = truncate(jsonDocument(value), 60);",
    // a member callee is some other object's method, not the imported binding
    "const out = helpers.truncate(jsonText(value), 60);",
    "const out = truncate(fmt.jsonText(value), 60);",
    // `jsonText` with a replacer is not the one-argument rendering the helper
    // composes, so the substitution would not be output-identical.
    "const out = truncate(jsonText(value, replacer), 60);",
    "const out = truncate(jsonText(), 60);",
    // the JSON rendering is not the truncated argument
    "const out = truncate(text, jsonText(budget));",
  ],
  invalid: [
    // THE ORIGINAL DEFECT, verbatim from `features/simulator/rule-format.ts`
    // before 75684991 deleted it: `fixSnippet`'s body with the budget as a
    // parameter, a slice away from the home that declares itself the home.
    {
      code: "export function previewValue(value: unknown, max = 60): string {\n  return truncate(jsonText(value), max);\n}",
      errors: [{ messageId: "useJsonSnippet" }],
    },
    // the two copies still live when the rule landed
    // `features/effective-config/description-ledger.ts:350`
    {
      code: "export function unattributedValueText(value: unknown): string {\n  return truncate(jsonText(value), UNATTRIBUTED_PREVIEW_CHARS);\n}",
      errors: [{ messageId: "useJsonSnippet" }],
    },
    // `components/option-docs.tsx:140`, with its literal budget
    {
      code: "const out = truncate(jsonText(doc.default), 100);",
      errors: [{ messageId: "useJsonSnippet" }],
    },
    // the home file's own two spellings — reported, and silenced by the
    // one-file `"off"` override for `lib/value-preview.ts` rather than by a
    // shape carve-out (precedent: `lib/truncate.ts` vs `rcd/use-truncate`).
    {
      code: "export function jsonSnippet(value: unknown, max = 60): string {\n  return truncate(jsonText(value), max);\n}",
      errors: [{ messageId: "useJsonSnippet" }],
    },
    {
      code: "const out = truncate(jsonText(value), 80);",
      errors: [{ messageId: "useJsonSnippet" }],
    },
    // nested in an interpolation, which is how both live copies read on screen
    {
      code: "const out = `${key} = ${truncate(jsonText(value), 40)}`;",
      errors: [{ messageId: "useJsonSnippet" }],
    },
    // one report per composition, not one per file
    {
      code: "const a = truncate(jsonText(x), 40);\nconst b = truncate(jsonText(y), 40);",
      errors: [{ messageId: "useJsonSnippet" }, { messageId: "useJsonSnippet" }],
    },
  ],
});
