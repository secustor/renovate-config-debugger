# Roadmap

Planned features for the Renovate Config Visualizer, in intended build order.
Full context and architecture: [docs/Architecture.md](../docs/Architecture.md).

| #                                                       | Feature                                                           | Milestone            | Status   |
| ------------------------------------------------------- | ----------------------------------------------------------------- | -------------------- | -------- |
| [001](001-engine-and-config-input.md)                   | Trace engine + config input                                       | M0/M1                | done     |
| [002](002-preset-resolution-tree.md)                    | Preset resolution tree                                            | M1 (MVP centerpiece) | done     |
| [003](003-inline-option-docs.md)                        | Inline option documentation                                       | M1                   | done     |
| [004](004-migration-step-through.md)                    | Migration step-through                                            | M2                   | done     |
| [005](005-merge-provenance-view.md)                     | Merge provenance view                                             | M2                   | done     |
| [006](006-package-rules-simulator.md)                   | packageRules simulator                                            | M3                   | done     |
| [007](007-shareable-links-and-repo-fetch.md)            | Shareable links + fetch config from repo                          | M4                   | done     |
| [008](008-global-and-inherited-config.md)               | Global + inherited config layers                                  | M3                   | done     |
| [009](009-github-oauth-sign-in.md)                      | "Sign in with GitHub" (replace PAT field)                         | M4                   | done     |
| [010](010-preset-hosting-coverage.md)                   | Preset hosting coverage + `local>`                                | M2                   | done     |
| [011](011-preset-tree-legibility-at-scale.md)           | Preset tree legibility at scale                                   | M2                   | done     |
| [012](012-simulator-verdict-first-results.md)           | Simulator: verdict-first results + update-type flattening         | M5                   | done     |
| [013](013-rule-identity-and-provenance.md)              | Rule identity: numbering, provenance, cross-links                 | M5                   | done     |
| [014](014-validation-translations-and-quick-fixes.md)   | Validation error translations + suggested fixes                   | M5                   | done     |
| [015](015-simulator-input-ergonomics.md)                | Simulator input ergonomics                                        | M5                   | done     |
| [016](016-scale-framing-and-page-ergonomics.md)         | Scale framing, badge glossary, page & editor ergonomics           | M5                   | done     |
| [017](017-share-links-in-a-running-app.md)              | Share links opened in a running app (hashchange)                  | M5                   | done     |
| [018](018-evidence-export-and-expert-precision.md)      | Evidence export + expert-grade precision                          | M6                   | done     |
| [019](019-persona-replay-skill.md)                      | Persona usability-test replay skill                               | M6                   | done     |
| [020](020-browser-e2e-tests.md)                         | Browser end-to-end test suite                                     | M6                   | done     |
| [021](021-simulator-input-hardening.md)                 | Simulator input hardening + A/B comparison integrity              | M7                   | done     |
| [022](022-verdict-copy-precision.md)                    | Verdict & translation copy precision                              | M7                   | done     |
| [023](023-post-action-focus-and-guidance.md)            | Post-action focus, honest error states, rule filters              | M7                   | done     |
| [024](024-stage-chips-signal-outcomes.md)               | Stage chips signal what each stage did                            | M7                   | done     |
| [025](025-hover-card-overflow.md)                       | Hover card text overflows its box                                 | M7                   | done     |
| [026](026-schema-first-class-option.md)                 | Treat `$schema` as a first-class option                           | M7                   | done     |
| [027](027-share-link-failure-diagnostics.md)            | Share-link failure diagnostics                                    | M7                   | done     |
| [028](028-tabbed-results-shell.md)                      | Tabbed results shell (post-run progressive disclosure)            | M8                   | done     |
| [029](029-run-digest.md)                                | Run digest (plain-English overview)                               | M8                   | done     |
| [030](030-input-validation-zod.md)                      | Input validation at every boundary (zod/mini)                     | M8                   | done     |
| [031](031-critical-path-loading.md)                     | Critical-path loading performance                                 | M9                   | done     |
| [032](032-keystroke-render-performance.md)              | Keystroke render performance                                      | M9                   | done     |
| [033](033-app-decomposition-and-boundaries.md)          | App decomposition + single-source boundaries                      | M9                   | done     |
| [034](034-lint-hardening.md)                            | Lint hardening (oxlint)                                           | M9                   | done     |
| [035](035-layout-polish.md)                             | Layout polish + regression tests                                  | M10                  | done     |
| [036](036-unified-chrome.md)                            | Unified chrome: filled badges, copy button, diff toolbar          | M10                  | done     |
| [037](037-theme-switcher.md)                            | Light / dark theme switcher                                       | M10                  | done     |
| [038](038-lint-audit-follow-up.md)                      | Lint audit follow-up: quick wins + 034 corrections                | M10                  | done     |
| [039](039-editor-column-polish.md)                      | Editor column polish: theme, one Button, repo-load                | M10                  | done     |
| [040](040-jsx-depth-decomposition.md)                   | JSX-depth ratchet: decompose the monoliths to depth 4             | M10                  | done     |
| [041](041-warn-tier-to-error.md)                        | Promote the warn tier to error                                    | M10                  | done     |
| [042](042-rewrites-inset-and-pipeline-arrows.md)        | Rewrites inset + Pipeline order arrows                            | M10                  | done     |
| [043](043-docker-self-host.md)                          | Docker self-host distribution                                     | M11                  | done     |
| [044](044-simulator-merge-step-through.md)              | Simulator: step through rule merges one at a time                 | M12                  | done     |
| [045](045-auto-load-inherited-config.md)                | Auto-load the inherited config for a loaded repository            | M12                  | done     |
| [046](046-simulator-verdict-card-and-merge-timeline.md) | Simulator: verdict card + merge timeline                          | M12                  | done     |
| [047](047-simulator-progressive-disclosure.md)          | Simulator: progressive disclosure                                 | M12                  | done     |
| [048](048-app-decomposition-and-depth-ratchet.md)       | App decomposition + depth ratchet to 3                            | M13                  | done     |
| [049](049-feature-layer-expansion.md)                   | Feature-layer expansion: editor, presets                          | M13                  | done     |
| [050](050-css-design-tokens.md)                         | CSS design tokens: dedup, consolidation, enforcement              | M13                  | done     |
| [051](051-resolved-config-output.md)                    | Effective config: resolved config as a copyable document          | M14                  | done     |
| [052](052-post-resolution-remigration.md)               | Fidelity: re-migrate the resolved config (upstream parity)        | M14                  | done     |
| [053](053-analytics-localhost-exclusion.md)             | Analytics: CI is not an audience, not tracked on localhost        | M14                  | done     |
| [054](054-simulator-results-readability.md)             | Simulator: results readability — the ledger is the trace          | M14                  | done     |
| [055](055-header-project-links.md)                      | Header links to the source and the issue tracker                  | M14                  | done     |
| [056](056-publish-engine-package.md)                    | Publish the engine as `@renovate-config-debugger/engine`          | M15                  | proposed |
| [057](057-fork-codemirror-json-schema.md)               | Fork + publish `codemirror-json-schema`                           | M15                  | proposed |
| [058](058-rcd-debugger-cli.md)                          | `rcd`: the debugger CLI on the shimmed engine (experimental)      | M16                  | done     |
| [059](059-publish-cli-package.md)                       | Publish the CLI as `@renovate-config-debugger/cli` (experimental) | M16                  | done     |
| [060](060-mcp-server-and-agent-discovery.md)            | `rcd mcp` + pointing agents at the headless interface             | M16                  | done     |
| [061](061-claude-plugin-marketplace.md)                 | Claude plugin marketplace for the debugger                        | M16                  | done     |
| [062](062-results-tab-taxonomy.md)                      | Results tabs: `Simulator` → `packageRules`, + `Extraction`        | M17                  | proposed |
| [063](063-custom-manager-extraction.md)                 | Custom-manager extraction simulator                               | M17                  | proposed |
| [064](064-extraction-fidelity-and-mismatch.md)          | Extraction fidelity: RE2 gap + unmatched comments                 | M17                  | proposed |
| [065](065-persistent-sign-in.md)                        | Persistent sign-in: HttpOnly refresh-token cookie                 | M14                  | done     |
| [066](066-header-account-menu.md)                       | Header session menu: account, theme and links in one corner       | M14                  | done     |
| [067](067-semantic-release.md)                          | semantic-release: one version for every public package            | M16                  | done     |

M5/M6 items derive from the [2026-07 persona UX study](2026-07-persona-ux-study.md):
three real discussion-board configuration problems, each replayed against the live
app by entry-, advanced- and expert-level user personas.

M7 items derive from [replay #1 of that study](2026-07-persona-replay-01.md)
(the first run of the 019 skill, against the finished M5/M6 state) plus
user-reported findings from the same review round (021–023 replay,
024–027 user-reported).

M8: 028/029 come from the 2026-07-25 post-run information-overload design
review — patterns researched across regex101 / TypeScript Playground /
Compiler Explorer / crontab.guru and settled through five mockups (the
chosen one is preserved in [mockups/028/](mockups/028/e-final.html));
030 is user-requested input hardening.

M9 items derive from the 2026-07-25 best-practices review (three parallel
review agents over the app package + a lint audit): 031/032 from measured
bundle/render findings, 033 from the maintainability findings, 034 from
the oxlint audit. The review's three Tier-1 security findings were fixed
immediately on the M8 branch rather than roadmapped.

M10 originates in a user-reported layout review of 2026-07-25 (a screenshot
walkthrough of the post-run two-pane shell): five rendered-geometry and
color defects that the DOM-level e2e suite could not see, one of them a
regression introduced by 031's CSS chunk split. 036/037 come from the
follow-up design review of the same day (badge fills, copy-button
unification, stage-result copy, diff toolbar, theme switcher), settled
through the approved [mockups/036/unified-chrome.html](mockups/036/unified-chrome.html).
038 comes from the 2026-07-26 re-audit of 034's disabled lint rules
(every count re-measured, every post-034 hit blamed for recency).
039 comes from the 2026-07-26 user review of the post-036/037 editor
column, settled through the approved
[mockups/039/editor-column-polish.html](mockups/039/editor-column-polish.html)
(Option B); 040 from the same day's measured JSX-depth analysis (above
depth 4 only three monolith files violate — the codebase's own norm);
041 is the user decision to make the whole warn tier fail CI.
042 is a 2026-07-26 user-reported polish pass on the results column —
the Rewrites card's missing inset and the Pipeline chips' missing order
signal — settled through the approved
[mockups/042/rewrites-padding-and-pipeline-order.html](mockups/042/rewrites-padding-and-pipeline-order.html)
(variants 1B and 2A).

M11 — **Distribution** — opens with 043, the user request to make the app
installable rather than only visitable: published container images, and the
runtime-configuration mechanism a single published image needs to offer an
optional sign-in it cannot bake in.

M12 collects the 2026-07-26 user-requested feature work. 044 gave the
simulator the migration stepper's step-through over its rule-merge
sequence; 045 auto-resolves the inherited-config layer from a loaded
repository the way a real `inheritConfig` run does — a default-on
checkbox in the repo-load form, with the exact repo and file it will read
editable beside it, settled through the approved
[mockups/045/auto-load-inherited-config.html](mockups/045/auto-load-inherited-config.html)
(variant 1B). 046 answered the same-day review of 044: the flatten-noise
fix ("removed" update-type blocks that no rule removed), the verdict
card, and the merge timeline on the Pipeline tab's chip grammar —
settled through the approved
[mockups/046/simulator-redesign.html](mockups/046/simulator-redesign.html)
(variant 2B). 047 staged the whole Simulator tab with progressive
disclosure (research-backed: see
[2026-07-progressive-disclosure-research.md](2026-07-progressive-disclosure-research.md))
— minimal form with registry-fed type-to-search fields, summary
drawers for the evidence layers, a conditional consumed-blocks aside,
and the provenance-chip hover card, per the approved
[mockups/047/simulator-progressive-disclosure.html](mockups/047/simulator-progressive-disclosure.html).

M13 — **Structure** — is the 2026-07-26 research-driven maintainability
pass: a commissioned, adversarially verified report on Vite/React project
structure ([2026-07-vite-structure-research.md](2026-07-vite-structure-research.md))
applied as 048 — the first `features/` folder (simulator), hook/component
extraction across the four depth-4 offenders, and the jsx-max-depth
ratchet's next step (4 → 3), run as an implement → reevaluate loop. 049
extended the feature layer from a consumer-map review of `components/`:
`features/editor/` (the config-input column), `features/presets/`
(PresetTree decomposed into ten files), and SummaryDrawer joining the
simulator. 050 brought the same discipline to the stylesheet: repeated
theme values promoted to design tokens, drifted status tints
consolidated onto token families, and stylelint enforcing var()-only
colors from then on.

M14 opens with 051, the 2026-07-28 user request to read the resolved
config "without internal presets" out of the Effective config tab —
landed as an As-JSON rendering with two expansion levels (hosted
presets inlined with internal ones kept as `extends` references, or
everything expanded, optionally defaults-hydrated), settled through the
approved
[mockups/051/effective-config-output.html](mockups/051/effective-config-output.html)
(variant B; the originally proposed filter-bar checkbox was rejected as
a mode masquerading as a filter).

M15 — **Packages** — is the second distribution milestone (after M11's
images), aimed at npm rather than at self-hosters. 056 publishes the
engine as `@renovate-config-debugger/engine`: it is the only part of the
repository that isn't app-specific, and today nothing outside the
workspace can use it — its `exports` point at `.ts` sources and it is
`private`. 057 replaces the two local workarounds under the editor — a
pnpm patch against `codemirror-json-schema`'s build output and a Vite
shim plugin that cuts two of its modules — with a source-level fork
published under the same scope, upstream having merged nothing since
2025-04-21. It ships in three releases, the first of which is upstream
0.8.1 verbatim under the new name: adopting the fork and adopting its
changes are separate decisions, and the no-op switch is what proves the
mirror honest. Both items need the package registry organization to
exist first; whichever lands first creates it.

M16 — **Agent debug interface** — grows out of the
[2026-08 research](2026-08-agent-debug-interface-research.md): agents
debugging config resolution either drive the web app in a browser or
import the engine in plain Node, where the preset tree and provenance
silently vanish (they only exist in the shimmed module graph). 058 ships
`rcd`, a CLI hosting the browser module graph under Node via Vite's SSR
runner — web-app parity by construction, one subcommand per question,
hook-grade exit codes. 059 packages the same graph as a prebuilt bundle
published as `@renovate-config-debugger/cli` (bundle proven identical by
re-running the shimmed snapshots against it). 060 adds `rcd mcp` — warm
engine, `runId` handles instead of firehose payloads — and the discovery
surface: visible docs plus Claude Code's plugin-hint marker, with hidden
agent messaging explicitly ruled out. 061 closes the loop with a Claude
plugin marketplace: a thin `secustor/claude-plugins` catalog repo whose
entry points back at a plugin maintained here (git-subdir source), the
plugin bundling the MCP server registration with a skill that carries the
debugging workflow itself — so an installed session starts with the tools
and the sequencing knowledge together, and consumers never clone the
monorepo for a kilobyte of catalog.

M17 — **Extraction** — is deferred until the current feature set (054's
remaining variants in particular) has stabilized. It originates in
[renovatebot/renovate#45071](https://github.com/renovatebot/renovate/discussions/45071)
— custom-manager comments that silently match nothing — and is scoped by
the spike in
[2026-08-custom-manager-simulation-feasibility.md](2026-08-custom-manager-simulation-feasibility.md),
which proved Renovate's own extraction code runs unmodified in the browser
module graph, no new shims required. Build the three in order: 062 fixes
the tab taxonomy before a second simulator makes `Simulator` a name that
distinguishes nothing, 063 is the feature (the first input the app has
ever taken that is not a config), and 064 makes its claims honest — real
Renovate compiles `matchStrings` with RE2, the browser falls back to
native `RegExp`, and the two diverge in both directions — while answering
the discussion's actual question.
