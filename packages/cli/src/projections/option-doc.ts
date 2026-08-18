import {
  type OptionDoc,
  type OptionPlacement,
  type OptionRequiredIf,
  optionsSourceUrl,
  PATTERN_MATCHING_NOTE,
  REQUIRED_IF_NOTE,
} from "@renovate-config-debugger/engine";

/**
 * One option, rendered — shared by `rcd docs` and (through the same doc) kept
 * in step with `get_option_docs`.
 *
 * Roadmap 072. The engine forwards every fact Renovate's option table carries;
 * the failure mode this module exists to prevent is a fact reaching JSON and
 * silently never reaching the reader, which is what happened to `isContainer`
 * and to "this option may appear anywhere". So every flag on `OptionDoc` gets
 * a line here, and `option-doc.test.ts` sweeps all 485 options asserting it.
 *
 * Truncation lives HERE, never in the engine: `enabled` declares 129 parents
 * and `managerFilePatterns` 117, so the pretty rendering has to cut while
 * `--format json` keeps everything.
 */

/** Names printed in full before the list is cut. */
const MAX_NAMES = 8;

function nameList(names: readonly string[]): string {
  if (names.length <= MAX_NAMES) {
    return names.join(", ");
  }
  const shown = names.slice(0, MAX_NAMES).join(", ");
  return `${shown} (+${names.length - MAX_NAMES} more; --format json for all)`;
}

function placementLine(placement: OptionPlacement): string {
  if (placement.kind === "unrestricted") {
    return "placement: no restriction — valid at the top level and inside any container object";
  }
  if (placement.parents.length === 0) {
    return placement.topLevel
      ? "placement: the top level only"
      : "placement: restricted, but Renovate's option table names no parent";
  }
  const inside = `inside ${nameList(placement.parents)}`;
  return placement.topLevel
    ? `placement: the top level, or ${inside}`
    : `placement: only ${inside}`;
}

function requiredIfClause(clause: OptionRequiredIf): string {
  return clause.siblingProperties
    .map((p) => `${p.property} = ${JSON.stringify(p.value)}`)
    .join(" and ");
}

/**
 * Every line of the pretty rendering of one option, header and citation
 * included — the caller only picks the format and emits.
 */
export function optionDocLines(doc: OptionDoc, renovateVersion: string): string[] {
  const subType = doc.subType ? ` of ${doc.subType}` : "";
  return [
    `${doc.name} (${doc.type}${subType}) — Renovate ${renovateVersion}`,
    "",
    doc.description,
    ...(doc.default === undefined ? [] : [`default: ${JSON.stringify(doc.default)}`]),
    ...(doc.allowedValues ? [`allowed: ${doc.allowedValues.join(", ")}`] : []),
    ...(doc.format ? [`format: ${doc.format} — the value must be a valid regular expression`] : []),
    placementLine(doc.placement),
    ...(doc.childOptions
      ? [
          `container: ${doc.childOptions.length} options are restricted to it — ${nameList(doc.childOptions)}`,
          "           any option with no placement restriction may also appear here",
        ]
      : []),
    ...(doc.patternMatch ? [`patterns: ${PATTERN_MATCHING_NOTE}`] : []),
    ...(doc.supportsTemplating
      ? ["templating: supported — https://docs.renovatebot.com/templates/"]
      : []),
    ...(doc.allowNegative ? ["negative integers: allowed"] : []),
    ...(doc.allowString
      ? ["string shorthand: a bare string is massaged into a one-element array"]
      : []),
    ...(doc.freeChoice
      ? ["children not validated (freeChoice) — a typo inside is never flagged"]
      : []),
    ...(doc.mergeable ? ["mergeable: preset and repo values merge rather than replace"] : []),
    ...(doc.inheritConfigSupport ? ["inheritable: settable in the inherited config"] : []),
    ...(doc.requiredIf
      ? [
          `required when: ${doc.requiredIf.map(requiredIfClause).join(" or ")} (${REQUIRED_IF_NOTE})`,
        ]
      : []),
    ...(doc.stage
      ? [
          `stage: ${doc.stage} — dropped from the config once Renovate passes its \`${doc.stage}\` stage`,
        ]
      : []),
    ...(doc.globalOnly ? ["self-hosted (global) config only"] : []),
    ...(doc.experimental
      ? [
          `experimental: ${doc.experimentalDescription ?? "yes"}${
            doc.experimentalIssueUrls?.length
              ? ` (tracking: ${doc.experimentalIssueUrls.join(", ")})`
              : ""
          }`,
        ]
      : []),
    ...(doc.deprecationMsg ? [`deprecated: ${doc.deprecationMsg}`] : []),
    "",
    doc.url,
    `option table: ${optionsSourceUrl}`,
  ];
}
