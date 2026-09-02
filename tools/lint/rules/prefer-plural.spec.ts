import { ruleTester } from "../rule-tester.ts";
import rule from "./prefer-plural.ts";

// JSX cases carry a `.tsx` filename — the tester infers the language from it,
// and the shared tester is configured for plain `ts`.
const tsx = "Case.tsx";

ruleTester.run("prefer-plural", rule, {
  valid: [
    // already the helper
    'const line = plural(totalCount, "rule");',
    { code: 'const el = <p>{plural(rules.length, "rule")}</p>;', filename: tsx },
    // ---- `pluralWord` with no count beside it at all: `SummaryHeader`'s stat
    // tiles print the figure in a separate field of the same object.
    'const label = pluralWord(summary.rules, "rule");',
    'const label = `${pluralWord(summary.options, "option")} set`;',
    // `ShowAllMore`: the word is a fragment of a sentence assembled elsewhere.
    'const what = noun ? ` ${pluralWord(hidden, noun)}` : "";',

    // ---- chrome `plural` cannot produce: the number is its own element, so
    // the previous rendered child is a `JSXElement`, not a container.
    {
      code: 'const el = <>base → <span className="stat">{mergeCount}</span> {pluralWord(mergeCount, "merge")}</>;',
      filename: tsx,
    },
    {
      code: 'const el = <span><strong>{nf.format(presets)}</strong>{" "}{pluralWord(presets, "preset")}</span>;',
      filename: tsx,
    },

    // ---- the accepted FALSE NEGATIVE, `OriginFraming`: adjacency holds, but
    // the previous expression reads `nf.format(total)` and the argument reads
    // `total`, so textual identity fails. The price of the zero-FP count.
    {
      code: 'const el = <p>expands to {nf.format(total)}{" "}{pluralWord(total, "preset")}.</p>;',
      filename: tsx,
    },
    // same shape once the count has been named: the texts no longer match.
    'const n = rules.length; const line = `${n} ${pluralWord(rules.length, "rule")}`;',
    // a different count entirely
    'const line = `${shown} ${pluralWord(total, "rule")}`;',

    // ---- a word BETWEEN the count and the noun: not a sentence `plural` can
    // express. `pin-outcome`, `verdict-sentence`, `PresetLedger`, `LedgerOptions`.
    'const more = `${hidden} more ${pluralWord(hidden, "field group")}`;',
    'const note = `${count} of your ${pluralWord(count, "rule")} failed only because a field was unset.`;',
    {
      code: 'const el = <p>also set by {nf.format(option.alsoSetBy)} earlier {pluralWord(option.alsoSetBy, "preset")}</p>;',
      filename: tsx,
    },
    // a separator that is not a single space is not `plural`'s output either
    'const line = `${count}\\n${pluralWord(count, "rule")}`;',
    // ---- the JSX half of that: a whitespace-only run WITH a newline renders
    // nothing, so this pair renders "5rules" and `plural` would render
    // "5 rules". Advice that changes the output is not advice this rule gives.
    {
      code: 'const el = <p>\n  {count}\n  {pluralWord(count, "rule")}\n</p>;',
      filename: tsx,
    },
    // and with no separator at all, same rendering, same reason to stay quiet
    {
      code: 'const el = <p>{count}{pluralWord(count, "rule")}</p>;',
      filename: tsx,
    },
    // two rendered spaces is not `plural`'s output either
    {
      code: 'const el = <p>{count} {" "}{pluralWord(count, "rule")}</p>;',
      filename: tsx,
    },
    'const line = `${count} — ${pluralWord(count, "rule")}`;',
    // the count trails the noun
    'const line = `${pluralWord(count, "rule")} ${count}`;',
    // the engine's parallel helper is a different home and out of scope here
    'const line = `${count} ${countNoun(count, "rule")}`;',
    // a same-named call of a different arity is not this helper
    'const line = `${count} ${pluralWord(count, "rule", locale)}`;',
  ],
  invalid: [
    // ---- THE ORIGINAL. 27b81f43 swept `SimRulesBody`'s ad-hoc
    // `rule{plural}` onto `pluralWord` and left the count beside it raw.
    {
      code: 'const el = <span className="sim-filter-count">{shownCount} of {totalCount} {pluralWord(totalCount, "rule")} shown</span>;',
      filename: tsx,
      errors: [{ messageId: "preferPlural" }],
    },
    // the same sweep, in a template literal (`App.tsx`'s re-run toast)
    {
      code: 'showToast(`Fix applied — re-ran: ${n === 0 ? "0 errors" : `${n} ${pluralWord(n, "error")}`}`);',
      errors: [{ messageId: "preferPlural" }],
    },
    // `App.tsx`'s two summary chips, both pairs on one expression
    {
      code: 'const parts = [errorCount === 0 ? null : `${errorCount} ${pluralWord(errorCount, "error")}`, warningCount === 0 ? null : `${warningCount} ${pluralWord(warningCount, "warning")}`];',
      errors: [{ messageId: "preferPlural" }, { messageId: "preferPlural" }],
    },
    // a member expression as the count (`value-preview`), inside surrounding text
    {
      code: 'const out = value.length ? `[ ${value.length} ${pluralWord(value.length, "item")} ]` : "[]";',
      errors: [{ messageId: "preferPlural" }],
    },
    // `pin-outcome`: the pair opens a sentence that continues past it
    {
      code: 'const note = `${count} ${pluralWord(count, "rule")} — ${first ? failingClauseNote(first) : ""}`;',
      errors: [{ messageId: "preferPlural" }],
    },
    // `CascadeStack`: the pair is parenthesised chrome, the separator a
    // whitespace-only `JSXText`
    {
      code: 'const el = <div className="prov-rules-title">Per-rule provenance ({rules.length} {pluralWord(rules.length, "rule")})</div>;',
      filename: tsx,
      errors: [{ messageId: "preferPlural" }],
    },
    // `PresetDetail`: the separator is the `{" "}` the formatter leaves behind
    // when the line wraps — dropping it is what makes this reachable.
    {
      code: 'const el = <div>Step through the {migrationSteps.length}{" "}{pluralWord(migrationSteps.length, "migration")}</div>;',
      filename: tsx,
      errors: [{ messageId: "preferPlural" }],
    },
    // the same site as the formatter actually wrote it: the `{" "}` and the
    // call are on different lines, so a newline-only run sits between them —
    // it renders nothing, and dropping it is what keeps this reachable.
    {
      code: 'const el = <div>\n  Step through the {migrationSteps.length}{" "}\n  {pluralWord(migrationSteps.length, "migration")}\n</div>;',
      filename: tsx,
      errors: [{ messageId: "preferPlural" }],
    },
    // `RuleEvidenceCard`: mid-sentence, with a `{" "}` AFTER the pair
    {
      code: 'const el = <p>merged in {evidence.stopLabel} — {writes.length} {pluralWord(writes.length, "write")},{" "}{survivedCount} survived</p>;',
      filename: tsx,
      errors: [{ messageId: "preferPlural" }],
    },
    // `TreeRow`: a member-expression count inside a badge
    {
      code: 'const el = <ExplainedText className="badge">· {stats.ownRules} {pluralWord(stats.ownRules, "rule")}</ExplainedText>;',
      filename: tsx,
      errors: [{ messageId: "preferPlural" }],
    },
    // `SimVerdictBlock`: two pairs, one per button
    {
      code: 'const el = <span>{matchedCount} of {totalRules} {pluralWord(totalRules, "rule")} matched, {replayStops} {pluralWord(replayStops, "stop")}</span>;',
      filename: tsx,
      errors: [{ messageId: "preferPlural" }, { messageId: "preferPlural" }],
    },
    // the pair as the direct children of a fragment
    {
      code: 'const el = <>{count} {pluralWord(count, "rule")}</>;',
      filename: tsx,
      errors: [{ messageId: "preferPlural" }],
    },
  ],
});
