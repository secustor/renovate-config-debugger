import { ruleTester } from "../rule-tester.ts";
import rule from "./use-error-message.ts";

ruleTester.run("use-error-message", rule, {
  valid: [
    // already using the helper
    `errorMessage(err);`,
    `causedErrorMessage(err);`,
    // narrowing against something other than Error
    `err instanceof TypeError ? err.message : String(err);`,
    // reads a different property
    `err instanceof Error ? err.name : String(err);`,
    // falls back to something other than String()
    `err instanceof Error ? err.message : "unknown";`,
    `err instanceof Error ? err.message : fallback(err);`,
    // App.tsx's deliberate variant: it adds the CLASS, which the helper does
    // not, so it must NOT be reported.
    "err instanceof Error ? `${err.name}: ${err.message}` : String(err);",
    // not a conditional at all
    `if (err instanceof Error) { report(err.message); }`,
  ],
  invalid: [
    {
      code: `err instanceof Error ? err.message : String(err);`,
      errors: [{ messageId: "useErrorMessage" }],
    },
    // the name is irrelevant — the SHAPE is the idiom
    {
      code: `e instanceof Error ? e.message : String(e);`,
      errors: [{ messageId: "useErrorMessage" }],
    },
    // as part of the nested-cause compound the repo also had
    {
      code: `const d = e?.err?.message ?? (err instanceof Error ? err.message : String(err));`,
      errors: [{ messageId: "useErrorMessage" }],
    },
    // inside a template literal
    {
      code: "const s = `failed: ${err instanceof Error ? err.message : String(err)}`;",
      errors: [{ messageId: "useErrorMessage" }],
    },
  ],
});
