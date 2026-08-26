import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import rule from "./use-synced-reset.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" } },
});

ruleTester.run("use-synced-reset", rule, {
  valid: [
    // already using the hook
    "useSyncedReset(result, () => { setSelectedNodeId(null); });",
    // a guard that compares two things and then does unrelated work — the
    // setter does not name either side of the comparison
    "if (a !== b) { doSomething(c); }",
    "if (a !== b) { setOther(null); }",
    // an equality guard is not the adopt-the-new-value idiom
    "if (owner === value) { setOwner(value); }",
    // comparing against a literal or a member expression is a plain condition
    "if (count !== 0) { setCount(0); }",
    "if (owner !== props.value) { setOwner(props.value); }",
    // the setter is called with something else entirely
    "if (owner !== value) { setOwner(fresh); }",
    // not a setter by name
    "if (owner !== value) { updateOwner(value); }",
  ],
  invalid: [
    // the canonical shape
    {
      code: "if (owner !== value) { setOwner(value); }",
      errors: [{ messageId: "useSyncedReset" }],
    },
    // with the reset work following the adopt
    {
      code: "if (owner !== model) { setOwner(model); openCards.reset(); }",
      errors: [{ messageId: "useSyncedReset" }],
    },
    // operands the other way round, which several sites used
    {
      code: "if (result !== resultOwner) { setResultOwner(result); }",
      errors: [{ messageId: "useSyncedReset" }],
    },
    // loose inequality
    {
      code: "if (owner != value) { setOwner(value); }",
      errors: [{ messageId: "useSyncedReset" }],
    },
    // no braces
    {
      code: "if (owner !== value) setOwner(value);",
      errors: [{ messageId: "useSyncedReset" }],
    },
  ],
});
