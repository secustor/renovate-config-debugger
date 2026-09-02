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

    // ---- Sweep IV: the hand-spelled ternary arm -----------------------------
    // IRREGULARS. Both helpers append a bare "s", so a plural they cannot
    // produce is structurally out rather than heuristically skipped.
    'const s = `${nf.format(n)} ${n === 1 ? "dependency" : "dependencies"}`;',
    'const s = entries.length === 1 ? "entry" : "entries";',
    // a stem splice — the ternary swaps a suffix mid-word
    'const more = `${hidden} more famil${hidden === 1 ? "y" : "ies"}, sorted by rule count`;',
    // AGREEMENT rather than number: the noun being counted is elsewhere.
    'const them = count === 1 ? "it" : "them";',
    'const verb = count === 1 ? "is" : "are";',
    'const clause = `block${blockKeys.length === 1 ? " was" : "s were"} consumed`;',
    'const verb = refused.length === 1 ? "would be" : "would both be";',
    // MULTI-WORD phrases: a whole clause, not a noun plus "s".
    'const s = total === 1 ? "rule matches" : "rules match";',
    'const which = setters === 1 ? "only" : "all of them only";',
    'const s = ruleCount === 1 ? "this rule" : "these rules";',
    // NOT A COUNT at all — a sort direction, a comparator, a retry attempt.
    'const arrow = sortColumn === key ? (sortDir === 1 ? " \u25b2" : " \u25bc") : "";',
    "setSortDir((d) => (d === 1 ? -1 : 1));",
    'const chunk = attempt === 1 ? Promise.reject(new Error("chunk 404")) : {};',

    // ---- BOTH BRANCHES MUST BE STRING LITERALS. This is what keeps
    // `pluralWord`'s own body and the CLI's group tally quiet with no
    // exemption in the config — neither is in shape.
    "export function pluralWord(n: number, word: string) { return n === 1 ? word : `${word}s`; }",
    'const updates = view.size === 1 ? "1 update" : `${view.size} updates`;',
    // `components/data-table.ts` names its two forms on an object instead
    "const s = `${nf.format(n)} ${n === 1 ? noun.one : noun.many}`;",

    // ---- the test itself has to be an equality against 1
    'const s = n === 2 ? "rule" : "rules";',
    'const s = n > 1 ? "rules" : "rule";',
    'const s = n == 1 ? "rule" : "rules";',
    // ---- and the "s" has to be exactly what separates the two branches
    // case-sensitive: "Rule" + "s" is "Rules", not "rules"
    'const s = n === 1 ? "Rule" : "rules";',
    // the branches the wrong way round is not a spelling either helper produces
    'const s = n === 1 ? "rules" : "rule";',
    // a suffix neither helper can append
    'const s = n === 1 ? "" : "es";',
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

    // ---- THE ORIGINAL, and the only defect in this file's evidence that
    // reached users: `hiddenRulesNote` before 34421b97 pluralised its noun on
    // the HIDDEN count, printing "1 of 2 rule hidden".
    // The `{{word}}` slot makes the message quote the fix (`pluralWord(n,
    // "rule")`) rather than a placeholder, so it is pinned here.
    {
      code: 'const noun = view.hidden === 1 ? "rule" : "rules";',
      errors: [{ messageId: "preferPluralWord", data: { word: "rule" } }],
    },
    // 34421b97 corrected the operand and left the spelling — this is what was
    // still standing at `rule-view.ts:218`, one careless edit from the same bug.
    {
      code: 'const noun = view.total === 1 ? "rule" : "rules";',
      errors: [{ messageId: "preferPluralWord" }],
    },
    // `commands/compare.ts`
    {
      code: 'const noun = counts.signatureChanges === 1 ? "rule" : "rules";',
      errors: [{ messageId: "preferPluralWord" }],
    },
    // `features/overview/description-digest.ts`, whose sentence interpolates
    // `nf.format(count)` right beside the noun — the `plural` shape exactly
    {
      code: 'const members = count === 1 ? "member" : "members";',
      errors: [{ messageId: "preferPluralWord" }],
    },
    // `lib/run-digest.ts`
    {
      code: 'const label = `${list(names)} config ${names.length === 1 ? "layer" : "layers"}`;',
      errors: [{ messageId: "preferPluralWord" }],
    },

    // ---- the suffix spelling. `projections/group.ts` hand-spells this
    // eighteen lines above the same file's correct `plural(gapCount, "update")`,
    // with the import already on the line.
    {
      code: 'const note = `${name}: ${count} rule${count === 1 ? "" : "s"} could not match`;',
      errors: [{ messageId: "preferPluralSuffix" }],
    },
    // `projections/provenance.ts`
    {
      code: 'const note = `${setters} packageRule${setters === 1 ? "" : "s"} can set the key`;',
      errors: [{ messageId: "preferPluralSuffix" }],
    },
    // `lib/format.ts:19` — `plural`'s OWN body, which is in shape and is why
    // the home needs a file override in `.oxlintrc.json`.
    {
      code: 'const out = `${nf.format(n)} ${word}${n === 1 ? "" : "s"}`;',
      errors: [{ messageId: "preferPluralSuffix" }],
    },

    // ---- operand order and operator are both handled: the count is never
    // inspected, so which side it sits on does not matter.
    {
      code: 'const noun = 1 === n ? "rule" : "rules";',
      errors: [{ messageId: "preferPluralWord" }],
    },
    {
      code: 'const noun = n !== 1 ? "rules" : "rule";',
      errors: [{ messageId: "preferPluralWord" }],
    },
    {
      code: 'const suffix = 1 !== n ? "s" : "";',
      errors: [{ messageId: "preferPluralSuffix" }],
    },
    // two hand-spellings on one expression
    {
      code: 'const parts = [`${a} error${a === 1 ? "" : "s"}`, `${b} warning${b === 1 ? "" : "s"}`];',
      errors: [{ messageId: "preferPluralSuffix" }, { messageId: "preferPluralSuffix" }],
    },
  ],
});
