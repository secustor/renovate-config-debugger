# Persona UX Study — Renovate Config Debugger

**Method.** Three real, answered configuration problems were taken from the
[renovatebot/renovate discussion board](https://github.com/renovatebot/renovate/discussions).
For each problem, three subagents role-played a user at a different skill level —
**Entry** (zero Renovate knowledge), **Advanced** (2 years of config maintenance),
**Expert** (maintainer-level intrinsic knowledge) — and drove the **live app in a real
Chrome session** (production build of PR #21, Renovate v43.275.0), one session at a
time, browser-only, ~30 actions budget each. Each persona received the problem as a
pre-loaded share link plus only the facts their skill level would plausibly know, and
never the answer. 9 sessions total.

## The three problems (and ground truth)

| #   | Discussion                                                                                                                            | Scenario given to personas                                                                                                | Ground truth (from the accepted answer)                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | [#44772 "monorepo:react preset not working"](https://github.com/renovatebot/renovate/discussions/44772)                               | `packageRules: [{extends: ["monorepo:react"], enabled: false}]`, yet react 18.2.0→19.2.0 PRs keep appearing               | The bundled preset matches `matchSourceUrls: ["https://github.com/facebook/react"]`; react's repo moved to `react/react`, so the rule never fires |
| P2  | [#43936 "Invalid configuration reported, but configuration seems correct"](https://github.com/renovatebot/renovate/discussions/43936) | `matchPackageNames: ["*", "!gradle"]` newly flagged: _"Your input contains \* or \*\* along with other patterns…"_        | Validator tightened; `*` is redundant next to `!gradle` — remove it, behavior unchanged                                                           |
| P3  | [#44006 ":automergeMinor merge behavior"](https://github.com/renovatebot/renovate/discussions/44006)                                  | Rule extends `:automergeMinor` + `:label(deploy_pr)` + `autoApprove: true`; a **major** update got the label and approval | The preset only nests `automerge` under update-type keys; `labels`/`autoApprove` are rule-level and apply to _every_ matched update               |

## Outcome matrix

Every persona reached (or independently confirmed) the correct diagnosis — the tool
_works_. The findings below are therefore about **speed, confidence, and one real
capability gap**, not about fundamental failure.

|                        | Entry (no knowledge)                                                                                | Advanced                                                       | Expert                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **P1 react preset**    | ✅ Solved, 85% conf. — full 30-action budget; survived only thanks to the simulator's example chips | ✅ Confirmed in **4 actions / ~2 min** via preset tree, 95%    | ✅ Both goals < 5 min, 97%; couldn't see matcher `false` vs `null`     |
| **P2 validation**      | ✅ Solved **and fixed and re-verified in-app**, 85%                                                 | ✅ All 3 goals (real error? what? minimal fix + proof), 90–95% | ✅ All 3 goals, 92%; "citable with caveats" for a discussion answer    |
| **P3 automerge scope** | ✅ Solved, 90% — assembled the verdict manually from diffs                                          | ✅ All goals; tool **corrected their mental model**, 95–100%   | ⚠️ 2 of 3 goals — the minor-update contrast **failed** (see Finding 1) |

What consistently carried users to the answer, across all levels:

- the **per-rule clause evidence** in the simulator — `matchSourceUrls: [...] — no match against sourceUrl = "https://github.com/react/react"` was called "the money shot" / "the single most convincing screen" in five separate reports;
- the **preset inspector** ("Fetched content" + the nested-resolution footnote) — one click to a preset's literal body;
- the pinned **Renovate version badge** — settled "regression vs. real" instantly;
- **share links + auto-run** — zero-click reproduction;
- the **example chips** in the simulator — the entry personas said they could never have filled the form from scratch.

---

## Findings, ranked

### 1. The simulator never applies update-type flattening — its biggest capability gap ⚠️ (P3-expert, correctness-adjacent)

After packageRules are applied, real Renovate merges `minor: {automerge: true}` up
into the config when the update _is_ minor (`flattenUpdates` /
`mergeChildConfig(config, config[updateType])`). The simulator stops before this
step: a **minor** simulation of the P3 config still shows top-level
`automerge: false` with `minor: {"automerge": true}` sitting unmerged — visually
identical to the major run. The expert could not produce the "minor ⇒ automerge
true" contrast at all, and warned:

> "A non-expert would read the minor run as 'automerge is false' and be _more_
> confused."

The single most common question the simulator could answer — _"will this update
automerge?"_ — is left as an exercise. **Recommendation:** run the flattening step
and print a verdict block (see Finding 2). This is engine work, not just UI.

### 2. The simulator's answer is buried under ~710 "no match" rows (all 9 sessions)

The unanimous complaint. "3 of 713 rules matched" renders **all 713 rules**, almost
all "no match"; the user's own rule is always last (repo rules append after preset
rules); the FINAL PER-DEPENDENCY CONFIG verdict sits below the entire list; `End`
lands on a blank over-scrolled viewport; re-simulating resets scroll position.

**Recommendations (highest leverage in the whole study):**

- Default to **matched rules only**, with a "show all N" toggle; make the "3 of 713
  rules matched" text a jump-link.
- Pin the **final per-dependency config summary directly under the Simulate button**,
  and open it with a plain-language verdict sentence, e.g. _"This major update WOULD
  get labels [deploy_pr] and auto-approval, but would NOT automerge (automerge is
  scoped to minor/patch)."_ Three personas independently asked for exactly this
  sentence.
- Add a **provenance chip on every rule row** (`repo config` / preset name — the
  Effective config panel already has these chips) and highlight the user's own rules.
- Rule captions should list **all matchers with the failing one named**
  (`#7 matchSourceUrls+matchUpdateTypes — failed on matchSourceUrls`); today rows
  like `#712 matchUpdateTypes: ["major","minor","patch"] — no match` on a major
  update look flatly wrong until expanded ("exactly the kind of thing a confused
  discussion poster screenshots as 'the tool is broken'").

### 3. Three numbering schemes for the same rule, with no cross-links (P2 all levels, P3)

The validator says `packageRules[1]` (repo-config index), the simulator error says
`packageRules[713]` (post-merge index), the results list says `#714` (1-based). The
entry user "made sure they were the same thing" only by luck; the expert called it
the thing "a non-maintainer will think are two different errors."

**Recommendation:** one canonical presentation plus cross-references — wherever an
error cites `packageRules[N]`, hyperlink it to the editor line (repo config) and/or
the merged rule row, annotated "repo-config index 1 = merged index 713 = row #714."

### 4. Validation errors are re-printed raw, with no translation or fix (P2 all levels)

The app reproduces Renovate's message verbatim — great for authenticity, but the
message itself is ambiguous ("Please remove **them**" — the stars or the other
patterns?). Entry and advanced both wished for a plain-language explanation with a
one-click suggested fix, and noted the tool has everything needed to _prove_ the
fix is behavior-preserving (the advanced persona did that proof manually in ~10
minutes; an A/B simulation diff could do it automatically).

**Recommendation:** a small library of known-validator-error translations
("`*` is redundant next to other patterns — newer Renovate rejects it. Suggested
change: `["*", "!gradle"]` → `["!gradle"]` (same behavior)"), each with an "apply
fix" affordance. Longer-term: pin a simulation, edit, re-simulate, and show a
structured diff with an explicit "no behavioral change" verdict (expert wish, P2).

### 5. Simulator input UX undermines the tool's best feature (P1/P3, all levels)

- `sourceUrl` — the _only_ matcher in two of the three real-world problems — is
  hidden behind "More fields — versioning, lock files, URLs, categories, age…".
- The nearby `repository` field invites the wrong guess for a repo URL; the P3 entry
  persona nearly put the URL there, which "would have given me the opposite conclusion."
- `updateType` is not derived from currentValue/newValue (18.2.0→19.2.0 left "patch"
  from a quick-fill chip); a silently wrong updateType invalidates a simulation.
- Simulate with an empty form yields "0 of 714 rules matched" with no hint — the P2
  entry persona briefly concluded the broken rule "had disabled ALL 714 rules."
- The `updateType` dropdown ignored arrow keys (typeahead only) in one session.
- Quick-fill chips lack a nuget example (Azure DevOps users).

**Recommendations:** promote `sourceUrl` to the primary fields; derive `updateType`
from the versions with manual override; guard the empty form ("pick an example or
fill in a package first"); fix select keyboard handling; add a nuget chip; make the
stale-results state grey out the old list, not just show the small orange hint.

### 6. Scale shock: unexplained big numbers frighten exactly the users the app courts (all entry sessions, advanced too)

"Resolved 1076 preset(s)", "packageRules [ 714 items ]", "712 rules", the seven-counter
summary strip, and a 10,000-line default diff all triggered "did I break something?" /
"I wrote 2 rules" reactions. The preset-tree summary header exists, but the numbers
appear in many places without the framing sentence.

**Recommendation:** attach one framing phrase wherever a big count first appears —
e.g. "713 rules (2 from your config, 711 pulled in by `config:recommended`)" — and
give the counter strip and badges (`2 opts`, `duplicate ×2`, `nested`, `internal`,
`overridden`) the same hover-card treatment the stage pills got in PR #21. Note:
`overridden` on an _appended_ array (`packageRules`) was called actively misleading
by the expert.

### 7. Navigation and keyboard ergonomics (7 of 9 sessions)

`End` key lands on a blank viewport below the content; no back-to-top affordance;
after Run the viewport jumps somewhere unrelated; long pages must be re-scrolled
after every re-simulate. **Recommendation:** fix End/Home scrolling, add a sticky
mini-toolbar (stage pills + Run) or back-to-top button, and preserve scroll position
across re-simulations.

### 8. In-app config editing is hazardous (P2/P3 advanced)

Stale-coordinate clicks silently replaced the wrong line; triple-click selection ate
newlines; typed edits vanished without feedback when focus was elsewhere; no visible
undo affordance (Cmd+Z works but nothing says so). For the edit → re-run → re-verify
loop that P2 proved so valuable, **recommendation:** a visible undo/redo hint or
toolbar, and possibly a "revert to loaded config" button.

### 9. Expert-grade evidence gaps (all expert sessions)

- Matcher verdicts don't distinguish **`false` (fail-closed) vs `null` (not
  applicable)** — both render as "no match"; the prose hints at it ("no match against
  no input value set" — also flagged as mangled grammar by two personas).
- No **copy/export**: preset body and applied-diff as markdown, for pasting into a
  discussion answer.
- Share links don't encode **simulator inputs**, so "open this link and press
  Simulate" can't reproduce a demonstration.
- No **preset diff across Renovate versions** ("did upstream already add
  react/react?") — heavy to build; long-term idea.

### 10. Bug found during study setup: share links are ignored in an open app

Navigating from the already-open app to a share URL is a hash-only navigation — the
decode effect runs only on mount, so **nothing happens** (no config load, no run, no
error). A user clicking a colleague's link while the app is open sees their old state
and may not notice. **Recommendation:** listen for `hashchange` and run the same
decode-and-run path (with an "overwrite current work?" guard).
Also observed (dev-only, not user-facing): a cold `vite dev` server can wedge the
first engine import after `--force` re-optimization; the production build is fine.

---

## Suggested priority order

| Priority | Item                                                                                                  | Findings | Effort                              |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- | ----------------------------------- |
| P0       | Simulator: matched-only default + pinned verdict block with plain-language sentence                   | 1, 2     | M (UI) + engine work for flattening |
| P0       | `hashchange` handling for share links                                                                 | 10       | S                                   |
| P1       | Rule provenance chips + unified/cross-linked rule numbering                                           | 2, 3     | M                                   |
| P1       | Simulator inputs: promote sourceUrl, derive updateType, empty-form guard, nuget chip, select keyboard | 5        | S–M                                 |
| P1       | Known-error translations with suggested fixes                                                         | 4        | M                                   |
| P2       | Count framing ("2 yours, 711 from config:recommended") + badge hover cards                            | 6        | S                                   |
| P2       | End/Home + sticky nav + scroll preservation                                                           | 7        | S                                   |
| P2       | Editor undo affordance / revert button                                                                | 8        | S                                   |
| P3       | Matcher false-vs-null verdicts; full matcher list in captions                                         | 9, 2     | M                                   |
| P3       | Evidence export (copy-as-markdown, simulator inputs in share links, A/B diff)                         | 9, 4     | M–L                                 |
| P3       | Cross-version preset diff                                                                             | 9        | L                                   |

## What to keep (validated by the study)

The per-clause match evidence, the preset inspector with its nested-resolution
footnote, version pinning, share-link auto-run, simulator example chips, the
red→green stage dots as before/after proof, input preservation across re-runs, and
the stage-pill hover cards — each was explicitly credited in multiple reports.
Notably, several are recent PR #21 additions (hover cards, plain-language stage
descriptions, "try an example"), and the entry personas — the audience PR #21
targeted — all reached correct diagnoses.

---

_Study run 2026-07-23 against the production build of branch `feature/ux-first-load`
(PR #21), Renovate v43.275.0. Full persona transcripts live in the
originating Claude Code session._
