import { defineRule, type ESTree } from "@oxlint/plugins";

/**
 * Arm (a). The home is `plural(n, word)` in `packages/app/src/lib/format.ts`,
 * whose own docblock states the charter: "the count is ALWAYS formatted through
 * `nf`; that is the whole reason this is shared".
 *
 * The defect shipped. `JsonDiff`'s footer read `Showing the first
 * {MAX_RENDERED_LINES} of {stat.total} diff lines` — both counts interpolated
 * raw, so a four-figure diff rendered "1234" where the rest of the UI rendered
 * "1,234" (sweep finding 27, fixed in 7619e7bb by routing both through `nf`).
 * The hand-spelled `{n} {pluralWord(n, word)}` pair is that same divergence
 * with a helper in it: `pluralWord` returns the WORD only, so the count beside
 * it is still raw. 27b81f43 swept the ad-hoc `rule{s}` spellings onto the two
 * helpers and left seventeen of these pairs behind — each trivially correct on
 * its own, which is exactly why review never caught them, and every one of them
 * in a module that already imports from `@/lib/format`, so the fix is a name
 * added to an import that is already there (`CascadeStack` had `plural` on that
 * line already).
 *
 * WHY THE SHAPE IS THIS NARROW. `plural` prints "<nf count> <word>" and nothing
 * else, so the rule fires only where that exact string is what the site builds:
 * the count must be the IMMEDIATELY PRECEDING sibling expression, and its
 * source text must be identical to the argument `pluralWord` is handed. Three
 * things fall out of that, all deliberate:
 *
 *   - Chrome the helper cannot produce stays silent. `<strong>{nf.format(p)}
 *     </strong>{" "}{pluralWord(p, "preset")}` puts the number in its own
 *     element, so the previous rendered child is an element, not a container.
 *   - A sentence with a word between — `${hidden} more ${pluralWord(hidden, …)}`,
 *     `${count} of your ${pluralWord(count, …)}` — is not a shape `plural` can
 *     express at all, and the adjacency requirement is what leaves it alone.
 *   - Textual identity is what makes this safe with no type information, and it
 *     costs a false negative: `{nf.format(total)}{" "}{pluralWord(total, …)}` is
 *     a real hit the rule does not report, because the preceding expression
 *     reads `nf.format(total)` and the argument reads `total`. That is the
 *     price of a zero false-positive count, and it is worth paying.
 *
 * THE SEPARATOR IS CHECKED, NOT SKIPPED, and the two whitespace spellings are
 * not interchangeable. JSX renders a whitespace-only `JSXText` run that
 * contains a NEWLINE as nothing at all, so `<p>{n}\n{pluralWord(n, "rule")}</p>`
 * renders "5rules" and `plural` would render "5 rules" — reporting it would be
 * advice that changes the output. A run with no newline, and the `{" "}` the
 * formatter leaves in its place whenever the line wraps, both render one space,
 * which is exactly what `plural` prints between the count and the word. So the
 * rule drops the newline runs (they render nothing, and one sits between the
 * `{" "}` and the call in two of the seventeen sites) and REQUIRES what is left
 * between the two containers to be a single rendered space.
 *
 * Those two spellings are all the rule sees. A count assembled any other way —
 * split across an attribute boundary, or routed through a variable so the two
 * texts no longer match — is out of shape and deliberately not guessed at: the
 * `use-truncate` move, match the one spelling that is unambiguous rather than
 * widen and be wrong.
 *
 * SWEEP IV WIDENS IT TO THE HAND-SPELLED TERNARY, which is where this class
 * actually reached users. `hiddenRulesNote` pluralised its noun on the HIDDEN
 * count and printed "1 of 2 rule hidden" (finding 62); 34421b97 corrected the
 * operand and left the spelling standing, so the same divergence is one careless
 * edit away in five more places across two packages. Both helpers take ONE
 * argument that feeds the count and the noun together, so routing through them
 * does not merely fix the sites — it makes the divergence unspellable.
 *
 * WHY `singular + "s"` IS THE WHOLE NARROWING. `plural` and `pluralWord` append
 * a bare "s" and can express nothing else, so the equality is a correctness
 * device as much as a precision one: anything they cannot spell is structurally
 * out. Of the 31 `=== 1 ? … : …` ternaries in the tree, 8 match, and each of the
 * 23 that do not fails for a stated reason rather than a heuristic — irregulars
 * (`dependency`/`dependencies`, `entry`/`entries`), stem splices (`y`/`ies`),
 * agreement rather than number (`it`/`them`, `is`/`are`, `" was"`/`"s were"`),
 * multi-word phrases (`rule matches`/`rules match`, `only`/`all of them only`),
 * and the ternaries that count nothing at all (a sort direction picking `" ▲"`
 * or `" ▼"`, a comparator returning `-1` or `1`).
 *
 * REQUIRING BOTH BRANCHES TO BE STRING LITERALS is the other half of it, and it
 * pays for two exemptions that would otherwise be needed: `pluralWord`'s own
 * body returns an identifier on one arm, and the CLI's group tally opposes a
 * `"1 update"` literal to a template. Neither is in shape, so neither needs a
 * line in the config.
 *
 * TWO MESSAGE IDS, because the correction differs. An empty singular is the
 * `word + suffix` spelling, and its fix is `plural(n, word)` — which also
 * absorbs the raw count interpolated just before the noun, the same divergence
 * the JSX arm above guards. Any other singular is a noun pair, whose fix is
 * `pluralWord(n, singular)`, or `plural` where the count already prints beside
 * it. The import differs per package and the messages say so: `@/lib/format` in
 * the app, `@renovate-config-debugger/app/headless` in the CLI, which re-exports
 * both from that same file.
 *
 * SWEEP V WIDENS IT ONCE MORE, to the noun that is hard-spelled beside a
 * `nf.format(n)` with no ternary at all — the same divergence with the
 * conditional deleted, so a count of one renders "1 rules". It reached users
 * three times in one commit's findings (PinsView's "1 rules evaluated per
 * test", TreeRow's "· 1 presets", OriginFraming's collapsed sentence, all
 * fixed in 2613e96e onto `plural`), and it is invisible in review because every
 * copy is correct at the counts a reviewer pictures.
 *
 * `nf` IS THE SUBJECT because there is exactly one of it: a single shared
 * `Intl.NumberFormat` exported from `packages/app/src/lib/format.ts` and
 * imported under that name in both packages, so matching the callee's source
 * text needs no type information and cannot mean anything else.
 *
 * THREE NARROWINGS, each measured over all 53 `nf.format(` sites in the tree,
 * of which exactly five are followed by a lowercase word ending in "s":
 *
 *   - ALL-LOWERCASE. A camelCase token after the count is a quoted Renovate
 *     config key, not English prose, and this is what structurally excludes the
 *     one false positive in the tree — `LedgerFamilies`' `{nf.format(totalRules)}
 *     packageRules`, where `plural(n, "packageRule")` would rename the key to
 *     make the sentence agree.
 *   - FOUR CHARACTERS OR MORE, and never ending "ss", "us", "is" or "ies" —
 *     across, less, status, focus, analysis, basis; dependencies, properties,
 *     entries. The first three are singulars that merely end in "s"; the "-ies"
 *     class is the likeliest plural in this tree and `plural` cannot spell it at
 *     all (`plural(n, "dependencie")` is not advice), which is precisely why
 *     `countNoun`/`DataTableNoun` exists and why the message names it. None is
 *     live today and the four real hits end "ps", "rs", "ns", "es".
 *   - FIRST AFTER EXACTLY ONE RENDERED SPACE, the adjacency requirement the arms
 *     above already impose: a sentence with a word between (`} of `, `} more `,
 *     `} matched`) is not a shape `plural` can express, and it is why the other
 *     48 sites are out of shape. RENDERED is the load-bearing word — an oxfmt
 *     wrap rewrites the separator as `{" "}` without changing a pixel of the
 *     output, and four such shapes are live here, so the arm reads that spelling
 *     too rather than falling silent on a line-width accident. An ELEMENT
 *     between (`<strong>{nf.format(n)}</strong> rules`) is the one adjacency
 *     escape left, and it stays silent for the arm above's reason: the count is
 *     in its own element, which is chrome `plural` cannot produce.
 *
 * NEITHER HOME SELF-REPORTS, so this arm needs no exemption of its own:
 * `plural`'s body and `countNoun`'s both put an EXPRESSION after the space, not
 * a word.
 */

const HELPER = "pluralWord";

type TextOf = (node: ESTree.Node) => string;

/** `pluralWord(<count>, <word>)` — the hand-spelled half, two arguments exactly. */
function pluralWordCall(node: ESTree.JSXExpression): ESTree.CallExpression | undefined {
  if (node.type !== "CallExpression") {
    return undefined;
  }
  const callee = node.callee;
  if (callee.type !== "Identifier" || callee.name !== HELPER || node.arguments.length !== 2) {
    return undefined;
  }
  return node;
}

/** The single rendered space `plural` itself prints, either spelling of it. */
const SPACE = "space";
type Rendered = ESTree.JSXChild | typeof SPACE;

/** `{" "}` — a container holding one space and nothing else. */
function isSpaceString(node: ESTree.JSXExpression): boolean {
  return node.type === "Literal" && node.value === " ";
}

/** A whitespace-only `JSXText` run holding a newline renders NOTHING — JSX
 *  strips it — so it is not a sibling, and it is what sits between a wrapped
 *  `{" "}` and the call on the next line. */
function isStripped(child: ESTree.JSXChild): boolean {
  return child.type === "JSXText" && child.value.trim() === "" && child.value.includes("\n");
}

/** One rendered space, spelled as `JSXText` or as the wrapped `{" "}`. */
function isSingleSpace(child: ESTree.JSXChild): boolean {
  if (child.type === "JSXText") {
    return child.value === " ";
  }
  return child.type === "JSXExpressionContainer" && isSpaceString(child.expression);
}

/** What the children render, with each one-space separator collapsed to `SPACE`
 *  — a newline-only run renders nothing and is dropped; anything else stays a
 *  sibling, so it breaks the adjacency the rule requires. */
function renderedChildren(children: readonly ESTree.JSXChild[]): Rendered[] {
  const rendered: Rendered[] = [];
  for (const child of children) {
    if (isStripped(child)) {
      continue;
    }
    rendered.push(isSingleSpace(child) ? SPACE : child);
  }
  return rendered;
}

/** The one shared `Intl.NumberFormat`, matched by source text — there is a
 *  single declaration of `nf` in the tree and every importer keeps the name. */
const COUNT_CALLEE = "nf.format";

/** `nf.format(<count>)` — the formatted count, one argument exactly. */
function countCall(
  node: ESTree.JSXExpression | ESTree.Expression,
  textOf: TextOf,
): ESTree.CallExpression | undefined {
  if (node.type !== "CallExpression" || node.arguments.length !== 1) {
    return undefined;
  }
  return textOf(node.callee) === COUNT_CALLEE ? node : undefined;
}

/** One space, then a word `plural` could have spelled: all-lowercase, four
 *  characters or more, ending in a bare "s", and nothing before it. */
const PLURAL_NOUN = /^ ([a-z]{3,}s)\b/;

/** The same noun after a wrapped `{" "}`, which IS the space: the word opens the
 *  text run, behind at most the newline-indent JSX strips to nothing. Any other
 *  leading whitespace would render a second space, which `plural` never prints. */
const WRAPPED_PLURAL_NOUN = /^(?:[^\S\n]*\n\s*)?([a-z]{3,}s)\b/;

/** Words `plural` cannot spell from a singular: the ones that merely END in "s"
 *  (it would write "acrosss") and the "-ies" stem splice, whose singular is not
 *  the word minus its "s" — `dependencies`, `properties`, `entries`. That class
 *  is what `countNoun` exists for, so guessing it here would be wrong advice. */
const NOT_A_PLURAL = /(?:ss|us|is|ies)$/;

/** The singular of the hard-spelled plural that opens `text`, if it is one. */
function hardSpelledPlural(text: string, pattern: RegExp): string | undefined {
  const word = pattern.exec(text)?.[1];
  if (word === undefined || NOT_A_PLURAL.test(word)) {
    return undefined;
  }
  return word.slice(0, -1);
}

/** The `1` in `n === 1` / `1 === n`. */
function isOne(node: ESTree.Node): boolean {
  return node.type === "Literal" && node.value === 1;
}

function stringValue(node: ESTree.Node): string | undefined {
  return node.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

/** `<count> === 1` / `<count> !== 1`, either operand order. The count operand
 *  itself is never inspected — which side is the count is all the rule needs. */
function oneComparison(test: ESTree.Expression): "===" | "!==" | undefined {
  if (test.type !== "BinaryExpression") {
    return undefined;
  }
  if (test.operator !== "===" && test.operator !== "!==") {
    return undefined;
  }
  return isOne(test.left) || isOne(test.right) ? test.operator : undefined;
}

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      preferPlural:
        "Use `plural(n, word)` from `@/lib/format` instead of writing the count next to `pluralWord(n, word)` — `plural` runs the count through the shared `nf` and this pair interpolates it raw, so the two spellings diverge the moment the number reaches four figures.",
      preferPluralWord:
        'Use `pluralWord(n, "{{word}}")` — or `plural(n, "{{word}}")` where the count prints right beside the noun — from `@/lib/format` (`@renovate-config-debugger/app/headless` in the CLI) instead of hand-spelling the regular plural in a ternary: one argument feeds both the count and the word, so they cannot disagree the way `1 of 2 rule hidden` did.',
      preferPluralNoun:
        'Use `plural(n, "{{word}}")` from `@/lib/format` (`@renovate-config-debugger/app/headless` in the CLI) — or `countNoun(n, noun)` from `@/components/data-table` when the plural is irregular, which is app-only — instead of hard-spelling a plural noun beside `nf.format(n)`: one argument feeds the count and the noun together, so a count of one cannot render "1 {{word}}s".',
      preferPluralSuffix:
        'Use `plural(n, word)` from `@/lib/format` (`@renovate-config-debugger/app/headless` in the CLI) instead of appending a hand-spelled "s" from a ternary — `plural` prints the count and the noun from one argument, and runs the count through the shared `nf` rather than interpolating it raw.',
    },
  },
  createOnce(context) {
    // Read lazily: oxlint throws on `context.sourceCode` touched in the
    // `createOnce` prologue, so the access has to happen inside a visitor.
    const textOf: TextOf = (node) => context.sourceCode.getText(node);

    // `{count} {pluralWord(count, word)}` — two JSX children with exactly the
    // one space between them that `plural` prints itself.
    const checkChildren = (children: readonly ESTree.JSXChild[]): void => {
      const kids = renderedChildren(children);
      for (const [index, child] of kids.entries()) {
        if (child === SPACE || child.type !== "JSXExpressionContainer") {
          continue;
        }
        const call = pluralWordCall(child.expression);
        const count = call?.arguments[0];
        const previous = kids[index - 2];
        if (call === undefined || count === undefined || kids[index - 1] !== SPACE) {
          continue;
        }
        if (
          previous !== undefined &&
          previous !== SPACE &&
          previous.type === "JSXExpressionContainer" &&
          textOf(previous.expression) === textOf(count)
        ) {
          context.report({ node: call, messageId: "preferPlural" });
        }
      }
    };

    // `{nf.format(n)} rules` — the noun opens the count's next rendered text,
    // either behind the space that is part of that text or behind the `{" "}`
    // the formatter leaves in its place when the line wraps. Both render the one
    // space `plural` prints, so both are the same site.
    const checkCountedNouns = (children: readonly ESTree.JSXChild[]): void => {
      const kids = renderedChildren(children);
      for (const [index, child] of kids.entries()) {
        if (child === SPACE || child.type !== "JSXExpressionContainer") {
          continue;
        }
        const call = countCall(child.expression, textOf);
        const wrapped = kids[index + 1] === SPACE;
        const next = kids[index + (wrapped ? 2 : 1)];
        if (call === undefined || next === undefined || next === SPACE) {
          continue;
        }
        const word =
          next.type === "JSXText"
            ? hardSpelledPlural(next.value, wrapped ? WRAPPED_PLURAL_NOUN : PLURAL_NOUN)
            : undefined;
        if (word !== undefined) {
          context.report({ node: call, messageId: "preferPluralNoun", data: { word } });
        }
      }
    };

    return {
      JSXElement(node) {
        checkChildren(node.children);
        checkCountedNouns(node.children);
      },
      JSXFragment(node) {
        checkChildren(node.children);
        checkCountedNouns(node.children);
      },
      // `n === 1 ? "rule" : "rules"` — a regular plural spelled out by hand.
      // Reported only when the two branches differ by exactly a trailing "s",
      // which is the only difference the helpers can express.
      ConditionalExpression(node) {
        const operator = oneComparison(node.test);
        const consequent = stringValue(node.consequent);
        const alternate = stringValue(node.alternate);
        if (operator === undefined || consequent === undefined || alternate === undefined) {
          return;
        }
        const singular = operator === "===" ? consequent : alternate;
        const pluralised = operator === "===" ? alternate : consequent;
        if (pluralised !== `${singular}s`) {
          return;
        }
        context.report({
          node,
          messageId: singular === "" ? "preferPluralSuffix" : "preferPluralWord",
          data: { word: singular },
        });
      },
      // `` `${count} ${pluralWord(count, word)}` `` — the quasi BETWEEN the two
      // expressions is the whole separator, so it must be exactly one space.
      TemplateLiteral(node) {
        for (const [index, expression] of node.expressions.entries()) {
          const call = pluralWordCall(expression);
          const count = call?.arguments[0];
          const previous = node.expressions[index - 1];
          if (call === undefined || count === undefined || previous === undefined) {
            continue;
          }
          if (node.quasis[index]?.value.raw === " " && textOf(previous) === textOf(count)) {
            context.report({ node: call, messageId: "preferPlural" });
          }
        }
        // `` `${nf.format(n)} rules` `` — the quasi that FOLLOWS the count is
        // the one that would open with the hard-spelled noun.
        for (const [index, expression] of node.expressions.entries()) {
          const call = countCall(expression, textOf);
          const following = node.quasis[index + 1];
          if (call === undefined || following === undefined) {
            continue;
          }
          const word = hardSpelledPlural(following.value.raw, PLURAL_NOUN);
          if (word !== undefined) {
            context.report({ node: call, messageId: "preferPluralNoun", data: { word } });
          }
        }
      },
    };
  },
});
