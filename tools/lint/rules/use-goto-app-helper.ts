import { defineRule, type ESTree } from "@oxlint/plugins";

/**
 * The two-line "land on the app and wait for the default config to be in the
 * editor" preamble was repeated verbatim 27 times across `packages/app/e2e`
 * while `e2e/helpers.ts` existed to spell it once (structure review, finding
 * 49). The sweep that collapsed them missed two — 02-share-running.spec.ts,
 * in a file that already imports the helper, and 12-layout-regressions.spec.ts
 * — which is exactly the invisible-in-review shape a rule is for: each copy is
 * trivially correct on its own, and the Stop hook excludes the e2e suite, so
 * oxlint is the only gate a spec-file edit passes through.
 *
 * WHY THE SHAPE IS THIS NARROW. After the two conversions above, the specs hold
 * 60 bare `page.goto("/")` calls that legitimately do NOT want this wait (the
 * 61st in the directory is `helpers.ts`'s own, i.e. the one that DOES, and the
 * glob stops at `*.spec.ts`): they land and immediately
 * drive a run, which `gotoAppAtDefaultConfig`'s own docstring names as the case
 * that waits through `runAndAwaitResult` instead. Requiring the
 * `config:recommended` assertion in the same window is what encodes that
 * distinction, and it is why the anchor must be a `goto` — the same assertion
 * appears alone as a revert check and as a resolved-config document assertion,
 * neither of which the helper can serve.
 *
 * The window is the next THREE statements, not the next one: at
 * 12-layout-regressions.spec.ts a `const editor = page.locator(".cm-content")`
 * sits between the two. The intervening statement's kind is ignored, and so is
 * the locator expression — the same move `use-truncate` makes in ignoring what
 * is being sliced — which catches the inline-locator and named-variable
 * spellings alike with no type information.
 *
 * `Literal("/")` exactly, so share-fragment landings (`goto("#config=…")`),
 * `about:blank` round-trips and `page.reload()` are all out; a reload is out on
 * purpose, since the helper navigates. The accepted false negative is a copy
 * that hides the marker behind a constant — narrowing on the literal is the
 * price of a zero-false-positive count over the whole directory.
 */

const APP_ROOT = "/";
const DEFAULT_CONFIG_MARKER = "config:recommended";
/** The `const editor = …` at 12-layout-regressions.spec.ts is one such gap. */
const WINDOW = 3;

/** The arguments of `<obj>.<method>(…)` as a statement, `await` or not. */
function methodCallArguments(
  statement: ESTree.Statement,
  method: string,
): ESTree.CallExpression["arguments"] | undefined {
  if (statement.type !== "ExpressionStatement") {
    return undefined;
  }
  const expression = statement.expression;
  const call = expression.type === "AwaitExpression" ? expression.argument : expression;
  if (call.type !== "CallExpression") {
    return undefined;
  }
  const callee = call.callee;
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier" ||
    callee.property.name !== method
  ) {
    return undefined;
  }
  return call.arguments;
}

/** `await page.goto("/")` — the app root, never a share fragment. */
function isAppRootGoto(statement: ESTree.Statement): boolean {
  const args = methodCallArguments(statement, "goto");
  return args?.length === 1 && args[0]?.type === "Literal" && args[0].value === APP_ROOT;
}

/** `await expect(<locator>).toContainText("config:recommended")` */
function isDefaultConfigWait(statement: ESTree.Statement): boolean {
  const [first] = methodCallArguments(statement, "toContainText") ?? [];
  return first?.type === "Literal" && first.value === DEFAULT_CONFIG_MARKER;
}

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      useGotoAppHelper:
        'Use `gotoAppAtDefaultConfig(page)` from `./helpers` instead of re-spelling the land-and-wait preamble. The `config:recommended` wait IS the "app is mounted and idle" signal, and the helper states that once — so the day the default editor content changes, this is one edit rather than N.',
    },
  },
  createOnce(context) {
    return {
      BlockStatement(node) {
        const body = node.body;
        for (const [index, statement] of body.entries()) {
          if (!isAppRootGoto(statement)) {
            continue;
          }
          for (let ahead = index + 1; ahead <= index + WINDOW && ahead < body.length; ahead++) {
            const next = body[ahead];
            if (!next || isAppRootGoto(next)) {
              break;
            }
            if (isDefaultConfigWait(next)) {
              context.report({ node: statement, messageId: "useGotoAppHelper" });
              break;
            }
          }
        }
      },
    };
  },
});
