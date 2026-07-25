# Roadmap

Planned features for the Renovate Config Visualizer, in intended build order.
Full context and architecture: [.agents/spec/renovate-config-visualizer.md](../.agents/spec/renovate-config-visualizer.md).

| #                                                     | Feature                                                   | Milestone            | Status  |
| ----------------------------------------------------- | --------------------------------------------------------- | -------------------- | ------- |
| [001](001-engine-and-config-input.md)                 | Trace engine + config input                               | M0/M1                | done    |
| [002](002-preset-resolution-tree.md)                  | Preset resolution tree                                    | M1 (MVP centerpiece) | done    |
| [003](003-inline-option-docs.md)                      | Inline option documentation                               | M1                   | done    |
| [004](004-migration-step-through.md)                  | Migration step-through                                    | M2                   | done    |
| [005](005-merge-provenance-view.md)                   | Merge provenance view                                     | M2                   | done    |
| [006](006-package-rules-simulator.md)                 | packageRules simulator                                    | M3                   | done    |
| [007](007-shareable-links-and-repo-fetch.md)          | Shareable links + fetch config from repo                  | M4                   | done    |
| [008](008-global-and-inherited-config.md)             | Global + inherited config layers                          | M3                   | done    |
| [009](009-github-oauth-sign-in.md)                    | "Sign in with GitHub" (replace PAT field)                 | M4                   | done    |
| [010](010-preset-hosting-coverage.md)                 | Preset hosting coverage + `local>`                        | M2                   | done    |
| [011](011-preset-tree-legibility-at-scale.md)         | Preset tree legibility at scale                           | M2                   | done    |
| [012](012-simulator-verdict-first-results.md)         | Simulator: verdict-first results + update-type flattening | M5                   | done    |
| [013](013-rule-identity-and-provenance.md)            | Rule identity: numbering, provenance, cross-links         | M5                   | done    |
| [014](014-validation-translations-and-quick-fixes.md) | Validation error translations + suggested fixes           | M5                   | done    |
| [015](015-simulator-input-ergonomics.md)              | Simulator input ergonomics                                | M5                   | done    |
| [016](016-scale-framing-and-page-ergonomics.md)       | Scale framing, badge glossary, page & editor ergonomics   | M5                   | done    |
| [017](017-share-links-in-a-running-app.md)            | Share links opened in a running app (hashchange)          | M5                   | done    |
| [018](018-evidence-export-and-expert-precision.md)    | Evidence export + expert-grade precision                  | M6                   | done    |
| [019](019-persona-replay-skill.md)                    | Persona usability-test replay skill                       | M6                   | done    |
| [020](020-browser-e2e-tests.md)                       | Browser end-to-end test suite                             | M6                   | done    |
| [021](021-simulator-input-hardening.md)               | Simulator input hardening + A/B comparison integrity      | M7                   | done    |
| [022](022-verdict-copy-precision.md)                  | Verdict & translation copy precision                      | M7                   | done    |
| [023](023-post-action-focus-and-guidance.md)          | Post-action focus, honest error states, rule filters      | M7                   | done    |
| [024](024-stage-chips-signal-outcomes.md)             | Stage chips signal what each stage did                    | M7                   | done    |
| [025](025-hover-card-overflow.md)                     | Hover card text overflows its box                         | M7                   | done    |
| [026](026-schema-first-class-option.md)               | Treat `$schema` as a first-class option                   | M7                   | done    |
| [027](027-share-link-failure-diagnostics.md)          | Share-link failure diagnostics                            | M7                   | done    |
| [028](028-tabbed-results-shell.md)                    | Tabbed results shell (post-run progressive disclosure)    | M8                   | done    |
| [029](029-run-digest.md)                              | Run digest (plain-English overview)                       | M8                   | done    |
| [030](030-input-validation-zod.md)                    | Input validation at every boundary (zod/mini)             | M8                   | planned |

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
