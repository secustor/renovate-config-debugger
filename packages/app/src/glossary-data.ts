/**
 * Plain-language explanations for Renovate concepts used in the app's own
 * copy (the option hover docs in option-docs.tsx cover config *keys*; this
 * covers the vocabulary around them). Each entry links to the matching
 * docs.renovatebot.com page when one exists.
 *
 * Data only — the `Term`/`Explained` components that render it live in
 * glossary.tsx, which cannot also export this without breaking Fast Refresh
 * (react/only-export-components).
 */

export interface GlossaryEntry {
  /** The exact Renovate name, shown as the card heading. */
  name: string;
  /** One or two plain sentences — what it means to a repo user. */
  plain: string;
  /** docs.renovatebot.com page, when there is one. */
  url?: string;
}

export const GLOSSARY = {
  preset: {
    name: "presets",
    plain:
      "Reusable, shareable pieces of configuration that your config pulls in through the extends option. Most repos start from the config:recommended preset.",
    url: "https://docs.renovatebot.com/config-presets/",
  },
  extends: {
    name: "extends",
    plain:
      "The config option that lists which presets to pull in. Renovate downloads each one, expands presets referenced inside it, and merges the result under your own settings.",
    url: "https://docs.renovatebot.com/configuration-options/#extends",
  },
  migration: {
    name: "config migration",
    plain:
      "Renovate renames and reshapes options over time. Migration rewrites deprecated settings in your config to their current form before anything else happens.",
    url: "https://docs.renovatebot.com/config-migration/",
  },
  massage: {
    name: "massaging",
    plain:
      "A normalization step: shorthand you are allowed to write (like a single string where a list is expected) is expanded into the full form Renovate works with internally.",
  },
  validation: {
    name: "config validation",
    plain:
      "Every option is checked against Renovate's schema — unknown names, wrong types and misplaced options are reported the same way renovate-config-validator would.",
    url: "https://docs.renovatebot.com/config-validation/",
  },
  globalConfig: {
    name: "global config",
    plain:
      "Bot-level settings a self-hosted Renovate administrator configures on the bot itself (config file, environment or CLI). Repos on the hosted GitHub App don't have one to worry about.",
    url: "https://docs.renovatebot.com/self-hosted-configuration/",
  },
  inheritedConfig: {
    name: "inherited config",
    plain:
      "Org-level defaults a self-hosted admin shares across repositories via the inheritConfig setting. It merges between the bot's global config and each repo's own config.",
    url: "https://docs.renovatebot.com/self-hosted-configuration/#inheritconfig",
  },
  platform: {
    name: "platform",
    plain:
      "Where your repositories are hosted — github, gitlab, and so on. Renovate uses it to resolve presets that live in other repositories on the same host (local> and owner/repo references).",
    url: "https://docs.renovatebot.com/modules/platform/",
  },
  localPreset: {
    name: "local> presets",
    plain:
      "Presets referenced as local>owner/repo (or bare owner/repo) live on the same host as the repository being processed, so resolving them needs a platform and endpoint for context.",
    url: "https://docs.renovatebot.com/config-presets/#local-presets",
  },
  packageRules: {
    name: "packageRules",
    plain:
      "Targeted overrides: each rule matches certain dependencies or updates (by name, manager, update type, …) and applies extra settings — grouping, automerge, labels — only to those.",
    url: "https://docs.renovatebot.com/configuration-options/#packagerules",
  },
  updateType: {
    name: "update types",
    plain:
      "How big a version jump an update is — major, minor, patch, pin, digest and friends. Many rules and presets branch on it.",
    url: "https://docs.renovatebot.com/configuration-options/#matchupdatetypes",
  },
  manager: {
    name: "managers",
    plain:
      "The modules that find dependencies in your repo — npm for package.json, gomod for go.mod, dockerfile, github-actions, and many more.",
    url: "https://docs.renovatebot.com/modules/manager/",
  },
  datasource: {
    name: "datasources",
    plain:
      "Where Renovate looks up available versions for a dependency — the npm registry, Docker Hub, Maven Central, GitHub releases, and so on.",
    url: "https://docs.renovatebot.com/modules/datasource/",
  },
  effectiveConfig: {
    name: "effective config",
    plain:
      "The final result after defaults, presets and your own settings are merged in order — the configuration Renovate actually acts on for your repository.",
  },
  simSourceUrl: {
    name: "sourceUrl",
    plain:
      'The DEPENDENCY\'s own source repository — e.g. "https://github.com/facebook/react" ' +
      "for the react package. This is what matchSourceUrls compares against, and is often the " +
      "only way to identify a dependency across renames or monorepo moves. It is NOT the repo " +
      "Renovate is running in — that's the repository field.",
    url: "https://docs.renovatebot.com/configuration-options/#matchsourceurls",
  },
  simRepository: {
    name: "repository",
    plain:
      'The repo Renovate is running IN — e.g. "your-org/your-repo". This is what ' +
      "matchRepositories compares against. It is NOT the dependency's own source — that's " +
      "the sourceUrl field.",
    url: "https://docs.renovatebot.com/configuration-options/#matchrepositories",
  },
  dependencyDashboard: {
    name: "Dependency Dashboard",
    plain:
      "An issue Renovate keeps open in your repo listing every pending, open and rate-limited update, with checkboxes to trigger them.",
    url: "https://docs.renovatebot.com/key-concepts/dashboard/",
  },

  // ---- roadmap 016: badge hover cards (preset tree + effective config) ----
  presetContribOpts: {
    name: "own options",
    plain:
      "Top-level config options this preset sets directly on itself — not counting packageRules, and not counting anything contributed by presets it extends.",
  },
  presetContribRules: {
    name: "own packageRules",
    plain:
      "packageRules entries this preset contributes directly. Presets it extends may contribute their own rules too, counted on their own row.",
    url: "https://docs.renovatebot.com/configuration-options/#packagerules",
  },
  presetDuplicate: {
    name: "duplicate preset",
    plain:
      'This preset also appears elsewhere in the tree. Renovate resolves each preset once and reuses ("dedupes") the result everywhere it recurs — the ×N count is every occurrence, including this one.',
  },
  presetNested: {
    name: "nested preset",
    plain:
      "Found while resolving a nested value — typically a packageRules[n].extends — rather than this parent's own top-level extends list.",
  },
  presetSourceInternal: {
    name: "internal preset",
    plain: "Bundled inside Renovate itself — no network fetch is needed to resolve it.",
  },
  presetSourceFetched: {
    name: "fetched preset",
    plain: "Downloaded from an external host at run time, rather than bundled with Renovate.",
  },
  presetRollup: {
    name: "collapsed subtree totals",
    plain:
      "Unique presets and packageRules contributed by this subtree's descendants, hidden while it is collapsed. Expand the row to see them individually.",
  },
  keyOverridden: {
    name: "overridden",
    plain:
      "Set more than once, and a later layer explicitly replaced the earlier value — by overwriting a scalar or object, or via a force override.",
  },
  keyAppended: {
    name: "appended",
    plain:
      "This option merges by concatenation: every contributing layer's list entries are appended in order. Nothing here was overridden or replaced.",
    url: "https://docs.renovatebot.com/config-presets/",
  },
  keyMerged: {
    name: "merged",
    plain:
      "Contributed by more than one layer, combined by merging objects together (a shallow or deep merge) rather than by replacing or appending.",
  },
  statPresets: {
    name: "presets",
    plain:
      "Every preset Renovate resolved while expanding your extends list, counted once even when referenced from multiple places.",
  },
  statFetched: {
    name: "fetched",
    plain: "Presets fetched over the network — from GitHub, GitLab, npm, or another host.",
  },
  statInternal: {
    name: "internal",
    plain: "Presets bundled inside Renovate itself — no network fetch needed for these.",
  },
  statOptionsSet: {
    name: "options set",
    plain:
      "Distinct top-level config keys these presets set between them (not counting packageRules).",
  },
  statRules: {
    name: "rules",
    plain:
      "packageRules entries these presets contribute directly. Your own repo config's rules aren't counted here — see the effective config's packageRules row for the full merged total.",
    url: "https://docs.renovatebot.com/configuration-options/#packagerules",
  },
  statDepth: {
    name: "depth",
    plain: "The longest chain of extends → extends → … from your config down to a leaf preset.",
  },
  statDuplicates: {
    name: "repeat occurrences",
    plain:
      "Presets referenced more than once in the tree: resolved a single time and reused everywhere else. A row's own \"duplicate ×N\" badge counts ALL of that preset's occurrences, including the first — this total counts only the repeats beyond the first.",
  },
  statErrors: {
    name: "errors",
    plain: "Presets that failed to resolve — a fetch failure, invalid content, or an aborted run.",
  },
} satisfies Record<string, GlossaryEntry>;

export type TermId = keyof typeof GLOSSARY;
