import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

// The one `RuleTester` every rule spec in `rules/` runs against. Named export,
// not default: the `import/no-default-export` override does not cover this file.
RuleTester.describe = describe;
RuleTester.it = it;

export const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" } },
});
