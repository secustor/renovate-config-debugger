import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ClauseEvaluation,
  ConfigKeyDelta,
  DependencyDescriptor,
  MergedKey,
  ProvenanceLayer,
  RuleAttribution,
  RuleEvaluation,
  RuleRef,
  SimulationComparison,
  SimulationResult,
  TraceResult,
} from "@renovate-config-visualizer/engine";
import { Term } from "../glossary";
import { OptionKey } from "../option-docs";
import { useRuleProvenance } from "../rule-provenance";
import { RuleFramingText } from "../rule-framing";
import type { ErrorTranslationLib } from "../run";
import type { ShareSimulator } from "../share";
import { ConfigJson } from "./ConfigJson";
import { CopyMarkdownButton } from "./CopyMarkdownButton";
import { ErrorTranslationView } from "./ErrorTranslationView";
import { ProvenanceChip } from "./ProvenanceChip";
import { RuleMessage } from "./RuleMessage";

/** Roadmap 018: a share link's simulator inputs, applied to the form once. */
interface SimRequest {
  form: Record<string, string>;
  autoSimulate: boolean;
  nonce: number;
}

/**
 * Roadmap 006: the packageRules simulator. Describe a hypothetical dependency
 * update and see which of the CURRENT run's `finalConfig.packageRules` match
 * — rule by rule, clause by clause, with the config each matching rule
 * merges — plus the final per-dependency config Renovate would use.
 * Evaluation is on demand (Simulate button; quick-fill presets also run) via
 * the engine's `simulatePackageRules`, loaded through the same dynamic import
 * that keeps the renovate chunk out of the initial bundle.
 */

interface FormState {
  manager: string;
  datasource: string;
  packageName: string;
  depName: string;
  depType: string;
  packageFile: string;
  currentValue: string;
  currentVersion: string;
  newValue: string;
  updateType: string;
  lockedVersion: string;
  lockFiles: string;
  versioning: string;
  sourceUrl: string;
  registryUrls: string;
  categories: string;
  repository: string;
  baseBranch: string;
  currentVersionTimestamp: string;
}

const EMPTY_FORM: FormState = {
  manager: "",
  datasource: "",
  packageName: "",
  depName: "",
  depType: "",
  packageFile: "",
  currentValue: "",
  currentVersion: "",
  newValue: "",
  updateType: "",
  lockedVersion: "",
  lockFiles: "",
  versioning: "",
  sourceUrl: "",
  registryUrls: "",
  categories: "",
  repository: "",
  baseBranch: "",
  currentVersionTimestamp: "",
};

const UPDATE_TYPES = [
  "major",
  "minor",
  "patch",
  "pin",
  "digest",
  "lockFileMaintenance",
  "rollback",
  "replacement",
  "bump",
];

/** Quick-fill presets for common dependency shapes. */
const QUICK_FILLS: { label: string; fill: Partial<FormState> }[] = [
  {
    label: "npm dependency",
    fill: {
      manager: "npm",
      datasource: "npm",
      packageFile: "package.json",
      packageName: "lodash",
      depType: "dependencies",
      currentValue: "4.17.20",
      newValue: "4.17.21",
      updateType: "patch",
    },
  },
  {
    label: "Dockerfile image",
    fill: {
      manager: "dockerfile",
      datasource: "docker",
      packageFile: "Dockerfile",
      packageName: "node",
      currentValue: "20-alpine",
      newValue: "22-alpine",
      updateType: "major",
    },
  },
  {
    label: "GitHub Action",
    fill: {
      manager: "github-actions",
      datasource: "github-tags",
      packageFile: ".github/workflows/ci.yml",
      packageName: "actions/checkout",
      currentValue: "v4",
      newValue: "v5",
      updateType: "major",
    },
  },
  {
    label: "pep621 / pip",
    fill: {
      manager: "pep621",
      datasource: "pypi",
      packageFile: "pyproject.toml",
      packageName: "requests",
      depType: "project.dependencies",
      currentValue: "2.31.0",
      newValue: "2.32.0",
      updateType: "minor",
    },
  },
  {
    // Roadmap 015: Azure DevOps / .NET users had no chip that matched their
    // stack.
    label: "nuget",
    fill: {
      manager: "nuget",
      datasource: "nuget",
      packageFile: "src/App.csproj",
      packageName: "Newtonsoft.Json",
      currentValue: "13.0.1",
      newValue: "13.0.3",
      updateType: "patch",
      versioning: "nuget",
    },
  },
];

function trimmed(value: string): string | undefined {
  const t = value.trim();
  return t === "" ? undefined : t;
}

function list(value: string): string[] | undefined {
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return items.length > 0 ? items : undefined;
}

/**
 * @param effectiveUpdateType Roadmap 015: the updateType to actually send —
 * the derived value when the user hasn't manually overridden the select,
 * `form.updateType` otherwise. Defaults to `form.updateType` so callers that
 * only need e.g. the empty-form check don't have to compute derivation.
 */
function toDescriptor(form: FormState, effectiveUpdateType?: string): DependencyDescriptor {
  // "bump" is a real Renovate updateType, but matchUpdateTypes only sees it
  // via the isBump flag on in-range updates — set both.
  const updateType = trimmed(effectiveUpdateType ?? form.updateType);
  return {
    manager: trimmed(form.manager),
    datasource: trimmed(form.datasource),
    packageName: trimmed(form.packageName),
    depName: trimmed(form.depName),
    depType: trimmed(form.depType),
    packageFile: trimmed(form.packageFile),
    currentValue: trimmed(form.currentValue),
    currentVersion: trimmed(form.currentVersion),
    newValue: trimmed(form.newValue),
    updateType,
    ...(updateType === "bump" ? { isBump: true } : {}),
    lockedVersion: trimmed(form.lockedVersion),
    lockFiles: list(form.lockFiles),
    versioning: trimmed(form.versioning),
    sourceUrl: trimmed(form.sourceUrl),
    registryUrls: list(form.registryUrls),
    categories: list(form.categories),
    repository: trimmed(form.repository),
    baseBranch: trimmed(form.baseBranch),
    currentVersionTimestamp: trimmed(form.currentVersionTimestamp),
  };
}

/**
 * Roadmap 015: an empty-form guard. True once ANY descriptor field carries a
 * value — a form with nothing filled in is guaranteed to match nothing, and
 * running it just renders hundreds of "no match" rows with no explanation.
 */
function hasMeaningfulInput(form: FormState): boolean {
  return Object.values(toDescriptor(form)).some((v) => v !== undefined);
}

function previewValue(value: unknown, max = 60): string {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Untruncated JSON rendering for copy-as-markdown export. */
function fullValue(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

/** Roadmap 018: a matched rule's applied keys as `key: before → after` lines. */
function ruleAppliedMarkdown(merged: MergedKey[]): string {
  return merged
    .map((m) =>
      "before" in m
        ? `${m.key}: ${fullValue(m.before)} → ${fullValue(m.after)}`
        : `${m.key}: ${fullValue(m.after)}`,
    )
    .join("\n");
}

function inputsPreview(clause: ClauseEvaluation): string {
  return Object.entries(clause.inputValues)
    .map(([key, value]) => `${key} = ${previewValue(value, 40)}`)
    .join(", ");
}

function clauseIcon(state: ClauseEvaluation["state"]): string {
  if (state === "matched") {
    return "✓";
  }
  if (state === "no-match" || state === "error") {
    return "✗";
  }
  // no-input — evaluated to a real fail-closed `false` (see clauseExplanation),
  // but flagged rather than a plain ✗ since the cause is a missing input, not
  // a genuine mismatch against a value. not-applicable / not-simulated — the
  // matcher never produced a true-or-false verdict at all.
  return "⚠";
}

/**
 * Roadmap 018/022: the clause row's right-hand explanation, precise about WHY
 * a clause did not match — a genuine mismatch names the input it compared
 * ("no match against sourceUrl = …"); a fail-closed clause states the actual
 * verdict and its cause ("evaluated false — the simulated dependency has no
 * sourceUrl (Renovate treats a missing value as a non-match)", from the
 * engine's note) rather than reading like the clause was never evaluated; a
 * null-returning matcher reads "not applicable (skipped)".
 */
function clauseExplanation(clause: ClauseEvaluation): string {
  const hasInputs = Object.keys(clause.inputValues).length > 0;
  switch (clause.state) {
    case "matched":
      return hasInputs ? `matched (${inputsPreview(clause)})` : "matched";
    case "no-match":
      return hasInputs ? `no match against ${inputsPreview(clause)}` : "no match";
    case "no-input":
      return (
        clause.note ??
        "evaluated false — required input not set on the simulated dependency (Renovate treats a missing value as a non-match)"
      );
    case "not-applicable":
      return clause.note ?? "not applicable (skipped)";
    default:
      return clause.note ?? clause.state;
  }
}

const VERDICT_LABEL: Record<RuleEvaluation["verdict"], string> = {
  matched: "matched",
  "no-match": "no match",
  "not-simulated": "not simulated",
};

/** A config value in a plain-language sentence: `[a, b]`, `"x"`, `42`. */
function plainValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ")}]`;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

/** Oxford-comma join for the verdict sentence's clause lists. */
function joinClauses(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** Renovate's default `schedule` value — "unrestricted", not a real limit
 *  (upstream `config/options/index.ts`: `default: ['at any time']`). It
 *  survives onto `finalDependencyConfig` whenever no rule set a real
 *  schedule, so treating it as one of the update's clauses would quote a
 *  no-op as if it were a restriction. */
function isNoopSchedule(schedule: unknown[]): boolean {
  return schedule.length === 1 && schedule[0] === "at any time";
}

/**
 * Roadmap 013/022: which matched rule turned `automerge: true` on inside a
 * given update-type block (e.g. `minor`), and — only when it's unambiguous —
 * the preset that rule came from, for the verdict sentence's "from
 * `:automergeMinor`" attribution. Best-effort from data the simulator and
 * `computeRuleProvenance` already compute; no new provenance tracking.
 */
function automergeScopeSource(
  sim: SimulationResult,
  updateType: string,
  ruleAttribution: RuleAttribution[] | null | undefined,
): string | undefined {
  const rule = sim.rules.find(
    (r) =>
      r.verdict === "matched" &&
      r.merged?.some(
        (m) =>
          m.key === updateType &&
          typeof m.after === "object" &&
          m.after !== null &&
          !Array.isArray(m.after) &&
          (m.after as Record<string, unknown>).automerge === true,
      ),
  );
  if (!rule) {
    return undefined;
  }
  const attribution = ruleAttribution?.find((a) => a.index === rule.index);
  return attribution?.layer.kind === "preset" ? attribution.layer.name : undefined;
}

/**
 * The plain-language outcome sentence (roadmap 012). Covers the high-signal
 * options — enabled/skipReason, automerge (with update-type scoping and,
 * when known, its source preset), labels, grouping, schedule — splitting
 * them into what the update WOULD and would NOT get, e.g. "This major update
 * WOULD get labels [deploy_pr] and auto-approval, but would NOT automerge
 * (automerge is scoped to minor/patch — from `:automergeMinor`)". Roadmap
 * 022: no-op clauses (an empty label list, the default unrestricted
 * schedule) are left out entirely rather than quoted as if they meant
 * something, so the sentence stays quotable verbatim.
 */
function buildVerdictSentence(
  sim: SimulationResult,
  updateType: string | undefined,
  changedKeys: string[],
  ruleAttribution: RuleAttribution[] | null | undefined,
): string {
  const c = sim.finalDependencyConfig;
  const subject = `This ${updateType ? `${updateType} ` : ""}update`;
  const changed = new Set(changedKeys);
  const positives: string[] = [];
  const negatives: string[] = [];

  // Strongest signal first: will the PR even be raised?
  const skipReason = typeof c.skipReason === "string" ? c.skipReason : undefined;
  if (c.enabled === false || skipReason !== undefined) {
    negatives.push(
      skipReason ? `be raised at all (skipReason: ${skipReason})` : "be raised (disabled)",
    );
  }

  // automerge, aware of update-type scoping (the flattened blocks).
  const scopedAutomerge = Object.entries(sim.flattened.blocks)
    .filter(([, block]) => block?.automerge === true)
    .map(([type]) => type);
  if (c.automerge === true) {
    positives.push("automerge");
  } else if (scopedAutomerge.length > 0) {
    const sources = scopedAutomerge.map((type) => automergeScopeSource(sim, type, ruleAttribution));
    // Only cite a source when every scoped type traces to the SAME preset —
    // a mixed or unknown provenance is left uncredited rather than guessed.
    const source = sources.every((s) => s !== undefined && s === sources[0])
      ? sources[0]
      : undefined;
    negatives.push(
      `automerge (automerge is scoped to ${scopedAutomerge.join("/")}${source ? ` — from \`${source}\`` : ""})`,
    );
  } else if (c.automerge === false && changed.has("automerge")) {
    negatives.push("automerge");
  }

  if (Array.isArray(c.labels) && c.labels.length > 0) {
    positives.push(`get labels ${plainValue(c.labels)}`);
  }
  if (Array.isArray(c.addLabels) && c.addLabels.length > 0) {
    positives.push(`add labels ${plainValue(c.addLabels)}`);
  }
  if (c.autoApprove === true) {
    positives.push("auto-approval");
  }
  if (typeof c.groupName === "string" && c.groupName.length > 0) {
    positives.push(`be grouped as "${c.groupName}"`);
  }
  if (Array.isArray(c.schedule) && c.schedule.length > 0 && !isNoopSchedule(c.schedule)) {
    positives.push(`only run on schedule ${plainValue(c.schedule)}`);
  }

  const parts: string[] = [];
  if (positives.length > 0) {
    parts.push(`WOULD ${joinClauses(positives)}`);
  }
  if (negatives.length > 0) {
    parts.push(`would NOT ${joinClauses(negatives)}`);
  }
  if (parts.length === 0) {
    return `${subject} gets no special handling from your matched rules — the defaults apply.`;
  }
  return `${subject} ${parts.join(", but ")}.`;
}

/**
 * Roadmap 013: label lists EVERY `match*` / `exclude*` clause the rule
 * carries, and names the one that decided a no-match verdict — e.g.
 * `matchSourceUrls + matchUpdateTypes — failed on matchSourceUrls`. A caption
 * with only the first clause plus a bare "no match" reads as broken when that
 * first clause actually matched and a LATER one is what failed it.
 */
function ruleLabel(rule: RuleEvaluation): string {
  if (rule.clauses.length === 0) {
    return "no match* selectors";
  }
  const joined = rule.clauses.map((c) => c.key).join(" + ");
  // no-input (fail-closed: the dependency lacks the field) fails the rule just
  // like a genuine no-match, so it counts as the deciding clause here too.
  const failing = rule.clauses.find(
    (c) => c.state === "no-match" || c.state === "no-input" || c.state === "error",
  );
  return failing ? `${joined} — failed on ${failing.key}` : joined;
}

function RuleRow({
  rule,
  layer,
  onSelectPreset,
}: {
  rule: RuleEvaluation;
  layer?: ProvenanceLayer;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div id={`sim-rule-${rule.index}`} className={`sim-rule${expanded ? " expanded" : ""}`}>
      <button
        type="button"
        className="sim-rule-head"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="caret">{expanded ? "▾" : "▸"}</span>
        {/* Roadmap 013: canonical form — the SAME text a validator message and
            the editor cross-link use, so this row is unmistakably the same
            rule as "packageRules[N]" elsewhere on the page. */}
        <span className="sim-rule-index">packageRules[{rule.index}]</span>
        <span className="sim-rule-label">{ruleLabel(rule)}</span>
        <span className={`badge sim-verdict verdict-${rule.verdict}`}>
          {VERDICT_LABEL[rule.verdict]}
        </span>
        {layer ? (
          <span className="sim-rule-provenance">
            <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} />
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="sim-rule-detail">
          {rule.clauses.length === 0 ? (
            <p className="empty-note">No match* clauses — the rule applies to everything.</p>
          ) : (
            <ul className="sim-clauses">
              {rule.clauses.map((clause) => (
                <li key={clause.key} className={`sim-clause state-${clause.state}`}>
                  <span className="sim-clause-icon">{clauseIcon(clause.state)}</span>
                  <span className="sim-clause-text">
                    <code>{clause.key}</code>: {previewValue(clause.value, 60)} —{" "}
                    {clauseExplanation(clause)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {rule.notes.map((note) => (
            <p key={note} className="sim-note">
              {note}
            </p>
          ))}
          {rule.merged && rule.merged.length > 0 ? (
            <div className="sim-merged">
              <div className="sim-merged-title">
                Applied to the dependency config
                <CopyMarkdownButton
                  className="inline"
                  header={`\`packageRules[${rule.index}]\` ${ruleLabel(rule)} — ${VERDICT_LABEL[rule.verdict]}`}
                  code={ruleAppliedMarkdown(rule.merged)}
                />
              </div>
              <ul>
                {rule.merged.map((m) => (
                  <li key={m.key}>
                    <span className="sim-merged-key">
                      <OptionKey name={m.key} flagUnknown />
                    </span>
                    {"before" in m ? (
                      <>
                        {" "}
                        <span className="sim-merged-before">{previewValue(m.before)}</span> →{" "}
                      </>
                    ) : (
                      " → "
                    )}
                    <span className="sim-merged-after">{previewValue(m.after)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Roadmap 021: the fields two descriptors disagree on, sorted for a stable
 * warning message. Compared via JSON so array-valued fields (lockFiles,
 * registryUrls, categories) and the `isBump` flag (only present when
 * updateType is "bump") are handled the same as everywhere else in this file.
 */
function descriptorDiffKeys(a: DependencyDescriptor, b: DependencyDescriptor): string[] {
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  const diffs: string[] = [];
  for (const key of keys) {
    const av = (a as Record<string, unknown>)[key];
    const bv = (b as Record<string, unknown>)[key];
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      diffs.push(key);
    }
  }
  return diffs.toSorted();
}

/** Roadmap 021: one column ("A (pinned)" / "B (current)") of the A/B input
 *  descriptor comparison — every field the simulator actually sent the
 *  engine, with the fields that differ from the other column called out. */
function DescriptorList({
  title,
  descriptor,
  diffKeys,
}: {
  title: string;
  descriptor: DependencyDescriptor;
  diffKeys: Set<string>;
}) {
  const entries = Object.entries(descriptor).filter(([, v]) => v !== undefined);
  return (
    <div className="sim-compare-col">
      <div className="sim-compare-col-title">{title}</div>
      {entries.length === 0 ? (
        <p className="empty-note">no fields set</p>
      ) : (
        <ul>
          {entries.map(([key, value]) => (
            <li key={key} className={diffKeys.has(key) ? "sim-input-diff" : undefined}>
              <code>{key}</code>: {previewValue(value, 60)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Roadmap 018: one of the three matched-rule columns in the A/B comparison. */
function RuleDeltaList({
  title,
  refs,
  kind,
}: {
  title: string;
  refs: RuleRef[];
  kind: "only-a" | "only-b" | "both";
}) {
  return (
    <div className={`sim-compare-col ${kind}`}>
      <div className="sim-compare-col-title">
        {title} <span className="count">{refs.length}</span>
      </div>
      {refs.length === 0 ? (
        <p className="empty-note">none</p>
      ) : (
        <ul>
          {refs.map((r) => (
            <li key={`${r.index}-${r.signature}`}>
              <span className="sim-rule-index">packageRules[{r.index}]</span> <code>{r.label}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Roadmap 018: one changed key of the final per-dependency config (A → B). */
function ConfigDeltaRow({ delta }: { delta: ConfigKeyDelta }) {
  return (
    <li>
      <span className="sim-merged-key">
        <OptionKey name={delta.key} flagUnknown />
      </span>{" "}
      <span className="sim-merged-before">
        {delta.inA ? previewValue(delta.before) : "(unset)"}
      </span>
      {" → "}
      <span className="sim-merged-after">
        {delta.inB ? previewValue(delta.after) : "(removed)"}
      </span>
    </li>
  );
}

/** Roadmap 021: the pinned A-run plus the full form snapshot it was run
 *  against (all simulator fields, not just the ones the engine reads) — so
 *  the comparison panel can show and diff exactly what was simulated. */
interface PinnedRun {
  sim: SimulationResult;
  form: FormState;
  effectiveUpdateType: string;
}

/**
 * Roadmap 018: the A/B comparison panel. `comparison` is null while a result is
 * pinned but no NEW simulation has replaced it yet (a "waiting" hint shows);
 * once a fresh run produces B, it renders the matched-rule set delta, the
 * final-config key delta, and an explicit "no behavioral change" verdict when
 * both are identical.
 *
 * Roadmap 021: A and B can come from simulating two entirely different
 * hypothetical dependencies (pin a lodash run, then quick-fill a Docker
 * image and re-simulate) — the delta above would render as if it were a
 * config edit, with no hint that the INPUTS changed too. `currentDescriptor`
 * is always what actually produced `sim` (or, before any run since the pin,
 * the live form) so the two input sets can be shown and diffed regardless of
 * whether `comparison` exists yet.
 */
function ComparisonPanel({
  pinned,
  comparison,
  currentDescriptor,
}: {
  pinned: PinnedRun;
  comparison: SimulationComparison | null;
  currentDescriptor: DependencyDescriptor;
}) {
  const pinnedDescriptor = toDescriptor(pinned.form, pinned.effectiveUpdateType);
  const diffKeys = new Set(descriptorDiffKeys(pinnedDescriptor, currentDescriptor));
  return (
    <div className="sim-compare">
      <div className="sim-compare-title">A/B comparison — pinned (A) vs current (B)</div>
      {diffKeys.size > 0 ? (
        <p className="sim-compare-mismatch">
          ⚠ Inputs differ between A and B — this compares two different simulated dependencies, not
          just a config edit. Differing fields:{" "}
          {[...diffKeys].map((k, i) => (
            <span key={k}>
              {i > 0 ? ", " : null}
              <code>{k}</code>
            </span>
          ))}
        </p>
      ) : null}
      {!comparison ? (
        <p className="empty-note">
          Pinned this result as <strong>A</strong>. Edit the config and run the pipeline again, then
          simulate to compare it against <strong>B</strong>.
        </p>
      ) : comparison.noChange ? (
        <p className="sim-compare-nochange">
          No behavioral change — the matched rules and the final per-dependency config are identical
          in A and B.
        </p>
      ) : (
        <>
          <div className="sim-compare-rules">
            <RuleDeltaList
              title="Only in A (stopped matching)"
              refs={comparison.matchedOnlyInA}
              kind="only-a"
            />
            <RuleDeltaList
              title="Only in B (now matching)"
              refs={comparison.matchedOnlyInB}
              kind="only-b"
            />
            <RuleDeltaList title="Matched in both" refs={comparison.matchedInBoth} kind="both" />
          </div>
          <div className="sim-compare-config">
            <div className="sim-merged-title">Final per-dependency config changes</div>
            {comparison.configDelta.length > 0 ? (
              <ul>
                {comparison.configDelta.map((d) => (
                  <ConfigDeltaRow key={d.key} delta={d} />
                ))}
              </ul>
            ) : (
              <p className="empty-note">
                Final per-dependency config is identical — only the matched-rule set differs.
              </p>
            )}
          </div>
        </>
      )}
      <details className="sim-compare-inputs" open={diffKeys.size > 0}>
        <summary>Inputs compared</summary>
        <div className="sim-compare-rules">
          <DescriptorList title="A (pinned)" descriptor={pinnedDescriptor} diffKeys={diffKeys} />
          <DescriptorList title="B (current)" descriptor={currentDescriptor} diffKeys={diffKeys} />
        </div>
      </details>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="sim-field">
      {label}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        // Roadmap 021: select-on-focus. A quick-fill or a re-run leaves a
        // field pre-filled; without this, the persona study's users typed
        // straight into it and got "reactgradle" instead of "gradle" without
        // noticing. Selecting the content on focus makes the first keystroke
        // replace it — repositioning the caret with a second click still
        // works, since that click doesn't refire `focus`.
        onFocus={(e) => e.target.select()}
        spellCheck={false}
      />
    </label>
  );
}

export function RuleSimulator({
  result,
  onSelectPreset,
  onJumpToEditor,
  focusRuleIndex,
  onRuleFocused,
  errorLib,
  simRequest,
  onCopySimLink,
}: {
  result: TraceResult;
  /** Roadmap 013: a rule row's provenance chip → the contributing preset node in the tree. */
  onSelectPreset?: (nodeId: string) => void;
  /** Roadmap 013: a merged-index validation message → the repo-config editor line. */
  onJumpToEditor?: (repoIndex: number) => void;
  /** Roadmap 013: a merged rule index to scroll to/highlight (from a validation
   *  message elsewhere on the page naming this rule's repo-config index). */
  focusRuleIndex?: number | null;
  /** Called once the requested `focusRuleIndex` has been handled (found or not). */
  onRuleFocused?: () => void;
  /** Roadmap 014: curated translations, explanation-only here — this echo
   *  validates the MERGED packageRules array (`validateConfig("repo", {
   *  packageRules: … })` over the simulated/flattened rules), not the editor's
   *  own text, so there's no safe surgical "Apply fix" target from this panel.
   *  When the same issue exists in the user's own rule, it also surfaces
   *  (with a fix) in the top-level Errors & warnings panel. */
  errorLib?: ErrorTranslationLib | null;
  /** Roadmap 018: simulator inputs a decoded share link carries; applied to the
   *  form (and auto-run when its flag is set) once per nonce. */
  simRequest?: SimRequest | null;
  /** Roadmap 018: encode the current config + view + these simulator inputs into
   *  a share link and copy it (App owns the full share state). */
  onCopySimLink?: (sim: ShareSimulator) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [sim, setSim] = useState<SimulationResult | null>(null);
  // Roadmap 021: the form (all fields) + effective updateType that produced
  // `sim`, kept alongside it so the comparison panel can show/diff exactly
  // what was simulated — never the live `form`, which may have been edited
  // further without a re-run (that drift is what the "stale" banner covers).
  const [simForm, setSimForm] = useState<FormState | null>(null);
  const [simEffectiveUpdateType, setSimEffectiveUpdateType] = useState("");
  // Roadmap 018: a pinned A-run kept for A/B comparison — deliberately NOT
  // cleared when a new pipeline result arrives (the whole point is to pin, edit
  // the config, re-run, and compare); only "Unpin" clears it. Roadmap 021: now
  // carries the full input snapshot (`form` + `effectiveUpdateType`), not just
  // the result, so the comparison panel can tell A and B's inputs apart.
  const [pinned, setPinned] = useState<PinnedRun | null>(null);
  const [simLinkCopied, setSimLinkCopied] = useState(false);
  // Roadmap 018: applied-once bookkeeping for an incoming share `simRequest`.
  const appliedSimNonce = useRef<number | null>(null);
  const [ranKey, setRanKey] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Roadmap 015: updateType derivation. `engineModule` is loaded once, up
  // front — by the time this component can render, a run has already pulled
  // the engine chunk in (see `simulate` below), so this is a cache hit, not
  // a second network fetch. `updateTypeTouched` tracks whether the user
  // picked the select THEMSELVES: while false, the effective updateType
  // tracks currentValue/newValue live; the moment they touch the select (or
  // a quick-fill runs, which resets it) their choice wins outright, even if
  // they go on to edit the versions afterward.
  const [engineModule, setEngineModule] = useState<
    typeof import("@renovate-config-visualizer/engine") | null
  >(null);
  const [updateTypeTouched, setUpdateTypeTouched] = useState(false);
  // Roadmap 015: set when Simulate is clicked on a form with no identifying
  // input; cleared reactively the moment the form has ANY meaningful field.
  const [emptyGuardTriggered, setEmptyGuardTriggered] = useState(false);
  const rulesRef = useRef<HTMLDivElement>(null);
  const ruleAttribution = useRuleProvenance(result);
  // Roadmap 016: re-simulating (e.g. after editing the form and clicking
  // Simulate again) resets `showAll` to the matched-only default, which can
  // unmount rows the user was scrolled past — the browser's scroll-anchoring
  // then repicks a higher anchor and the page visibly jumps. Capture the
  // scroll position right before the state update that causes the unmount,
  // then restore it once the new DOM has painted (clamped automatically by
  // the browser if the new content is shorter than before).
  const scrollYBeforeSimulate = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@renovate-config-visualizer/engine").then((m) => {
      if (!cancelled) {
        setEngineModule(m);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // Roadmap 013: the merged index awaiting a scroll+flash — set either from the
  // external `focusRuleIndex` prop or a click on this component's own
  // packageRules[N]-in-message links (`focusRule`, defined below).
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);

  // A new run invalidates any previous simulation (the rules may differ).
  useEffect(() => {
    setSim(null);
    setSimForm(null);
    setSimEffectiveUpdateType("");
    setRanKey(null);
    setError(null);
    setShowAll(false);
    setEmptyGuardTriggered(false);
  }, [result]);

  // Roadmap 018: apply a decoded share link's simulator inputs exactly once (by
  // nonce). Depends on `result` too, so — whether the link opened on mount or
  // via hashchange — the form is applied (and optionally auto-run) against the
  // freshly-run config rather than a stale one. Declared AFTER the reset effect
  // so it wins for a decoded link (the reset clears, then this re-populates).
  useEffect(() => {
    if (!simRequest || appliedSimNonce.current === simRequest.nonce || !result.finalConfig) {
      return;
    }
    appliedSimNonce.current = simRequest.nonce;
    const next: FormState = { ...EMPTY_FORM };
    for (const key of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
      const value = simRequest.form[key];
      if (typeof value === "string") {
        next[key] = value;
      }
    }
    setForm(next);
    // The link always encodes the EFFECTIVE updateType, so a non-empty one is a
    // deliberate pin — mark it touched so derivation can't override it.
    const touched = next.updateType.trim() !== "";
    setUpdateTypeTouched(touched);
    if (simRequest.autoSimulate) {
      void simulate(next, touched);
    }
  }, [simRequest, result]);

  useEffect(() => {
    if (focusRuleIndex != null) {
      setScrollTarget(focusRuleIndex);
    }
  }, [focusRuleIndex]);

  // Performs the actual scroll+flash once the target row is guaranteed to be
  // in the DOM: if it is currently hidden behind the matched-only filter,
  // reveal it first and let the effect re-run on the next render (kept out of
  // the packageRules-empty early return below, since hooks can't be
  // conditional — checked against `sim` directly instead of `notableRules`).
  useEffect(() => {
    if (scrollTarget == null || !sim) {
      return;
    }
    const rule = sim.rules.find((r) => r.index === scrollTarget);
    if (!rule) {
      setScrollTarget(null);
      onRuleFocused?.();
      return;
    }
    const visible = showAll || rule.verdict !== "no-match";
    if (!visible) {
      setShowAll(true);
      return;
    }
    const el = document.getElementById(`sim-rule-${scrollTarget}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("rcv-flash");
      window.setTimeout(() => el.classList.remove("rcv-flash"), 1600);
    }
    setScrollTarget(null);
    onRuleFocused?.();
  }, [scrollTarget, sim, showAll, onRuleFocused]);

  /** A merged rule index a click on a `packageRules[N]` message link asked to see. */
  function focusRule(mergedIndex: number) {
    setScrollTarget(mergedIndex);
  }

  const finalConfig = result.finalConfig;
  const packageRules = useMemo(
    () => (Array.isArray(finalConfig?.packageRules) ? finalConfig.packageRules : []),
    [finalConfig],
  );
  const layerByIndex = useMemo(() => {
    const map = new Map<number, ProvenanceLayer>();
    for (const attr of ruleAttribution ?? []) {
      map.set(attr.index, attr.layer);
    }
    return map;
  }, [ruleAttribution]);

  // Roadmap 015: recomputed live as currentValue/newValue/versioning change —
  // undefined until the engine chunk resolves, or when the pair can't be
  // derived (blank, a range, an unparseable value, …).
  const derivedUpdateType = useMemo(
    () => engineModule?.deriveUpdateType(form.currentValue, form.newValue, form.versioning),
    [engineModule, form.currentValue, form.newValue, form.versioning],
  );
  const effectiveUpdateType =
    updateTypeTouched || derivedUpdateType === undefined ? form.updateType : derivedUpdateType;

  // Roadmap 018: the A/B comparison — the pinned run (A) vs the current run (B).
  // Null until a NEW simulation replaces the one that was pinned (comparing a
  // result against itself is not useful — the panel shows a "waiting" hint
  // instead). The comparison logic itself is pure and lives in the engine.
  const comparison = useMemo<SimulationComparison | null>(() => {
    if (!engineModule || !pinned || !sim || pinned.sim === sim) {
      return null;
    }
    return engineModule.compareSimulations(pinned.sim, sim);
  }, [engineModule, pinned, sim]);

  // Roadmap 021: what the comparison panel treats as "B"'s inputs — the form
  // that actually produced `sim`, or (before any run since pinning, or after
  // a fresh pipeline run cleared `sim`) the live form, so the panel always has
  // something to show/diff against the pinned snapshot.
  const currentDescriptor = useMemo(
    () =>
      simForm
        ? toDescriptor(simForm, simEffectiveUpdateType)
        : toDescriptor(form, effectiveUpdateType),
    [simForm, simEffectiveUpdateType, form, effectiveUpdateType],
  );

  // Keys the rules changed vs. the pre-rules effective config, for the final
  // section's summary chips.
  const changedKeys = useMemo(() => {
    if (!sim || !finalConfig) {
      return [];
    }
    const base: Record<string, unknown> = { ...finalConfig };
    delete base.packageRules;
    const keys = new Set([...Object.keys(base), ...Object.keys(sim.finalDependencyConfig)]);
    return [...keys]
      .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(sim.finalDependencyConfig[key]))
      .toSorted();
  }, [sim, finalConfig]);

  // Roadmap 016: restore the scroll position captured in `simulate` right
  // before the DOM the browser is about to repaint — after `sim`/`showAll`
  // change together, so this runs once against the settled layout rather than
  // an intermediate one.
  useLayoutEffect(() => {
    const y = scrollYBeforeSimulate.current;
    if (y !== null) {
      scrollYBeforeSimulate.current = null;
      window.scrollTo({ top: y, behavior: "auto" });
    }
  }, [sim, showAll]);

  if (!finalConfig) {
    return null;
  }

  /**
   * @param touched Roadmap 015: whether the CALLER's updateType is a manual
   * override (Simulate button click — pass the current `updateTypeTouched`
   * state) or not (a quick-fill's own guess, always re-derivable). Threaded
   * explicitly rather than read from state inside this async function, since
   * `quickFill` below also resets the state flag in the same tick — reading
   * it here would race against that update.
   */
  async function simulate(nextForm: FormState, touched: boolean) {
    if (!finalConfig) {
      return;
    }
    // Roadmap 015: empty-form guard — an all-blank descriptor is guaranteed
    // to match nothing, and running it just renders hundreds of "no match"
    // rows with no explanation (the study's "did I break something?" moment).
    if (!hasMeaningfulInput(nextForm)) {
      setEmptyGuardTriggered(true);
      return;
    }
    setEmptyGuardTriggered(false);
    setRunning(true);
    setError(null);
    try {
      const engine = await import("@renovate-config-visualizer/engine");
      const derived = engine.deriveUpdateType(
        nextForm.currentValue,
        nextForm.newValue,
        nextForm.versioning,
      );
      const effectiveType = touched || derived === undefined ? nextForm.updateType : derived;
      const simResult = await engine.simulatePackageRules({
        config: finalConfig,
        dep: toDescriptor(nextForm, effectiveType),
      });
      // Captured right before the state updates that can shrink the results
      // list (see the layout effect above) — not at the top of `simulate`,
      // so an in-flight fetch doesn't capture a scroll position the user has
      // since abandoned.
      scrollYBeforeSimulate.current = window.scrollY;
      setSim(simResult);
      setSimForm(nextForm);
      setSimEffectiveUpdateType(effectiveType);
      setRanKey(JSON.stringify(nextForm));
      setShowAll(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  /**
   * Roadmap 018: build a share link that reproduces THIS simulation. The
   * effective updateType (derived or manual) is what actually drove the run, so
   * it is what gets encoded — the opener reproduces the exact verdict, not a
   * re-derivation. `autoSimulate` is always set: the affordance's whole promise
   * is "open this and it runs". Never includes tokens (the form has none).
   */
  async function copySimLink() {
    if (!onCopySimLink) {
      return;
    }
    const shareForm: Record<string, string> = {};
    for (const [key, value] of Object.entries(form)) {
      if (typeof value === "string" && value.trim() !== "") {
        shareForm[key] = value;
      }
    }
    if (effectiveUpdateType && effectiveUpdateType.trim() !== "") {
      shareForm.updateType = effectiveUpdateType;
    }
    await onCopySimLink({ form: shareForm, autoSimulate: true });
    setSimLinkCopied(true);
    setTimeout(() => setSimLinkCopied(false), 1500);
  }

  function quickFill(fill: Partial<FormState>) {
    const next = { ...EMPTY_FORM, ...fill };
    setForm(next);
    // A quick-fill's updateType is only a starting guess, not the user's own
    // choice — derivation should keep tracking it if they go on to edit the
    // pre-filled versions.
    setUpdateTypeTouched(false);
    void simulate(next, false);
  }

  /**
   * Roadmap 015: step the updateType select ourselves on ArrowUp/ArrowDown.
   * Investigation: this select is a plain, unstyled native `<select>` with no
   * other keydown listener anywhere in the app — but its native one-option-
   * at-a-time arrow stepping turned out to be unreliable specifically under
   * the persona study's browser-automation driver (confirmed by reproducing
   * it against a bare, app-free `<select>` under the same driver: even a
   * from-scratch page with zero JS doesn't step). Handling the keys directly
   * makes stepping deterministic for every input path — a real keyboard
   * included, where this exactly mirrors what native stepping already did.
   */
  function updateTypeKeyDown(e: React.KeyboardEvent<HTMLSelectElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
      return;
    }
    e.preventDefault();
    const values = ["", ...UPDATE_TYPES];
    const currentIndex = values.indexOf(effectiveUpdateType);
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex =
      e.key === "ArrowDown"
        ? Math.min(values.length - 1, baseIndex + 1)
        : Math.max(0, baseIndex - 1);
    setUpdateTypeTouched(true);
    setForm({ ...form, updateType: values[nextIndex] ?? "" });
  }

  if (packageRules.length === 0) {
    return (
      <div className="card">
        <div className="card-title">
          Update simulator{" "}
          <span className="sim-title-hint">
            — test your <Term id="packageRules">packageRules</Term>
          </span>
        </div>
        <p className="empty-note">
          This config has no <Term id="packageRules">packageRules</Term> — nothing to simulate.
          Rules added by presets would appear here after a run that resolves them.
        </p>
      </div>
    );
  }

  const stale = sim !== null && ranKey !== JSON.stringify(form);
  // Roadmap 015: reactive, not sticky — the moment the form gains ANY
  // meaningful field, the guard clears itself even without clicking Simulate.
  const showEmptyGuard = emptyGuardTriggered && !hasMeaningfulInput(form);
  const matchedCount = sim?.rules.filter((r) => r.verdict === "matched").length ?? 0;
  // Default the results list to the rules that actually did something (matched
  // or unresolved), hiding the sea of "no match" rows behind a toggle.
  const notableRules = sim ? sim.rules.filter((r) => r.verdict !== "no-match") : [];
  const hiddenCount = sim ? sim.rules.length - notableRules.length : 0;
  const shownRules = showAll ? (sim?.rules ?? []) : notableRules;
  const verdictSentence = sim
    ? buildVerdictSentence(sim, sim.flattened.updateType, changedKeys, ruleAttribution)
    : "";
  const changedWithValues = changedKeys.map((key) => ({
    key,
    value: sim?.finalDependencyConfig[key],
    present: sim ? key in sim.finalDependencyConfig : false,
  }));

  function jumpToRules() {
    rulesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="card">
      <div className="card-title">
        Update simulator
        <span className="sim-title-hint">
          {" "}
          — describe a hypothetical dependency update and see which of the{" "}
          <RuleFramingText
            total={packageRules.length}
            attribution={ruleAttribution ?? null}
            variant="compact"
          />{" "}
          <Term id="packageRules">{packageRules.length === 1 ? "rule" : "rules"}</Term> would apply
        </span>
      </div>
      <div className="sim-presets">
        {QUICK_FILLS.map(({ label, fill }) => (
          <button key={label} type="button" onClick={() => quickFill(fill)}>
            {label}
          </button>
        ))}
      </div>
      <div className="sim-form">
        <Field
          label="manager"
          value={form.manager}
          onChange={(v) => setForm({ ...form, manager: v })}
          placeholder="npm"
        />
        <Field
          label="datasource"
          value={form.datasource}
          onChange={(v) => setForm({ ...form, datasource: v })}
          placeholder="npm"
        />
        <Field
          label="packageName"
          value={form.packageName}
          onChange={(v) => setForm({ ...form, packageName: v })}
          placeholder="lodash"
        />
        <Field
          label="depName"
          value={form.depName}
          onChange={(v) => setForm({ ...form, depName: v })}
          placeholder="= packageName"
        />
        <Field
          label="depType"
          value={form.depType}
          onChange={(v) => setForm({ ...form, depType: v })}
          placeholder="dependencies"
        />
        <Field
          label="packageFile"
          value={form.packageFile}
          onChange={(v) => setForm({ ...form, packageFile: v })}
          placeholder="package.json"
        />
        <Field
          label="currentValue"
          value={form.currentValue}
          onChange={(v) => setForm({ ...form, currentValue: v })}
          placeholder="4.17.20"
        />
        <Field
          label="newValue"
          value={form.newValue}
          onChange={(v) => setForm({ ...form, newValue: v })}
          placeholder="4.17.21"
        />
        {/* Roadmap 015: promoted out of "More fields" — sourceUrl was the
            decisive matcher in two of the persona study's three problems. */}
        <Field
          label={<Term id="simSourceUrl">sourceUrl</Term>}
          value={form.sourceUrl}
          onChange={(v) => setForm({ ...form, sourceUrl: v })}
          placeholder="https://github.com/facebook/react — the DEPENDENCY's repo"
        />
        <label className="sim-field">
          updateType
          <select
            value={effectiveUpdateType}
            onChange={(e) => {
              setUpdateTypeTouched(true);
              setForm({ ...form, updateType: e.target.value });
            }}
            onKeyDown={updateTypeKeyDown}
          >
            <option value="">(unset)</option>
            {UPDATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {/* Roadmap 015: a quick-fill's updateType must not silently survive
              editing the versions — while untouched, this tracks
              currentValue -> newValue live via the selected versioning
              scheme, and says so, so "major (derived)" can't be mistaken for
              a manual choice. */}
          {!updateTypeTouched && derivedUpdateType !== undefined ? (
            <span className="sim-derived-hint">
              (derived from currentValue → newValue —{" "}
              <button type="button" className="sim-link" onClick={() => setUpdateTypeTouched(true)}>
                override
              </button>
              )
            </span>
          ) : null}
        </label>
      </div>
      <details className="sim-more">
        <summary>
          More fields
          <span className="advanced-hint"> — versioning, lock files, URLs, categories, age…</span>
        </summary>
        <div className="sim-form">
          <Field
            label="currentVersion"
            value={form.currentVersion}
            onChange={(v) => setForm({ ...form, currentVersion: v })}
          />
          <Field
            label="lockedVersion"
            value={form.lockedVersion}
            onChange={(v) => setForm({ ...form, lockedVersion: v })}
          />
          <Field
            label="lockFiles (comma-separated)"
            value={form.lockFiles}
            onChange={(v) => setForm({ ...form, lockFiles: v })}
            placeholder="package-lock.json"
          />
          <Field
            label="versioning"
            value={form.versioning}
            onChange={(v) => setForm({ ...form, versioning: v })}
            placeholder="semver"
          />
          <Field
            label="registryUrls (comma-separated)"
            value={form.registryUrls}
            onChange={(v) => setForm({ ...form, registryUrls: v })}
            placeholder="https://registry.npmjs.org"
          />
          <Field
            label="categories (comma-separated)"
            value={form.categories}
            onChange={(v) => setForm({ ...form, categories: v })}
            placeholder="js"
          />
          <Field
            label={<Term id="simRepository">repository</Term>}
            value={form.repository}
            onChange={(v) => setForm({ ...form, repository: v })}
            placeholder="your-org/your-repo — the repo Renovate runs in"
          />
          <Field
            label="baseBranch"
            value={form.baseBranch}
            onChange={(v) => setForm({ ...form, baseBranch: v })}
            placeholder="main"
          />
          <Field
            label="currentVersionTimestamp"
            value={form.currentVersionTimestamp}
            onChange={(v) => setForm({ ...form, currentVersionTimestamp: v })}
            placeholder="2024-01-01T00:00:00.000Z"
          />
        </div>
      </details>
      <div className="sim-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void simulate(form, updateTypeTouched)}
          disabled={running}
        >
          {running ? "Simulating…" : "Simulate"}
        </button>
        {stale ? (
          <span className="sim-stale">inputs changed — simulate again to refresh</span>
        ) : null}
      </div>
      {/* Roadmap 015: empty-form guard — replaces a would-be "0 of N rules
          matched" wall of no-matches with a plain nudge. */}
      {showEmptyGuard ? (
        <p className="sim-empty-guard">
          Pick an example above, or fill in a package name (or another identifying field) below — an
          empty form can't match anything.
        </p>
      ) : null}

      {error ? <p className="sim-error">Simulation failed: {error}</p> : null}

      {/* Roadmap 015: while stale, the whole results block is visibly greyed
          out (not just the small text hint below, which the persona study
          found easy to skim past) with a banner explaining why. */}
      {sim ? (
        <div className="sim-results">
          {stale ? (
            <p className="sim-stale-banner">
              Inputs changed since this run — these results may no longer reflect the form above.
              Simulate again to refresh.
            </p>
          ) : null}
          {/* The banner above stays full-strength; everything below it (the
              actual results) is what gets visibly veiled while stale. */}
          <div className={`sim-results-body${stale ? " stale" : ""}`}>
            {/* Roadmap 012: the answer first — a pinned verdict directly under
              the Simulate button, before the rule list. */}
            <div className={`sim-verdict-block${matchedCount === 0 ? " none" : ""}`}>
              <p className="sim-verdict-sentence">{verdictSentence}</p>
              {changedWithValues.length > 0 ? (
                <ul className="sim-verdict-keys">
                  {changedWithValues.map(({ key, value, present }) => (
                    <li key={key}>
                      <code>
                        <OptionKey name={key} flagUnknown />
                      </code>
                      {present ? (
                        <>
                          {" = "}
                          <span className="sim-verdict-value">{previewValue(value, 80)}</span>
                          {sim.flattened.merged.some((m) => m.key === key) ? (
                            <span className="sim-verdict-from">
                              {" "}
                              from the <Term id="updateType">{sim.flattened.updateType}</Term> block
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="sim-verdict-value removed"> removed</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sim-verdict-none">
                  No rule changed anything for this dependency — the defaults apply.
                </p>
              )}
              <button type="button" className="sim-jump" onClick={jumpToRules}>
                {matchedCount} of {sim.rules.length} rule{sim.rules.length === 1 ? "" : "s"} matched
                →
              </button>
              {/* Roadmap 018: evidence-export affordances on the verdict block —
                  a reproducible link (form + auto-run encoded) and A/B pinning. */}
              <div className="sim-verdict-actions">
                {onCopySimLink ? (
                  <button
                    type="button"
                    className="sim-verdict-action"
                    onClick={() => void copySimLink()}
                  >
                    {simLinkCopied ? "Copied!" : "Copy link with this simulation"}
                  </button>
                ) : null}
                {pinned ? (
                  <button
                    type="button"
                    className="sim-verdict-action"
                    onClick={() => setPinned(null)}
                  >
                    Unpin comparison
                  </button>
                ) : (
                  <button
                    type="button"
                    className="sim-verdict-action"
                    onClick={() => {
                      // Roadmap 021: simForm is set in the same simulate() call as
                      // sim, so it is never null here — the guard is only to
                      // satisfy the type checker, not a real runtime branch.
                      if (simForm) {
                        setPinned({
                          sim,
                          form: simForm,
                          effectiveUpdateType: simEffectiveUpdateType,
                        });
                      }
                    }}
                    title="Pin this result as A, edit the config, then simulate again to compare"
                  >
                    Pin result for comparison
                  </button>
                )}
              </div>
            </div>

            {pinned ? (
              <ComparisonPanel
                pinned={pinned}
                comparison={comparison}
                currentDescriptor={currentDescriptor}
              />
            ) : null}

            {[...sim.errors, ...sim.warnings].length > 0 ? (
              <ul className="messages sim-messages">
                {sim.errors.map((m, i) => (
                  <li key={`e${i}`} className="error">
                    <strong>{m.topic}</strong>:{" "}
                    <RuleMessage
                      message={m}
                      indexKind="merged"
                      ruleAttribution={ruleAttribution}
                      onJumpToEditor={onJumpToEditor}
                      onJumpToSimRule={focusRule}
                    />
                    <ErrorTranslationView message={m} errorLib={errorLib ?? null} config={null} />
                  </li>
                ))}
                {sim.warnings.map((m, i) => (
                  <li key={`w${i}`} className="warn">
                    <strong>{m.topic}</strong>:{" "}
                    <RuleMessage
                      message={m}
                      indexKind="merged"
                      ruleAttribution={ruleAttribution}
                      onJumpToEditor={onJumpToEditor}
                      onJumpToSimRule={focusRule}
                    />
                    <ErrorTranslationView message={m} errorLib={errorLib ?? null} config={null} />
                  </li>
                ))}
              </ul>
            ) : null}
            {sim.notes.map((note) => (
              <p key={note} className="sim-note">
                {note}
              </p>
            ))}
            <div className="sim-rules-head" ref={rulesRef}>
              <span className="sim-summary">
                {showAll
                  ? `all ${sim.rules.length} rule${sim.rules.length === 1 ? "" : "s"}`
                  : `${notableRules.length} of ${sim.rules.length} rule${sim.rules.length === 1 ? "" : "s"} shown`}
              </span>
              {hiddenCount > 0 ? (
                <button type="button" className="sim-toggle" onClick={() => setShowAll(!showAll)}>
                  {showAll ? "show matched only" : `show all ${sim.rules.length}`}
                </button>
              ) : null}
            </div>
            {shownRules.length > 0 ? (
              <div className="sim-rules">
                {shownRules.map((rule) => (
                  <RuleRow
                    key={rule.index}
                    rule={rule}
                    layer={layerByIndex.get(rule.index)}
                    onSelectPreset={onSelectPreset}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-note">
                No rule matched this dependency.{" "}
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    className="sim-toggle inline"
                    onClick={() => setShowAll(true)}
                  >
                    Show all {sim.rules.length} anyway.
                  </button>
                ) : null}
              </p>
            )}
            <div className="sim-final">
              <div className="sim-merged-title">Final per-dependency config</div>
              {changedKeys.length > 0 ? (
                <p className="sim-changed">
                  Rules changed:{" "}
                  {changedKeys.map((key, i) => (
                    <span key={key}>
                      {i > 0 ? ", " : null}
                      <code>
                        <OptionKey name={key} flagUnknown />
                      </code>
                    </span>
                  ))}
                </p>
              ) : (
                <p className="sim-changed">No rule changed anything for this dependency.</p>
              )}
              <details>
                <summary>Show the full resolved dependency config</summary>
                <pre className="config-view">
                  <ConfigJson value={sim.finalDependencyConfig} />
                </pre>
              </details>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
