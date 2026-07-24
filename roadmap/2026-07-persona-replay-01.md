# 2026-07 persona study replay #1

First full replay of the [2026-07 persona UX study](2026-07-persona-ux-study.md)
via the [persona-test skill](../.claude/skills/persona-test/SKILL.md) (roadmap
019), run 2026-07-24 against main at the completed M5/M6 state (all of 012–020
merged). Method identical to the baseline: 3 scenarios × 3 personas
(entry/advanced/expert) = 9 serial browser sessions against the production
build (`vite preview`), fresh share link per session, ~30-action budgets,
ground truth withheld.

## Headline

**All 9 personas reached a correct or mechanism-correct diagnosis**, and the
single most direct regression check passed: the expert goal the baseline
could not complete — render "minor ⇒ automerge true" as a first-class verdict
(Finding 1 / roadmap 012) — now completes with the tool alone at 95%
confidence. The expert called the 44006 evidence chain "airtight" and
citable.

## Outcomes

### 44772 — `monorepo:react` not blocking react

| Persona  | vs ground truth                                                                                                                    | Confidence |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Entry    | Partial — proved the rule matches only on source URL; couldn't name why the real-world URL differs                                 | 75%        |
| Advanced | Partial-correct — mechanism proven both directions; shipped + verified a name-based fix                                            | 90–95%     |
| Expert   | Correct on mechanism and remedy (upstream preset staleness, AND-semantics shown on screen); antecedent inferred from own knowledge | 95%        |

No persona could name the actual current `sourceUrl` — the simulator is
purely hypothetical (registry lookup is 015's explicit out-of-scope). All
three flagged that the `sourceUrl` placeholder (`https://github.com/facebook/react`)
nudges users toward simulating the world in which the bug doesn't exist.

### 43936 — `["*","!gradle"]` validator rejection

All three **correct**. The 014 translation + Apply fix + 018 pin/compare
turned the baseline advanced persona's ~10-minute manual equivalence proof
into a built-in "No behavioral change" verdict. Entry 95%, advanced 92–98%,
expert 90–100% (all goals completed with the tool alone).

### 44006 — `:automergeMinor` half-applying

All three **correct at ~95%**. Entry explained rule-level vs type-scoped
settings unaided; advanced and expert both produced the direct A/B contrast
(same 4 rules matched, final-config delta exactly `automerge false → true`,
annotated "update-type flattening merged the `minor` block").

## Baseline findings status

- **Resolved**: F1 update-type flattening, F2 verdict buried under no-match
  rows, F4 raw validator messages, F8 evidence export (copy-as-markdown,
  pin/compare and the version badge were all used in anger).
- **Improved**: F3 rule identity (the `repo [0] = merged [712]` annotation
  was cited approvingly by advanced/expert; entry found it cryptic and its
  click a no-op), F5 input ergonomics (promoted sourceUrl + derived
  updateType praised), F6 scale framing (personas quoted the framing
  phrasing back verbatim; the 10k-line Presets diff still buries mid-page
  content for entry users).
- **Not exercised**: F7 hashchange (fresh tabs by design; covered by the 020
  e2e suite instead).

## New findings (not in the baseline), ranked

1. **Simulator inputs append instead of replace** — three independent
   sessions produced "reactreact" / "reactgradle" / "lodashgradle" after a
   quick-fill or pipeline re-run left unselected text in the field.
2. **Post-action landing position** — Apply fix jumps to the Presets diff
   instead of showing "0 errors" on Validate; pipeline re-runs reset scroll.
3. **A wrong sentence in the 43936 translation** — "the other patterns
   already covered every case `*` did" is false for a negation-only array;
   the equivalence holds because negative-only arrays imply
   match-all-except. Expert would not cite it as written.
4. **A/B compare doesn't snapshot inputs** — it silently compared a gradle
   run against a lodash pin; no differing-inputs warning.
5. **"failed on matchSourceUrls" vs "skipped — no sourceUrl set" wording
   tension** — the fail-closed `false` reads as "not evaluated"; expert
   wants "evaluated false: dependency has no sourceUrl".
6. **Simulation runs on a config with a fatal validation error** with no
   "real Renovate would refuse this config" banner.
7. Polish: no-op clauses in the verdict prose ("add labels []", "only run on
   schedule [at any time]"); editor hover on `:preset` strings shows a
   useless "string" tooltip; option-doc tooltips occlude content when
   scrolled under the cursor; copy buttons too close to expand targets.

Top cross-session wishes: a "why didn't my rule match?" shortcut (filter
results to repo-config rules, pre-expanded) and a combined "quote this
verdict" citation export.

These findings feed roadmap items 021–023; user-reported findings from the
same review round feed 024–027.
