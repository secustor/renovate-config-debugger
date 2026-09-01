import { ruleTester } from "../rule-tester.ts";
import rule from "./use-rule-ref.ts";

ruleTester.run("use-rule-ref", rule, {
  valid: [
    // already using the helper
    "const ref = ruleRef(index);",
    "const label = `${ruleRef(rule.index)} — ${ruleLabel(rule)}`;",
    // a template that mentions rules but does not open the subscript
    "const s = `packageRules has ${n} entries`;",
    // a plain string is not a template — prose and test fixtures keep theirs,
    // and a golden assertion SHOULD spell the exact wording out
    `const message = "GitHub rejected packageRules[0]";`,
    // a different array
    "const s = `hostRules[${i}]`;",
  ],
  invalid: [
    {
      code: "const s = `packageRules[${index}]`;",
      errors: [{ messageId: "useRuleRef" }],
    },
    // embedded in a longer sentence
    {
      code: "const s = `merged rule packageRules[${cross}] in the simulator`;",
      errors: [{ messageId: "useRuleRef" }],
    },
    // inside a nested expression
    {
      code: "const s = `${label}: packageRules[${ms.ruleIndex}] changed nothing`;",
      errors: [{ messageId: "useRuleRef" }],
    },
  ],
});
