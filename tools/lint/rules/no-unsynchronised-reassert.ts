import { defineRule, type ESTree } from "@oxlint/plugins";

/**
 * Arm (b), the same position as `no-uncaught-void-chain`: there is no import to
 * name, because the fix is a sequencing decision — so the diagnostic names the
 * decision instead.
 *
 * THE DEFECT. Playwright's web-first assertions retry until they pass, so one
 * that is already true on its first poll resolves against the page as it was
 * BEFORE the interaction above it — and the test cannot fail for the reason it
 * names. `e2e/helpers.ts`'s `expectRunIdle` writes the principle down ("an
 * absence is already true BEFORE the run starts, so every assertion sequenced
 * after this helper could resolve against the pre-run page") and names a test
 * that was passing for exactly that reason. 335a72ce fixed two by hand: the
 * Revert half of 11-tabbed-shell's stale-banner test now clicks Revert and
 * waits on the revert's OWN landing — `toHaveCount(0)` on the button, the
 * restored editor text — before re-asserting the banner it was already
 * looking at. Six more were live when this rule was written (04-simulator's
 * "survives a re-run", two keypress no-ops in 19-keyboard, three panel-stays-
 * open re-asserts in 22-build-info), each one a claim that could not fail.
 *
 * The shape the rule reports is the shape of all eight: `expect(X).m(…)`, a
 * raw interaction, then `expect(X).m(…)` again, byte for byte. The correction
 * is always the same — assert what the interaction ITSELF produces (a focus
 * move, a count going to zero, the content it swaps in) and re-assert after
 * that.
 *
 * WHY THE SHAPE IS THIS NARROW. Two conditions carry the whole zero-false-
 * positive count over `packages/app/e2e`:
 *
 * 1. It keys on the assertion's TARGET, not on the assertion. A repeat is only
 *    a repeat when the SAME target is given the SAME claim: `.repo-panel` going
 *    count 1 → Escape → count 0 (12-layout-regressions) is a real transition,
 *    and an intervening assertion on the same target supersedes the entry, which
 *    is why the model fix at 12-layout-regressions' revert test — a
 *    `toBeVisible` between two `toHaveCount(0)`s — stays out.
 * 2. Only a RAW interaction may sit in between (a `click`, a `press`, a `fill`
 *    …). Every other statement clears the record: a helper such as `openTab`
 *    awaits its own landing, so the assertion after it is meaningful, and that
 *    is what keeps 06-error-states-and-filters and 11-tabbed-shell's
 *    tab-switch re-asserts out. A `const`, a `goto`, an `evaluate`, an
 *    unawaited call and an `expect(…).not.…` chain all clear it too — the
 *    conservative half, and deliberately so.
 *
 * ACCEPTED FALSE NEGATIVES, the `use-truncate` move: a target spelled
 * differently the second time, a multi-argument `expect`, `expect.soft`, and a
 * deliberate re-assert with a long timeout waiting for a state to RETURN. None
 * of the last exists in the tree today, and an inline disable stating the
 * invariant is the repo's standing escape hatch if one ever does.
 */

/** Playwright actions that land no state of their own to wait on. */
const RAW_INTERACTIONS = new Set([
  "blur",
  "check",
  "click",
  "dblclick",
  "fill",
  "focus",
  "hover",
  "insertText",
  "press",
  "selectOption",
  "setInputFiles",
  "tap",
  "type",
  "uncheck",
]);

type TextOf = (node: ESTree.Node) => string;

interface Assertion {
  /** Source text of `expect`'s single argument. */
  target: string;
  /** Matcher name plus its arguments' source text. */
  claim: string;
}

/** The `await <call>(…)` of a statement, if that is all the statement is. */
function awaitedCall(statement: ESTree.Statement): ESTree.CallExpression | undefined {
  if (statement.type !== "ExpressionStatement") {
    return undefined;
  }
  const expression = statement.expression;
  if (expression.type !== "AwaitExpression" || expression.argument.type !== "CallExpression") {
    return undefined;
  }
  return expression.argument;
}

/** The property of `await <object>.<name>(…)`, non-computed only. */
function awaitedMethodName(statement: ESTree.Statement): string | undefined {
  const callee = awaitedCall(statement)?.callee;
  if (
    callee === undefined ||
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier"
  ) {
    return undefined;
  }
  return callee.property.name;
}

/**
 * `await expect(<target>).to<Matcher>(…)` — the `expect` call itself, so
 * `expect(x).not.toBeVisible()` and `expect.soft(x).toBeVisible()` are both out.
 */
function assertionOf(statement: ESTree.Statement, textOf: TextOf): Assertion | undefined {
  const call = awaitedCall(statement);
  if (call === undefined) {
    return undefined;
  }
  const callee = call.callee;
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier" ||
    !callee.property.name.startsWith("to")
  ) {
    return undefined;
  }
  const expectCall = callee.object;
  if (
    expectCall.type !== "CallExpression" ||
    expectCall.callee.type !== "Identifier" ||
    expectCall.callee.name !== "expect" ||
    expectCall.arguments.length !== 1
  ) {
    return undefined;
  }
  const [target] = expectCall.arguments;
  if (target === undefined || target.type === "SpreadElement") {
    return undefined;
  }
  return {
    target: textOf(target),
    claim: [callee.property.name, ...call.arguments.map(textOf)].join("|"),
  };
}

export default defineRule({
  meta: {
    type: "problem",
    messages: {
      unsynchronisedReassert:
        "This re-asserts a claim that was already true before the interaction above it, so it resolves on its first poll against the pre-interaction page and cannot fail for the reason it names. Assert what the interaction ITSELF produces first — the focus it moves, the count it drops to zero, the content it swaps in — and re-assert this after that landing. If it really is a wait for the state to COME BACK, say so with a timeout and an `// oxlint-disable-next-line rcd/no-unsynchronised-reassert -- <why>`.",
    },
  },
  createOnce(context) {
    return {
      BlockStatement(node) {
        // `context.sourceCode` is only readable inside the visitor: reading it
        // in the `createOnce` prologue throws (oxlint 1.80.0).
        const textOf: TextOf = (target) => context.sourceCode.getText(target);
        /** The standing claim per target, cleared by anything that synchronises. */
        const last = new Map<string, string>();
        let sawRawAction = false;
        for (const statement of node.body) {
          const assertion = assertionOf(statement, textOf);
          if (assertion !== undefined) {
            if (sawRawAction && last.get(assertion.target) === assertion.claim) {
              context.report({ node: statement, messageId: "unsynchronisedReassert" });
            }
            last.set(assertion.target, assertion.claim);
            sawRawAction = false;
            continue;
          }
          const method = awaitedMethodName(statement);
          if (method !== undefined && RAW_INTERACTIONS.has(method)) {
            sawRawAction = true;
            continue;
          }
          last.clear();
          sawRawAction = false;
        }
      },
    };
  },
});
