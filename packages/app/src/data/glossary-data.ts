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
  // Roadmap 045: the card covers the whole inheritConfig* family, because the
  // repo-load form now offers to fetch this layer and names the exact repo and
  // file it will read — the two options that decide those (and the strict flag
  // that decides what a missing file means) belong in the same explanation.
  inheritedConfig: {
    name: "inheritConfig",
    plain:
      "Org-level defaults a bot shares across repositories: Renovate reads inheritConfigFileName from inheritConfigRepoName (default {{parentOrg}}/renovate-config · org-inherited-config.json) and merges it between the global config and the repo's own. inheritConfigStrict decides whether a missing file aborts the run. Disabled by default — the public Mend-hosted app currently disables it too, to save API calls, with selective enablement planned — so a self-hosted config must set inheritConfig: true to use it.",
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
  // The rest of the simulator's descriptor fields. Every one is a real field
  // of Renovate's per-dependency update object, and each card says which
  // matcher (or derivation) reads it — the reason the field exists on the
  // form at all.
  simDepName: {
    name: "depName",
    plain:
      'The name as it appears in your package file, when that differs from the registry name — e.g. a Docker image written as "node" whose packageName is "library/node". ' +
      "Usually identical to packageName, which is why the form defaults it. matchDepNames compares against it.",
    url: "https://docs.renovatebot.com/configuration-options/#matchdepnames",
  },
  simPackageName: {
    name: "packageName",
    plain:
      'The name the datasource looks up on the registry, when that differs from what the package file says — "library/node" for a Docker image written as "node". ' +
      "matchPackageNames compares against it.",
    url: "https://docs.renovatebot.com/configuration-options/#matchpackagenames",
  },
  simCurrentValue: {
    name: "currentValue",
    plain:
      'The raw constraint exactly as the package file declares it — a range like "^17.0.0", or an exact pin. ' +
      "matchCurrentValue tests it as written; matchCurrentVersion resolves it to a version first.",
    url: "https://docs.renovatebot.com/configuration-options/#matchcurrentvalue",
  },
  simCurrentVersion: {
    name: "currentVersion",
    plain:
      'The exact version currently in use, when currentValue is a range — for "^4.17.20" with 4.17.21 installed, currentVersion is "4.17.21". ' +
      "matchCurrentVersion prefers it over the raw range.",
    url: "https://docs.renovatebot.com/configuration-options/#matchcurrentversion",
  },
  simDepType: {
    name: "depType",
    plain:
      'The section of the package file the dependency sits in — "dependencies" vs "devDependencies" in package.json, "project.dependencies" in pyproject.toml. ' +
      "matchDepTypes compares against it.",
    url: "https://docs.renovatebot.com/configuration-options/#matchdeptypes",
  },
  simPackageFile: {
    name: "packageFile",
    plain:
      'The path of the file the dependency was found in — "package.json", "src/App.csproj". ' +
      "matchFileNames glob-matches against it.",
    url: "https://docs.renovatebot.com/configuration-options/#matchfilenames",
  },
  simVersioning: {
    name: "versioning",
    plain:
      "The scheme used to compare versions — semver, pep440, docker, and friends. It decides what counts as major vs minor, so it also decides the derived updateType. " +
      "Leave it unset to use the manager's default.",
    url: "https://docs.renovatebot.com/modules/versioning/",
  },
  simLockedVersion: {
    name: "lockedVersion",
    plain:
      "The exact version your lockfile currently holds. Rules and range strategies that care about lockfile state read it; without a lockfile it is simply absent.",
  },
  simLockFiles: {
    name: "lockFiles",
    plain:
      'The lockfile(s) associated with the package file — e.g. "package-lock.json". Mostly informational in a simulation; some managers report it alongside the dependency.',
  },
  simRegistryUrls: {
    name: "registryUrls",
    plain:
      "The registry endpoints the datasource would query for this dependency, when they differ from the default — e.g. a private npm registry.",
    url: "https://docs.renovatebot.com/configuration-options/#registryurls",
  },
  simCategories: {
    name: "categories",
    plain:
      'The language/tooling buckets the dependency belongs to — "js", "docker", "python". matchCategories compares against them.',
    url: "https://docs.renovatebot.com/configuration-options/#matchcategories",
  },
  simBaseBranch: {
    name: "baseBranch",
    plain:
      "The branch this update targets, for configs that run against several via baseBranchPatterns. matchBaseBranches compares against it.",
    url: "https://docs.renovatebot.com/configuration-options/#matchbasebranches",
  },
  simCurrentVersionTimestamp: {
    name: "currentVersionTimestamp",
    plain:
      "When the currently-used version was released, as an ISO timestamp. matchCurrentAge turns it into the dependency's age.",
    url: "https://docs.renovatebot.com/configuration-options/#matchcurrentage",
  },
  // Replay-02 R3/R4: the rule row's own verdict chip. A rule that lost to an
  // empty simulator field is a different fact from one that mismatched real
  // data, and "no input" is short enough to sit in the row — the card is where
  // the distinction is spelled out.
  noInput: {
    name: "no input",
    plain:
      "This rule did not match, but nothing about your dependency contradicted it: a field the " +
      "rule reads is simply not set in this simulation. Renovate treats a missing value as a " +
      "non-match, so the rule would be skipped for a real dependency missing that field too. " +
      "Fill the field in the form above and re-run to see what the rule does with it.",
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
