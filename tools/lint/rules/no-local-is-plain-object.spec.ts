import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import rule from "./no-local-is-plain-object.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" } },
});

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
    {
      code: "function isPlainObject(value: unknown): value is Record<string, unknown> { return true; }",
      errors: [{ messageId: "ownedElsewhere" }],
    },
    // exported copies are no better — this is about ownership, not visibility
    {
      code: "export function isPlainObject(v: unknown) { return typeof v === 'object'; }",
      errors: [{ messageId: "ownedElsewhere" }],
    },
  ],
});
