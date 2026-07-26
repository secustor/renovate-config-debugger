# Roadmap

Planned features for the Renovate Config Visualizer, in intended build order.
Full context and architecture: [docs/Architecture.md](../docs/Architecture.md).

| #                                                     | Feature                                                   | Milestone            | Status |
| ----------------------------------------------------- | --------------------------------------------------------- | -------------------- | ------ |
| [001](001-engine-and-config-input.md)                 | Trace engine + config input                               | M0/M1                | done   |
| [002](002-preset-resolution-tree.md)                  | Preset resolution tree                                    | M1 (MVP centerpiece) | done   |
| [003](003-inline-option-docs.md)                      | Inline option documentation                               | M1                   | done   |
| [004](004-migration-step-through.md)                  | Migration step-through                                    | M2                   | done   |
| [005](005-merge-provenance-view.md)                   | Merge provenance view                                     | M2                   | done   |
| [006](006-package-rules-simulator.md)                 | packageRules simulator                                    | M3                   | done   |
| [007](007-shareable-links-and-repo-fetch.md)          | Shareable links + fetch config from repo                  | M4                   | done   |
| [008](008-global-and-inherited-config.md)             | Global + inherited config layers                          | M3                   | done   |
| [009](009-github-oauth-sign-in.md)                    | "Sign in with GitHub" (replace PAT field)                 | M4                   | done   |
| [010](010-preset-hosting-coverage.md)                 | Preset hosting coverage + `local>`                        | M2                   | done   |
| [011](011-preset-tree-legibility-at-scale.md)         | Preset tree legibility at scale                           | M2                   | done   |
| [012](012-simulator-verdict-first-results.md)         | Simulator: verdict-first results + update-type flattening | M5                   | done   |
| [013](013-rule-identity-and-provenance.md)            | Rule identity: numbering, provenance, cross-links         | M5                   | done   |
| [014](014-validation-translations-and-quick-fixes.md) | Validation error translations + suggested fixes           | M5                   | done   |
| [015](015-simulator-input-ergonomics.md)              | Simulator input ergonomics                                | M5                   | done   |
| [016](016-scale-framing-and-page-ergonomics.md)       | Scale framing, badge glossary, page & editor ergonomics   | M5                   | done   |
| [017](017-share-links-in-a-running-app.md)            | Share links opened in a running app (hashchange)          | M5                   | done   |
| [018](018-evidence-export-and-expert-precision.md)    | Evidence export + expert-grade precision                  | M6                   | done   |
| [019](019-persona-replay-skill.md)                    | Persona usability-test replay skill                       | M6                   | done   |
| [020](020-browser-e2e-tests.md)                       | Browser end-to-end test suite                             | M6                   | done   |
| [021](021-simulator-input-hardening.md)               | Simulator input hardening + A/B comparison integrity      | M7                   | done   |
| [022](022-verdict-copy-precision.md)                  | Verdict & translation copy precision                      | M7                   | done   |
| [023](023-post-action-focus-and-guidance.md)          | Post-action focus, honest error states, rule filters      | M7                   | done   |
| [024](024-stage-chips-signal-outcomes.md)             | Stage chips signal what each stage did                    | M7                   | done   |
| [025](025-hover-card-overflow.md)                     | Hover card text overflows its box                         | M7                   | done   |
| [026](026-schema-first-class-option.md)               | Treat `$schema` as a first-class option                   | M7                   | done   |
| [027](027-share-link-failure-diagnostics.md)          | Share-link failure diagnostics                            | M7                   | done   |
| [028](028-tabbed-results-shell.md)                    | Tabbed results shell (post-run progressive disclosure)    | M8                   | done   |
| [029](029-run-digest.md)                              | Run digest (plain-English overview)                       | M8                   | done   |
| [030](030-input-validation-zod.md)                    | Input validation at every boundary (zod/mini)             | M8                   | done   |
| [031](031-critical-path-loading.md)                   | Critical-path loading performance                         | M9                   | done   |
| [032](032-keystroke-render-performance.md)            | Keystroke render performance                              | M9                   | done   |
| [033](033-app-decomposition-and-boundaries.md)        | App decomposition + single-source boundaries              | M9                   | done   |
| [034](034-lint-hardening.md)                          | Lint hardening (oxlint)                                   | M9                   | done   |
| [035](035-layout-polish.md)                           | Layout polish + regression tests                          | M10                  | done   |
| [036](036-unified-chrome.md)                          | Unified chrome: filled badges, copy button, diff toolbar  | M10                  | done   |
| [037](037-theme-switcher.md)                          | Light / dark theme switcher                               | M10                  | done   |
| [038](038-lint-audit-follow-up.md)                    | Lint audit follow-up: quick wins + 034 corrections        | M10                  | done   |
| [039](039-editor-column-polish.md)                    | Editor column polish: theme, one Button, repo-load        | M10                  | done   |
| [040](040-jsx-depth-decomposition.md)                 | JSX-depth ratchet: decompose the monoliths to depth 4     | M10                  | done   |
| [041](041-warn-tier-to-error.md)                      | Promote the warn tier to error                            | M10                  | done   |
| [042](042-rewrites-inset-and-pipeline-arrows.md)      | Rewrites inset + Pipeline order arrows                    | M10                  | done   |
| [043](043-docker-self-host.md)                        | Docker self-host distribution                             | M11                  | done   |

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
