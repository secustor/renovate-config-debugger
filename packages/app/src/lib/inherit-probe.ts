/**
 * Roadmap 045 — where the inherited-config probe looks, derived the way a real
 * `inheritConfig` run derives it.
 *
 * Upstream (renovate/dist/workers/repository/init/inherited.js) compiles
 * `inheritConfigRepoName` as a template against `{ parentOrg, topLevelOrg,
 * repository }` and reads `inheritConfigFileName` out of the result. The
 * template variables come from the repository slug alone
 * (workers/global/index.js): `parentOrg` is the slug minus its last segment
 * (so a GitLab subgroup path keeps its subgroup), `topLevelOrg` is its first
 * segment. That is the whole derivation — which is why it lives here as pure
 * functions the form and the probe both read, rather than inside a component.
 *
 * Everything in this module is display-or-target derivation only. The fetch
 * itself is `loadRepoFile` (run.ts → the engine's `fetchRepoFile`), and the 008
 * pipeline that consumes the filled layer is untouched.
 */
import { isString } from "@renovate-config-debugger/engine/is";
import { isHostSegment, stripRepoSuffix } from "./repo-reference";

/** `inheritConfigRepoName`'s default, verbatim from the pinned Renovate. */
export const INHERIT_REPO_TEMPLATE = "{{parentOrg}}/renovate-config";
/** `inheritConfigFileName`'s default, verbatim from the pinned Renovate. */
export const INHERIT_FILE_DEFAULT = "org-inherited-config.json";

/** The template variables upstream exposes to `inheritConfigRepoName`. */
export interface InheritTemplateVars {
  /** The repo slug minus its last segment (`group/sub/repo` → `group/sub`). */
  parentOrg: string;
  /** The slug's first segment. */
  topLevelOrg: string;
  /** The full repo slug. */
  repository: string;
}

/**
 * The repo SLUG in a liberally-written reference — the same shapes the repo
 * field accepts (`owner/repo`, `github.com/owner/repo`, a full URL, scp-style),
 * but tolerant of a half-typed one so the prefilled fields can track the owner
 * live instead of appearing only once the reference is complete.
 *
 * A first segment containing a dot is a host, never an owner (owners cannot
 * contain dots on any supported host) — literally the same heuristic
 * `parseRepoReference` uses for a complete reference, imported rather than
 * restated.
 */
export function repoSlugOf(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const scp = /^git@[^:]+:(.+)$/.exec(trimmed);
  const withoutHost = scp?.[1] ?? trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*\/?/i, "");
  const segments = stripRepoSuffix(withoutHost)
    .split("/")
    .filter((segment) => segment !== "");
  if (isHostSegment(segments[0])) {
    segments.shift();
  }
  return segments.join("/");
}

/** The template variables for a repo reference; empty strings when unknown. */
export function templateVarsFor(raw: string): InheritTemplateVars {
  const repository = repoSlugOf(raw);
  const segments = repository === "" ? [] : repository.split("/");
  const parent = segments.slice(0, -1);
  return {
    repository,
    parentOrg: parent.join("/"),
    topLevelOrg: parent[0] ?? "",
  };
}

/**
 * Compiles the `{{parentOrg}}`/`{{topLevelOrg}}`/`{{repository}}` placeholders
 * a `inheritConfigRepoName` may carry. A variable that is not known yet is left
 * standing rather than substituted with nothing: while the repo field holds only
 * `my-org` there is no parent org, and showing `/renovate-config` would name a
 * repository that cannot exist. Nothing else about Handlebars is supported —
 * upstream allows more, but a probe target is one slug.
 */
export function compileInheritTemplate(template: string, vars: InheritTemplateVars): string {
  return template.replace(
    /\{\{\s*(parentOrg|topLevelOrg|repository)\s*\}\}/g,
    (match, name: string) => {
      const value = vars[name as keyof InheritTemplateVars];
      return value === "" ? match : value;
    },
  );
}

/** A pasted global config's `inheritConfig*` family, as far as it matters here. */
export interface InheritPolicy {
  /** `inheritConfigRepoName`, when the global config sets one. */
  repoOverride?: string;
  /** `inheritConfigFileName`, when the global config sets one. */
  fileOverride?: string;
  /** `inheritConfig: false` — explicitly OFF, so a real run under this global
   *  config would not apply the layer at all. Worth a warning because it
   *  overrides the option's own default (`false`, same as this app's
   *  checkbox) — see `explicitlyEnabled` for the opposite override. */
  explicitlyDisabled: boolean;
  /** `inheritConfig: true` — explicitly ON. Corrected 2026-07-26: the option
   *  defaults to `false` and the Mend-hosted app currently disables it too
   *  (self-hosted-configuration docs, #inheritconfig — enabling it there would
   *  cost "millions of API calls per week" until a smarter approach ships), so
   *  the repo-load form's checkbox is off by default and auto-checks only when
   *  a pasted global config sets this explicitly. */
  explicitlyEnabled: boolean;
  /** `inheritConfigStrict: true` — a missing file aborts a real run. */
  strict: boolean;
}

function stringOption(config: Record<string, unknown> | null, key: string): string | undefined {
  const value = config?.[key];
  return isString(value) && value.trim() !== "" ? value.trim() : undefined;
}

/** Reads the `inheritConfig*` family out of the pasted global config layer. */
export function inheritPolicyOf(globalConfig: Record<string, unknown> | null): InheritPolicy {
  const repoOverride = stringOption(globalConfig, "inheritConfigRepoName");
  const fileOverride = stringOption(globalConfig, "inheritConfigFileName");
  return {
    ...(repoOverride ? { repoOverride } : {}),
    ...(fileOverride ? { fileOverride } : {}),
    explicitlyDisabled: globalConfig?.inheritConfig === false,
    explicitlyEnabled: globalConfig?.inheritConfig === true,
    strict: globalConfig?.inheritConfigStrict === true,
  };
}

/** A probe target: the repository holding the inherited config, and the file. */
export interface InheritTarget {
  repo: string;
  file: string;
}

/** The form's own state for the two fields: `null` = still tracking the
 *  derivation, a string = the user owns this field. */
export interface InheritFieldEdits {
  repo: string | null;
  file: string | null;
}

/**
 * What the two fields SHOW. An untouched field tracks the derivation live — the
 * owner as it is being typed, or the pasted global config's override — and an
 * edited one keeps whatever the user put there. Clearing an edited field hands
 * it back to the derivation (the empty string is never a target, so it can only
 * mean "go back to the default").
 */
export function inheritFieldValues(args: {
  /** The repo field's raw text (any accepted reference shape, or partial). */
  repoInput: string;
  globalConfig: Record<string, unknown> | null;
  edits: InheritFieldEdits;
}): InheritTarget {
  const { repoOverride, fileOverride } = inheritPolicyOf(args.globalConfig);
  const tracked = compileInheritTemplate(
    repoOverride ?? INHERIT_REPO_TEMPLATE,
    templateVarsFor(args.repoInput),
  );
  return {
    repo: args.edits.repo ?? tracked,
    file: args.edits.file ?? fileOverride ?? INHERIT_FILE_DEFAULT,
  };
}

/**
 * The exact file to fetch, from the values on screen and the repo that was
 * actually loaded. The displayed repo is compiled again here because a field the
 * user owns may itself hold a template (an org that customized
 * `inheritConfigRepoName` typically keeps `{{parentOrg}}` in it), and because
 * the reference that was loaded is the authority for the owner — not whatever
 * the field was tracking mid-keystroke.
 */
export function inheritProbeTarget(fields: InheritTarget, loadedRepo: string): InheritTarget {
  return {
    repo: compileInheritTemplate(fields.repo.trim(), templateVarsFor(loadedRepo)),
    file: fields.file.trim(),
  };
}

/** Whether a target is complete enough to fetch — an uncompiled placeholder is
 *  not a repository, and neither is an empty field. */
export function isProbeTargetResolved(target: InheritTarget): boolean {
  return (
    target.repo !== "" &&
    target.file !== "" &&
    !target.repo.includes("{{") &&
    !target.file.includes("{{")
  );
}

/** What one probe did. `unreachable` is a transport failure (CORS, auth, rate
 *  limit) — deliberately NOT the same thing as the file being absent. */
export type InheritProbeOutcome =
  | { status: "loaded"; target: InheritTarget }
  | { status: "missing"; target: InheritTarget }
  | { status: "unreachable"; target: InheritTarget; detail: string };

/**
 * The three states the inherited-config layer can land in after a probe
 * (mockup 045 section 2), as data:
 *
 * - `auto-loaded` (2a) — filled, labeled with its origin. `disabledByGlobal`
 *   (2c) additionally says a run under the PASTED global config would not apply
 *   it: `inheritConfig` defaults to false (and, corrected 2026-07-26, so does
 *   the checkbox above — the Mend-hosted app disables it too), so only an
 *   explicit `false` is worth warning about.
 * - `missing` (2b) — nothing there. With `inheritConfigStrict` off (the
 *   default) that is exactly what a real run tolerates; with it on, a real run
 *   aborts, so the layer reports that instead of a quiet note.
 * - `unreachable` — the host refused the request. Same strict distinction:
 *   upstream aborts on any inherited-config FETCH error when strict.
 *
 * Derived rather than stored so a global config pasted (or edited) after the
 * probe re-frames the same outcome immediately.
 */
export type InheritLayerState =
  | { kind: "auto-loaded"; target: InheritTarget; disabledByGlobal: boolean }
  | { kind: "missing"; target: InheritTarget; strict: boolean }
  | { kind: "unreachable"; target: InheritTarget; detail: string; strict: boolean };

export function inheritLayerState(
  probe: InheritProbeOutcome | null,
  policy: InheritPolicy,
): InheritLayerState | null {
  if (!probe) {
    return null;
  }
  if (probe.status === "loaded") {
    return {
      kind: "auto-loaded",
      target: probe.target,
      disabledByGlobal: policy.explicitlyDisabled,
    };
  }
  if (probe.status === "missing") {
    return { kind: "missing", target: probe.target, strict: policy.strict };
  }
  return {
    kind: "unreachable",
    target: probe.target,
    detail: probe.detail,
    strict: policy.strict,
  };
}
