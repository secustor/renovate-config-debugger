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
  ],
});
