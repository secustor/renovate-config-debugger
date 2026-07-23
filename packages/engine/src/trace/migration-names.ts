/**
 * Human-readable names and one-sentence deprecation explanations for the
 * migration steps emitted during the migrate/preset stages (004).
 *
 * Renovate's migration classes carry no user-facing copy, so this is a curated
 * map keyed by class name (custom migrations + the synthetic post-processing
 * blocks the fork of `migrateConfig` emits) or by the deprecated key (the
 * generic Rename/RemovePropertyMigration classes). Anything not covered falls
 * back to a humanized class name so a new upstream migration still reads
 * sensibly.
 */

export interface MigrationDescription {
  name: string;
  explanation?: string;
}

export interface DescribeMigrationInput {
  /** Renovate's migration class name, or a synthetic post-processing name. */
  className: string;
  /** The config key the step acted on. */
  key?: string;
  /** For rename migrations, the key the value moved to. */
  newKey?: string;
}

/** Explanations for `RenamePropertyMigration`, keyed by the deprecated key. */
const RENAME_EXPLANATIONS: Record<string, string> = {
  versionScheme: "Renamed to `versioning` — the option selects the versioning scheme for updates.",
  endpoints: "Renamed to `hostRules` — per-host credentials and settings now live in one array.",
  baseBranches:
    "Renamed to `baseBranchPatterns` — the option accepts glob/regex patterns, so the plural name was clarified.",
  regexManagers:
    "Renamed to `customManagers` — custom managers are no longer limited to the regex strategy.",
  aliases: "Renamed to `registryAliases` to make its purpose (registry URL aliases) explicit.",
  masterIssue: "Renamed to `dependencyDashboard` along with the rest of the dashboard options.",
  separatePatchReleases: "Renamed to `separateMinorPatch`.",
  multipleMajorPrs: "Renamed to `separateMultipleMajor`.",
  excludedPackageNames: "Renamed to `excludePackageNames` for naming consistency.",
  exposeEnv: "Renamed to `exposeAllEnv`.",
};

/** Explanations keyed by migration class name (custom + post-processing). */
const CLASS_EXPLANATIONS: Record<string, string> = {
  BinarySourceMigration: 'The `binarySource: "auto"` value was renamed to `"global"`.',
  SemanticCommitsMigration:
    "`semanticCommits` is now an enum (`enabled` / `disabled` / `auto`) rather than a boolean.",
  SemanticPrefixMigration:
    "`semanticPrefix` is split into the structured `semanticCommitType` / `semanticCommitScope` options.",
  ScheduleMigration: "Legacy schedule strings are normalized to Renovate's supported syntax.",
  AzureGitLabAutomergeMigration:
    "`gitLabAutomerge` / `azureAutoComplete` are replaced by the platform-neutral `platformAutomerge`.",
  PlatformCommitMigration: "`platformCommit` became an enum (`auto` / `enabled` / `disabled`).",
  BaseBranchMigration: "`baseBranch` (singular) is folded into the `baseBranchPatterns` array.",
  PackageRulesMigration:
    "Legacy packageRules matchers (`packageNames`, `packagePatterns`, `languages`, `paths`, …) are renamed to their `match*` equivalents.",
  PackageNameMigration: "`packageName` is replaced by the array-valued `packageNames`.",
  PackagePatternMigration: "`packagePattern` is replaced by the array-valued `packagePatterns`.",
  PackagesMigration: "The top-level `packages` array is folded into `packageRules`.",
  AutomergeMigration:
    'The old `automerge: "minor" | "patch" | "any"` values expand into explicit per-update-type rules.',
  MatchManagersMigration: "Manager names in `matchManagers` are updated to their current spelling.",
  CustomManagersMigration: "`customType` is defaulted to `regex` on each custom manager entry.",
  MatchDatasourcesMigration:
    "Datasource ids in `matchDatasources` are updated to their current names.",
  DatasourceMigration: "The `datasource` id is updated to its current name.",
  NodeMigration: "The legacy `node` config block is normalized.",
  HostRulesMigration:
    "`hostRules` entries are updated to the current `matchHost` / credentials shape.",
  FileMatchMigration: "`fileMatch` is renamed to `managerFilePatterns`.",
  StabilityDaysMigration: "`stabilityDays` is replaced by `minimumReleaseAge`.",
  ExtendsMigration: "`extends` preset names are normalized to their current form.",
  // Synthetic post-processing blocks emitted by the forked migrateConfig.
  LanguagePackageRules:
    "A top-level language block (docker, python, …) is promoted into a `matchCategories` packageRule.",
  FlattenNestedPackageRules:
    "Nested `packageRules` inside a packageRule are flattened into one list.",
  TemplateRewrite:
    "Deprecated template placeholders (`{{baseDir}}`, `{{lookupName}}`, …) are rewritten to their current names.",
  PipCompileFilePatterns: "pip-compile `managerFilePatterns` are rewritten from `.in` to `.txt`.",
  GradleLiteMerge: "The removed `gradle-lite` config block is merged into `gradle`.",
  GradleLiteManager: "`gradle-lite` in `matchManagers` is replaced by `gradle`.",
  OptionTypeCoercion:
    "The value is coerced to the option's declared type (e.g. a boolean under an object option becomes `{ enabled: … }`).",
};

/** Friendly labels for the synthetic post-processing steps. */
const POST_LABELS: Record<string, string> = {
  LanguagePackageRules: "Language block → packageRules",
  FlattenNestedPackageRules: "Flatten nested packageRules",
  TemplateRewrite: "Template placeholder rewrite",
  OptionTypeCoercion: "Normalize option value type",
  PipCompileFilePatterns: "pip-compile file patterns",
  GradleLiteMerge: "gradle-lite → gradle",
  GradleLiteManager: "gradle-lite → gradle (manager)",
};

/** Turn `PackageNameMigration` into `Package name`. */
function humanize(className: string): string {
  const base = className.replace(/Migration$/, "");
  const spaced = base.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function describeMigration(input: DescribeMigrationInput): MigrationDescription {
  const { className, key, newKey } = input;

  if (className === "RenamePropertyMigration" && key) {
    return {
      name: newKey ? `${key} → ${newKey}` : `Rename ${key}`,
      explanation:
        RENAME_EXPLANATIONS[key] ??
        (newKey ? `Renamed to \`${newKey}\`.` : "Renamed to its current option name."),
    };
  }

  if (className === "RemovePropertyMigration" && key) {
    return {
      name: `Remove ${key}`,
      explanation: `\`${key}\` was removed from Renovate and no longer has any effect.`,
    };
  }

  if (POST_LABELS[className]) {
    return { name: POST_LABELS[className], explanation: CLASS_EXPLANATIONS[className] };
  }

  const explanation = CLASS_EXPLANATIONS[className];
  const label = humanize(className);
  return {
    name: key ? `${label} (${key})` : label,
    explanation,
  };
}
