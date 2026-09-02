import { ruleTester } from "../rule-tester.ts";
import rule from "./complete-enumeration-restatement.ts";

// The registries are scraped from the real tree, so these cases spell the real
// members: twelve `rcd` commands, seven results-tab ids. A member added to
// either enumeration turns the "complete" cases below into the very drift the
// rule reports, which is the intended way for this spec to fail.
const ALL_COMMANDS =
  '["compare", "digest", "docs", "extract", "group", "mcp", "provenance", "resolved", "run", "simulate", "tree", "validate"]';
const ALL_TABS = '["overview", "tests", "pipeline", "presets", "effective", "deps", "problems"]';

ruleTester.run("complete-enumeration-restatement", rule, {
  valid: [
    // ---- COMPLETE is deliberately silent: a full list is a golden pin, and it
    // starts reporting only once the enumeration grows past it.
    `for (const name of ${ALL_COMMANDS}) { expect(run.stdout).toContain(name); }`,
    `for (const tab of ${ALL_TABS}) { expect(resultsTabIdSchema.safeParse(tab).success).toBe(true); }`,
    // `share.test.ts`'s pin — the admissible shape, and the correction the
    // message names for a site that wants to keep a literal.
    `expect(RESULTS_TAB_IDS).toEqual(${ALL_TABS});`,
    // the definition itself, which is a complete list by construction
    `export const RESULTS_TAB_IDS = ${ALL_TABS} as const;`,
    // ---- the correction, once applied: neither shape is a literal list any more
    "for (const name of COMMANDS.map((command) => command.name)) { expect(run.stdout).toContain(name); }",
    "for (const tab of RESULTS_TAB_IDS) { check(tab); }",
    // ---- one member is not a restatement of anything
    'const only = ["validate"];',
    // ---- a list that mixes in a name the registry does not have is some other
    // list, not a partial copy of this one
    'const mixed = ["validate", "digest", "publish"];',
    'const tabs = ["overview", "tests", "settings"];',
    // ---- nothing here is a member at all
    'const files = ["clean.json", "invalid.json"];',
    'const keys = ["labels", "extends"];',
    // ---- not a plain list of string literals: spread, identifier, template,
    // hole, non-string. Each would need to be evaluated to know what it names.
    'const spread = ["validate", ...others];',
    'const named = ["validate", digestName, "run", "simulate", "compare", "docs"];',
    "const templated = [`validate`, `digest`, `run`, `simulate`, `compare`, `docs`];",
    'const sparse = ["validate", , "digest", "run", "simulate", "compare", "docs"];',
    'const mixedTypes = ["validate", 2, "run", "simulate", "compare", "docs"];',
    'const nested = [["clean.json", "invalid.json"], ["stdin.json"]];',
  ],
  invalid: [
    // `packages/cli/test/bin.test.ts:83` — six of the twelve commands, under the
    // title "--help writes the command list to stdout and exits 0".
    {
      code: 'for (const name of ["validate", "digest", "run", "simulate", "compare", "docs"]) { expect(run.stdout).toContain(name); }',
      errors: [{ messageId: "iterateTheEnumeration" }],
    },
    // `packages/cli/test/bundle/cli-surface.test.ts:56` — the second copy of
    // that same drifted list, looped twice in the built bin's only gate.
    {
      code: 'const COMMANDS = ["validate", "digest", "run", "simulate", "compare", "docs"];',
      errors: [{ messageId: "iterateTheEnumeration" }],
    },
    // THE ORIGINAL DEFECT, verbatim from before 2613e96e: "accepts every real
    // tab id" looped six of the seven ids, and `deps` was silently unasserted.
    {
      code: 'for (const tab of ["overview", "tests", "pipeline", "presets", "effective", "problems"]) { expect(resultsTabIdSchema.safeParse(tab).success).toBe(true); }',
      errors: [{ messageId: "iterateTheEnumeration" }],
    },
    // a single missing member is the whole defect — the drift is always one id
    // at a time, and the rule fires on the first one
    {
      code: 'const commands = ["compare", "digest", "docs", "extract", "group", "mcp", "provenance", "resolved", "run", "simulate", "tree"];',
      errors: [{ messageId: "iterateTheEnumeration" }],
    },
    // the smallest restatement the rule sees at all
    {
      code: 'const pair = ["validate", "digest"];',
      errors: [{ messageId: "iterateTheEnumeration" }],
    },
    // single quotes are the same list
    {
      code: "const tabs = ['overview', 'tests', 'pipeline'];",
      errors: [{ messageId: "iterateTheEnumeration" }],
    },
    // THE RESIDUAL FALSE POSITIVE, pinned rather than left to be discovered: a
    // subset chosen on purpose reads exactly like a drifted copy, and the rule
    // says so. No such site exists today; when one does, it takes an inline
    // disable naming the subset.
    {
      code: 'expect(visibleTabs).toEqual(["overview", "tests"]);',
      errors: [{ messageId: "iterateTheEnumeration" }],
    },
  ],
});
