import { defineRule, type ESTree } from "@oxlint/plugins";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../repo-root.ts";

/**
 * Arm (a), and the only rule of the set that guards a COVERAGE LIE rather than
 * a code defect: a test hand-copies part of an enumeration that has a home, and
 * the copy stops covering the members added after it was written.
 *
 * The class shipped, and the tree records it. `packages/cli/src/main.test.ts`
 * says it in its own words — "a hand-written list is how `group` and `mcp` came
 * to be shipped untested by this suite" — and converted that suite to iterate
 * the registry. Sweep V's finding 29 is the other half in the app: a test
 * titled "accepts every real tab id" looped SIX of the seven `RESULTS_TAB_IDS`,
 * because the hand-copied list never gained the `deps` id roadmap 089 added
 * (2613e96e adds the literal, and nothing stops the eighth id drifting the same
 * way). Finding 50's own fix then created a second copy of the CLI's drifted
 * list, in the file that is the built bin's only gate.
 *
 * Invisible in review is the whole point: every one of these lists is a correct
 * list of real names, and only counting it against the registry shows it is six
 * of twelve.
 *
 * A COMPLETE RESTATEMENT IS DELIBERATELY SILENT. That is the proper-subset
 * condition, and it is what keeps the rule honest: a full list is a golden pin —
 * `share.test.ts`'s `expect(RESULTS_TAB_IDS).toEqual([…])` is the admissible
 * shape — and it starts reporting the moment the enumeration grows, which is
 * exactly the moment the copy becomes a lie. Requiring EVERY element to be a
 * plain string literal and a member excludes the rest: a list that mixes in one
 * name the registry does not have is not a restatement of it, it is some other
 * list.
 *
 * THE ONE RESIDUAL FALSE POSITIVE, named here rather than discovered later: a
 * proper subset chosen ON PURPOSE is indistinguishable from a drifted copy, and
 * the rule reports it. `expect(visibleTabs).toEqual(["overview", "tests"])` —
 * a test about a FILTERED tab strip — reads as "names 2 of the 7 ids in
 * `RESULTS_TAB_IDS`". Zero such sites exist today, so no exemption is carried;
 * when one appears the answer is an inline disable saying which subset it is,
 * because the alternative (guessing intent from the assertion around the list)
 * is the heuristic this rule is built to avoid.
 *
 * THE REGISTRIES ARE READ FROM THE TREE, through the same root walk
 * `comment-cites-what-exists` uses — `tools/lint/repo-root.ts`, shared rather
 * than copied, and memoized there once per lint process for both. Two entries,
 * two file reads, no type information and no cross-file AST. The command list is `readdirSync` of `packages/cli/src/commands/` minus
 * the colocated tests, which is literally what `main.test.ts`'s own
 * `commandModules` reads, so the rule and the suite agree on what "exists"
 * means. A scrape that matches nothing yields an empty registry and the rule
 * goes silent — it fails open, never toward a false positive — and adding an
 * entry is the only way to widen it, so the blast radius stays a decision.
 * (`ENGINE_STAGE_IDS` would be a one-line third and adds nothing today: all
 * three of its restatements are complete, and one is already pinned by
 * `satisfies`.)
 *
 * SCOPE IS TEST TREES ONLY, where a restatement stands in for coverage. The
 * repo measures identically clean when the rule is pointed at everything, so
 * the scope buys no precision today — it keeps the message TRUE of every site
 * the rule can reach, and structurally excludes a future production subset that
 * is deliberately partial. The registry definitions are complete lists and are
 * therefore out of shape even inside the glob, so the rule needs no exemption
 * anywhere.
 */

/** Where the enumerations live, and where a test should be reading them from. */
interface Registry {
  /** How the message names the set. */
  readonly label: string;
  /** The correction the message names: what to iterate instead of the copy. */
  readonly source: string;
  readonly members: readonly string[];
}

const COMMANDS_DIR = "packages/cli/src/commands";
const RESULTS_TABS_FILE = "packages/app/src/data/results-tabs.ts";

/** The `as const` block by name — anchored on the export, so the retired-id lists below it are not read. */
const RESULTS_TAB_IDS_BLOCK = /export const RESULTS_TAB_IDS\s*=\s*\[([^\]]*)\]\s*as const/;
const DOUBLE_QUOTED = /"([^"]*)"/g;

/** One module per command, named after it — the convention `main.test.ts` reads as the list that EXISTS. */
function commandMembers(root: string): readonly string[] {
  try {
    return readdirSync(join(root, COMMANDS_DIR))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => file.slice(0, -".ts".length));
  } catch {
    return [];
  }
}

function resultsTabMembers(root: string): readonly string[] {
  let text = "";
  try {
    text = readFileSync(join(root, RESULTS_TABS_FILE), "utf8");
  } catch {
    return [];
  }
  const block = RESULTS_TAB_IDS_BLOCK.exec(text);
  const body = block?.[1];
  if (body === undefined) {
    return [];
  }
  return [...body.matchAll(DOUBLE_QUOTED)].map((match) => match[1] ?? "");
}

// Built once per lint process. An entry that scraped nothing is dropped rather
// than kept empty, so a moved file silences that arm instead of misreporting.
let registries: readonly Registry[] | undefined;
function enumerations(): readonly Registry[] {
  if (registries === undefined) {
    const root = repoRoot();
    registries = [
      {
        label: `\`rcd\` commands in \`${COMMANDS_DIR}/\``,
        source:
          "`COMMANDS` from `src/main`, or the `src/commands/` module listing where importing `src/` is not available",
        members: commandMembers(root),
      },
      {
        label: "ids in `RESULTS_TAB_IDS`",
        source: "`RESULTS_TAB_IDS` from `@/data/results-tabs`",
        members: resultsTabMembers(root),
      },
    ].filter((registry) => registry.members.length > 0);
  }
  return registries;
}

/** The array's values when it is a plain list of at least two string literals — no spread, no hole, no expression. */
function stringLiterals(node: ESTree.ArrayExpression): readonly string[] | undefined {
  const values: string[] = [];
  for (const element of node.elements) {
    if (element === null || element.type !== "Literal" || typeof element.value !== "string") {
      return undefined;
    }
    values.push(element.value);
  }
  return values.length < 2 ? undefined : values;
}

function quoteAll(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(", ");
}

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      iterateTheEnumeration:
        "This list names {{n}} of the {{total}} {{registry}} — missing {{missing}} — so it asserts nothing about the rest. Iterate {{source}}, or pin the whole list with `toEqual`, which fails on drift by construction.",
    },
  },
  createOnce(context) {
    const known = enumerations();
    return {
      ArrayExpression(node) {
        const values = stringLiterals(node);
        if (values === undefined) {
          return;
        }
        const present = new Set(values);
        for (const registry of known) {
          if (!values.every((value) => registry.members.includes(value))) {
            continue;
          }
          const missing = registry.members.filter((member) => !present.has(member));
          if (missing.length === 0) {
            return;
          }
          context.report({
            node,
            messageId: "iterateTheEnumeration",
            data: {
              n: String(present.size),
              total: String(registry.members.length),
              registry: registry.label,
              missing: quoteAll(missing),
              source: registry.source,
            },
          });
          return;
        }
      },
    };
  },
});
