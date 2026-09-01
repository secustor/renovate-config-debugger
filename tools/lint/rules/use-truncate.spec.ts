import { ruleTester } from "../rule-tester.ts";
import rule from "./use-truncate.ts";

ruleTester.run("use-truncate", rule, {
  valid: [
    // already using the helper
    "truncate(text, 140);",
    // ---- every one of these is a real site in this repo, and every one is an
    // ARRAY slice. They are the reason the rule requires an adjacent ellipsis:
    // without type information nothing else tells an array from a string.
    "QUICK_FILLS.slice(0, 3).map(render);",
    "const shown = changedKeys.slice(0, 3);",
    "const head = names.slice(0, 2);",
    // …including one that DOES mention an ellipsis, just not stuck onto the
    // slice: the parent is `.join()`, and the ellipsis is in a ternary further
    // out (`RepoDepsTab`).
    'const named = files.slice(0, 4).join(", ") + (files.length > 4 ? ", …" : "");',
    // ordinary offset arithmetic
    "rest.slice(1);",
    "text.slice(10, 20);",
    "text.slice(0, max);",
    // concatenated with something that is not an ellipsis
    'text.slice(0, 140) + " more";',
    // an ellipsis before the expression is a prefix, not a truncation marker
    "const s = `… ${count} more across ${named}`;",
  ],
  invalid: [
    // `ProblemCard` / `ErrorTranslationView`, shape one
    {
      code: 'const out = text.slice(0, 140) + "…";',
      errors: [{ messageId: "useTruncate" }],
    },
    // reversed operands
    {
      code: 'const out = "…" + text.slice(0, 140);',
      errors: [{ messageId: "useTruncate" }],
    },
    // shape two: the ellipsis is the quasi that FOLLOWS the expression
    {
      code: "const out = `${text.slice(0, 140)}…`;",
      errors: [{ messageId: "useTruncate" }],
    },
    // the full conditional both copies were written as
    {
      code: "const out = text.length > 140 ? `${text.slice(0, 140)}…` : text;",
      errors: [{ messageId: "useTruncate" }],
    },
    // on a call's result, which is how the JSON snippet was cut
    {
      code: "const out = `${JSON.stringify(value).slice(0, 80)}…`;",
      errors: [{ messageId: "useTruncate" }],
    },
  ],
});
