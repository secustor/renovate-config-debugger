import {
  Fragment,
  memo,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  ValidationMessage,
} from "@renovate-config-visualizer/engine";
import type * as EngineModule from "@renovate-config-visualizer/engine";
import { Term } from "./glossary";
import { OptionKey } from "./option-docs";
import { useRuleProvenance } from "@/hooks/rule-provenance";
import { RuleFramingText } from "./rule-framing";
import type { ErrorTranslationLib } from "@/platform/run";
import type { ShareSimulator } from "@/lib/share";
import { ConfigJson } from "./ConfigJson";
import { CopyButton } from "./CopyButton";
import { CopyMarkdownButton } from "./CopyMarkdownButton";
import { ErrorTranslationView } from "./ErrorTranslationView";
import { HypotheticalBanner } from "./HypotheticalBanner";
import { ProvenanceChip } from "./ProvenanceChip";
import { RuleMessage } from "./RuleMessage";
import {
  SequenceChip,
  type SequenceDotLevel,
  SequenceSep,
  SequenceTimeline,
} from "./SequenceTimeline";
import { StepThrough, type StepThroughStep } from "./StepThrough";
import { SummaryDrawer } from "./SummaryDrawer";
import { layerId, layerLabel } from "./provenance-layer";

/**
 * Roadmap 046: the update-type blocks Renovate's flattening consumes, an
 * app-local copy of the engine's `UPDATE_TYPE_KEYS` — typed against the real
 * export so a drift fails the build, but without a static VALUE import that
 * would pull the renovate chunk into the initial bundle (the same pattern as
 * 033's `STAGE_IDS`).
 */
const UPDATE_TYPE_KEYS: typeof EngineModule.UPDATE_TYPE_KEYS = [
  "major",
  "minor",
  "patch",
  "pin",
  "digest",
  "lockFileMaintenance",
  "replacement",
];

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
 * Roadmap 047: an update-type block the USER authored (per the engine's
 * `flattened.authoredBlocks`) that flattening consumed WITHOUT applying — the
 * only case where the consumed-blocks aside earns its place on the verdict
 * card. Renovate's defaults declare all seven blocks on every config, so
 * "blocks were consumed" is true on virtually every run; naming only the
 * authored ones turns furniture back into signal. The block that actually
 * merged up is excluded — it applied, so there is nothing to explain.
 */
interface ConsumedBlock {
  /** The update-type key, e.g. `minor`. */
  key: string;
  /** The block's own option keys, e.g. `["automerge"]`. */
  keys: string[];
  /** The preset that contributed it, when a single matched rule set it. */
  layer?: ProvenanceLayer;
}

/**
 * Which layer contributed an update-type block, for the aside's attribution
 * chip — the same best-effort reading `automergeScopeSource` does, generalized
 * to the whole block: only when EXACTLY ONE matched rule merged that key, and
 * only when that rule traces to a preset. A block that came from the base
 * config, or one several rules touched, is left uncredited rather than guessed.
 */
function blockSourceLayer(
  sim: SimulationResult,
  blockKey: string,
  ruleAttribution: RuleAttribution[] | null | undefined,
): ProvenanceLayer | undefined {
  const setters = sim.rules.filter(
    (r) => r.verdict === "matched" && r.merged?.some((m) => m.key === blockKey),
  );
  if (setters.length !== 1) {
    return undefined;
  }
  const attribution = ruleAttribution?.find((a) => a.index === setters[0]?.index);
  return attribution?.layer.kind === "preset" ? attribution.layer : undefined;
}

function consumedAuthoredBlocks(
  sim: SimulationResult,
  ruleAttribution: RuleAttribution[] | null | undefined,
): ConsumedBlock[] {
  const applied = sim.flattened.merged.length > 0 ? sim.flattened.updateType : undefined;
  return sim.flattened.authoredBlocks
    .filter((key) => key !== applied)
    .map((key) => ({
      key,
      keys: Object.keys(sim.flattened.blocks[key] ?? {}),
      layer: blockSourceLayer(sim, key, ruleAttribution),
    }));
}

/** Roadmap 047: the aside itself — one line per authored block that didn't
 *  apply, naming its own keys, its source preset when that is unambiguous,
 *  and why it stayed inert. */
function SimConsumedBlock({
  block,
  updateType,
  flattenStopIndex,
  onSelectPreset,
  onJumpToStep,
}: {
  block: ConsumedBlock;
  updateType?: string;
  flattenStopIndex?: number;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
}) {
  return (
    <p className="sim-consumed-note">
      <span className="sim-consumed-glyph">⊘</span> Your <code>{block.key}</code> block
      {block.keys.length > 0 || block.layer ? (
        <>
          {" ("}
          {block.keys.map((key, i) => (
            <Fragment key={key}>
              {i > 0 ? ", " : null}
              <code>{key}</code>
            </Fragment>
          ))}
          {block.layer ? (
            <>
              {block.keys.length > 0 ? ", " : null}
              from <ProvenanceChip layer={block.layer} onSelectPreset={onSelectPreset} />
            </>
          ) : null}
          {")"}
        </>
      ) : null}{" "}
      didn&apos;t apply —{" "}
      {updateType === undefined ? (
        <>
          no <Term id="updateType">updateType</Term> is set; fill the version pair or pick one to
          see it apply.
        </>
      ) : (
        <>
          this is a <code>{updateType}</code> update.
        </>
      )}
      {flattenStopIndex !== undefined && onJumpToStep !== undefined ? (
        <>
          {" "}
          <button
            type="button"
            className="sim-step-link"
            onClick={() => onJumpToStep(flattenStopIndex)}
          >
            see the flatten step →
          </button>
        </>
      ) : null}
    </p>
  );
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
 *
 * Roadmap 046: returned as SEGMENTS rather than one string, so the verdict
 * card can set the modal verbs — the single most information-bearing words the
 * simulator produces — as badges, while `verdictText` below keeps the plain
 * sentence for aria/exports.
 */
type VerdictSegment = string | { modal: "would" | "would not" };

function buildVerdictSegments(
  sim: SimulationResult,
  updateType: string | undefined,
  changedKeys: string[],
  ruleAttribution: RuleAttribution[] | null | undefined,
): VerdictSegment[] {
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

  if (positives.length === 0 && negatives.length === 0) {
    return [`${subject} gets no special handling from your matched rules — the defaults apply.`];
  }
  const segments: VerdictSegment[] = [`${subject} `];
  if (positives.length > 0) {
    segments.push({ modal: "would" }, ` ${joinClauses(positives)}`);
  }
  if (negatives.length > 0) {
    if (positives.length > 0) {
      segments.push(", but ");
    }
    segments.push({ modal: "would not" }, ` ${joinClauses(negatives)}`);
  }
  segments.push(".");
  return segments;
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

/** Roadmap 006/040: a rule's clause-by-clause evidence — one row per `match*`
 *  selector, with the value it was compared against and why it did or didn't
 *  match. */
function SimClauseList({ clauses }: { clauses: ClauseEvaluation[] }) {
  return (
    <ul className="sim-clauses">
      {clauses.map((clause) => (
        <li key={clause.key} className={`sim-clause state-${clause.state}`}>
          <span className="sim-clause-icon">{clauseIcon(clause.state)}</span>
          <span className="sim-clause-text">
            <code>{clause.key}</code>: {previewValue(clause.value, 60)} —{" "}
            {clauseExplanation(clause)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Roadmap 018/040: what a matching rule applied to the dependency config, as
 *  `key: before → after` rows plus the copy-as-markdown export of the same. */
function SimMergedApplied({ rule, merged }: { rule: RuleEvaluation; merged: MergedKey[] }) {
  return (
    <div className="sim-merged">
      <div className="sim-merged-title">
        Applied to the dependency config
        <CopyMarkdownButton
          className="inline"
          header={`\`packageRules[${rule.index}]\` ${ruleLabel(rule)} — ${VERDICT_LABEL[rule.verdict]}`}
          code={ruleAppliedMarkdown(merged)}
        />
      </div>
      <ul>
        {merged.map((m) => (
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
  );
}

function RuleRow({
  rule,
  layer,
  onSelectPreset,
  defaultExpanded = false,
}: {
  rule: RuleEvaluation;
  layer?: ProvenanceLayer;
  onSelectPreset?: (nodeId: string) => void;
  /** Roadmap 023: the "my rules only" filter pre-expands its rows' clause evidence. */
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Re-sync when the filter toggles (re-expand my-rules rows, collapse otherwise).
  useEffect(() => setExpanded(defaultExpanded), [defaultExpanded]);
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
            <SimClauseList clauses={rule.clauses} />
          )}
          {rule.notes.map((note) => (
            <p key={note} className="sim-note">
              {note}
            </p>
          ))}
          {rule.merged && rule.merged.length > 0 ? (
            <SimMergedApplied rule={rule} merged={rule.merged} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Roadmap 023/047: the body of the "Matched rules" drawer — the shown/filter
 * controls the persona study leaned on, then the rule rows themselves. The
 * "N of M rules shown" line stays inside the body: the drawer's own summary
 * row already carries the headline count, and this one tracks what the
 * filters are currently doing to the list below it.
 */
function SimRulesBody({
  rules,
  shownRules,
  notableCount,
  hiddenCount,
  repoRuleCount,
  myRulesOnly,
  onMyRulesOnlyChange,
  showAll,
  onShowAllChange,
  layerByIndex,
  onSelectPreset,
}: {
  rules: RuleEvaluation[];
  shownRules: RuleEvaluation[];
  notableCount: number;
  hiddenCount: number;
  repoRuleCount: number;
  myRulesOnly: boolean;
  onMyRulesOnlyChange: (value: boolean) => void;
  showAll: boolean;
  onShowAllChange: (value: boolean) => void;
  layerByIndex: Map<number, ProvenanceLayer>;
  onSelectPreset?: (nodeId: string) => void;
}) {
  const plural = rules.length === 1 ? "" : "s";
  return (
    <>
      <div className="sim-rules-head">
        <span className="sim-summary">
          {myRulesOnly
            ? `your ${repoRuleCount} config rule${repoRuleCount === 1 ? "" : "s"}`
            : showAll
              ? `all ${rules.length} rule${plural}`
              : `${notableCount} of ${rules.length} rule${plural} shown`}
        </span>
        {repoRuleCount > 0 ? (
          <button
            type="button"
            className={`sim-toggle${myRulesOnly ? " active" : ""}`}
            onClick={() => onMyRulesOnlyChange(!myRulesOnly)}
            title="Show only the packageRules from your own repo config, with their clause evidence expanded"
          >
            {myRulesOnly ? "show all rules" : "my rules only"}
          </button>
        ) : null}
        {hiddenCount > 0 && !myRulesOnly ? (
          <button type="button" className="sim-toggle" onClick={() => onShowAllChange(!showAll)}>
            {showAll ? "show matched only" : `show all ${rules.length}`}
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
              defaultExpanded={myRulesOnly}
            />
          ))}
        </div>
      ) : myRulesOnly ? (
        <p className="empty-note">
          None of your repo config&apos;s rules are in the merged set for this run.
        </p>
      ) : (
        <p className="empty-note">
          No rule matched this dependency.{" "}
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="sim-toggle inline"
              onClick={() => onShowAllChange(true)}
            >
              Show all {rules.length} anyway.
            </button>
          ) : null}
        </p>
      )}
    </>
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
  datalistId,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Roadmap 047: a `<datalist>` id — turns the field into a native
   *  type-to-search combobox without changing anything else about it. */
  datalistId?: string;
}) {
  return (
    <label className="sim-field">
      {label}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        list={datalistId}
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

/** Roadmap 047: the two `<datalist>` ids the registry comboboxes reference —
 *  the lists themselves are rendered once per simulator card. */
const DATASOURCE_LIST_ID = "sim-datasource-names";
const MANAGER_LIST_ID = "sim-manager-names";

/**
 * Roadmap 047: `datasource` (81 entries) and `manager` (115) are backed by
 * Renovate's own registries, but they are far too long for a `<select>` — so
 * they are native comboboxes: a plain text input with a `<datalist>`. Typing
 * filters the list natively, focus/arrow still shows all of it, and free text
 * stays legal, which matters twice over — `FormState` remains a plain string
 * (share-link encoding untouched) and a value the registry doesn't know (a
 * custom datasource, a newer Renovate) is neither rejected nor rewritten.
 *
 * The options ride along with the engine chunk. Before it resolves the input
 * is a perfectly ordinary text field — typing is never blocked on a fetch —
 * and the suggestions simply appear once the list arrives.
 */
function RegistryDatalist({
  id,
  names,
}: {
  id: string;
  /** null until the engine module has loaded — then no options, no dropdown. */
  names: readonly string[] | null;
}) {
  return (
    <datalist id={id}>
      {(names ?? []).map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  );
}

/** Roadmap 047: the "More about this update" drawer's computed abstract — the
 *  values it currently holds, so a wrong quick-fill is catchable without
 *  opening it, and `sourceUrl`'s scent (015's decisive matcher) survives its
 *  demotion out of the primary grid. */
function MoreFieldsSummary({ form }: { form: FormState }) {
  const shown: [string, string][] = [
    ["manager", form.manager],
    ["depType", form.depType],
    ["packageFile", form.packageFile],
    ["sourceUrl", form.sourceUrl],
  ];
  return (
    <>
      {shown.map(([key, value], i) => (
        <Fragment key={key}>
          {i > 0 ? " · " : null}
          {key} <span className="stat">{value.trim() === "" ? "—" : value.trim()}</span>
        </Fragment>
      ))}
      {" · versioning, lock files, categories, age…"}
    </>
  );
}

/**
 * Roadmap 015/047: `updateType` is no longer a primary field — 015's
 * derivation already answers it, so the form states the derived value and
 * offers the select only on demand ("cut before you hide"). Every 015
 * semantic is intact: the value tracks currentValue → newValue live while
 * untouched, "override" pins the user's own choice, and a value that could
 * NOT be derived says so instead of posing as a derivation.
 */
function UpdateTypeLine({
  effectiveUpdateType,
  derivedUpdateType,
  currentValue,
  newValue,
  onOverride,
}: {
  effectiveUpdateType: string;
  derivedUpdateType: string | undefined;
  currentValue: string;
  newValue: string;
  onOverride: () => void;
}) {
  const derived = derivedUpdateType !== undefined && effectiveUpdateType === derivedUpdateType;
  const pair = `${currentValue.trim() || "?"} → ${newValue.trim() || "?"}`;
  const hasPair = currentValue.trim() !== "" && newValue.trim() !== "";
  let note: string;
  if (derived) {
    note = `derived from ${pair}`;
  } else if (effectiveUpdateType !== "") {
    note = "not derived from these versions";
  } else if (hasPair) {
    note = `no update type could be derived from ${pair}`;
  } else {
    note = "fill the version pair to derive it";
  }
  return (
    <p className="sim-derived-line">
      <span className="value">
        <Term id="updateType">updateType</Term>: {effectiveUpdateType || "(unset)"}
      </span>{" "}
      — {note} ·{" "}
      <button type="button" className="sim-link" onClick={onOverride}>
        {effectiveUpdateType === "" ? "set one" : "override"}
      </button>
    </p>
  );
}

/** Roadmap 047: the matched rules grouped by the provenance layer that
 *  contributed them — the rules drawer's badge row ("config:recommended ×1 ·
 *  repo config ×1"), computed from the same 013 attribution the rule rows
 *  already wear. */
interface LayerMatchCount {
  layer: ProvenanceLayer;
  count: number;
}

function matchedLayerCounts(
  rules: RuleEvaluation[],
  layerByIndex: Map<number, ProvenanceLayer>,
): LayerMatchCount[] {
  const byLayer = new Map<string, LayerMatchCount>();
  for (const rule of rules) {
    if (rule.verdict !== "matched") {
      continue;
    }
    const layer = layerByIndex.get(rule.index);
    if (!layer) {
      continue;
    }
    const id = layerId(layer);
    const entry = byLayer.get(id);
    if (entry) {
      entry.count += 1;
    } else {
      byLayer.set(id, { layer, count: 1 });
    }
  }
  return [...byLayer.values()].toSorted(
    (a, b) => b.count - a.count || layerLabel(a.layer).localeCompare(layerLabel(b.layer)),
  );
}

/** How many distinct provenance layers the rules drawer names before it
 *  collapses the tail into "+N more" — a config extending a dozen presets
 *  would otherwise turn the summary row into a second rule list. */
const LAYER_BADGE_CAP = 3;

function RuleLayerBadges({
  counts,
  onSelectPreset,
}: {
  counts: LayerMatchCount[];
  onSelectPreset?: (nodeId: string) => void;
}) {
  const shown = counts.slice(0, LAYER_BADGE_CAP);
  const rest = counts.length - shown.length;
  return (
    <>
      {shown.map(({ layer, count }) => (
        <span key={layerId(layer)} className="drawer-badge">
          <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} />
          <span className="drawer-badge-count">×{count}</span>
        </span>
      ))}
      {rest > 0 ? <span className="drawer-badge-more">+{rest} more</span> : null}
    </>
  );
}

/** Roadmap 047: the rules drawer's computed abstract. "0 of 714 matched" with
 *  no badges beside it IS the no-match state — no separate empty copy. */
function RulesSummary({ matchedCount, totalRules }: { matchedCount: number; totalRules: number }) {
  return (
    <>
      <span className="stat">
        {matchedCount} of {totalRules}
      </span>{" "}
      matched
    </>
  );
}

/** Roadmap 047: the merge drawer's computed abstract — the whole timeline
 *  compressed to `base → N merges → flatten ⊘7 → final · changed groupName`,
 *  so the collapsed row still says what the merge history did. */
function MergeSummary({
  mergeCount,
  flattenCount,
  changedKeys,
}: {
  mergeCount: number;
  /** The flatten chip's own count (`+1` / `⊘7`); absent when nothing flattened. */
  flattenCount?: string;
  changedKeys: string[];
}) {
  const shown = changedKeys.slice(0, 3);
  const rest = changedKeys.length - shown.length;
  return (
    <>
      base → <span className="stat">{mergeCount}</span> merge{mergeCount === 1 ? "" : "s"}
      {flattenCount === undefined ? null : (
        <>
          {" → flatten "}
          <span className="stat">{flattenCount}</span>
        </>
      )}
      {" → final · "}
      {shown.length === 0 ? (
        "nothing changed"
      ) : (
        <>
          changed{" "}
          {shown.map((key, i) => (
            <Fragment key={key}>
              {i > 0 ? ", " : null}
              <code>{key}</code>
            </Fragment>
          ))}
          {rest > 0 ? ` +${rest} more` : null}
        </>
      )}
    </>
  );
}

/** Roadmap 046: one ledger entry of the verdict card — a setting the rules
 *  genuinely changed, plus where it came from and the merge stop that set it. */
interface VerdictChange {
  key: string;
  value: unknown;
  present: boolean;
  /** The layer that owns the rule that last set this key. */
  layer?: ProvenanceLayer;
  /** The merge-timeline stop that last set this key, and its human name. */
  stopIndex?: number;
  stopLabel?: string;
}

/** Roadmap 012/040/046: one row of the verdict card's ledger — the option a
 *  rule set, its value, (when the update-type block supplied it) where it came
 *  from, the owning layer's provenance chip, and a jump into the merge
 *  timeline. Its own component since 040's depth ratchet. */
function VerdictKeyRow({
  change,
  fromUpdateType,
  updateType,
  onSelectPreset,
  onJumpToStep,
}: {
  change: VerdictChange;
  fromUpdateType: boolean;
  updateType?: string;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
}) {
  return (
    <li>
      <code>
        <OptionKey name={change.key} flagUnknown />
      </code>
      {change.present ? (
        <>
          {" = "}
          <span className="sim-verdict-value">{previewValue(change.value, 80)}</span>
          {fromUpdateType ? (
            <span className="sim-verdict-from">
              {" "}
              from the <Term id="updateType">{updateType}</Term> block
            </span>
          ) : null}
        </>
      ) : (
        <span className="sim-verdict-value removed"> removed</span>
      )}
      {change.layer ? (
        <span className="sim-verdict-origin">
          <ProvenanceChip layer={change.layer} onSelectPreset={onSelectPreset} />
        </span>
      ) : null}
      {change.stopIndex !== undefined && onJumpToStep !== undefined ? (
        <button
          type="button"
          className="sim-step-link"
          onClick={() => onJumpToStep(change.stopIndex as number)}
        >
          {change.stopLabel ?? "see the step"} →
        </button>
      ) : null}
    </li>
  );
}

/**
 * Roadmap 012/018/040/046: the answer first — the verdict CARD directly under
 * the Simulate button. An answer band (eyebrow naming the simulated update,
 * then the sentence with the modal verbs badged), the ledger of settings the
 * rules genuinely changed (with provenance and jumps into the merge timeline),
 * the consumed-blocks aside when an AUTHORED update-type block was consumed
 * without applying (047 — default-only consumption says nothing and renders
 * nothing), and a footer with the rule-list jump and the evidence-export
 * affordances (share link, A/B pinning).
 */
function SimVerdictBlock({
  matchedCount,
  totalRules,
  segments,
  changes,
  flattened,
  consumed,
  flattenStopIndex,
  dep,
  onSelectPreset,
  onJumpToStep,
  onJumpToRules,
  copySimLink,
  pinned,
  onUnpin,
  onPin,
}: {
  matchedCount: number;
  totalRules: number;
  segments: VerdictSegment[];
  changes: VerdictChange[];
  flattened: SimulationResult["flattened"];
  /** Roadmap 047: authored update-type blocks flattening consumed without
   *  applying — empty on a run where only Renovate's own defaults were. */
  consumed: ConsumedBlock[];
  /** The flatten stop's position on the merge timeline, when it renders. */
  flattenStopIndex?: number;
  /** The simulated update, for the card's eyebrow line. */
  dep: { manager?: string; packageName?: string; currentValue?: string; newValue?: string } | null;
  onSelectPreset?: (nodeId: string) => void;
  onJumpToStep?: (stopIndex: number) => void;
  onJumpToRules: () => void;
  /** null when the host gave no share-link callback — no button then. */
  copySimLink: (() => Promise<void>) | null;
  pinned: boolean;
  onUnpin: () => void;
  onPin: () => void;
}) {
  const depName = [dep?.manager, dep?.packageName].filter(Boolean).join(" / ");
  const versions = dep?.currentValue
    ? `${dep.currentValue}${dep.newValue ? ` → ${dep.newValue}` : ""}`
    : "";
  return (
    <div className={`sim-verdict-block${matchedCount === 0 ? " none" : ""}`}>
      <div className="sim-verdict-band">
        <p className="sim-verdict-eyebrow">
          Simulation
          {depName ? ` · ${depName}` : ""}
          {versions ? ` · ${versions}` : ""}
        </p>
        <p className="sim-verdict-sentence">
          {segments.map((seg) =>
            // Content-keyed: the sentence grammar never repeats a segment
            // (subject, at most one of each modal, distinct clause texts).
            typeof seg === "string" ? (
              <Fragment key={`s:${seg}`}>{seg}</Fragment>
            ) : (
              <span
                key={`m:${seg.modal}`}
                className={`sim-modal-verb${seg.modal === "would not" ? " not" : ""}`}
              >
                {seg.modal}
              </span>
            ),
          )}
        </p>
      </div>
      <div className="sim-verdict-body">
        {changes.length > 0 ? (
          <>
            <p className="sim-verdict-ledger-label">
              Changed by the rules — {changes.length} setting{changes.length === 1 ? "" : "s"}
            </p>
            <ul className="sim-verdict-keys">
              {changes.map((change) => (
                <VerdictKeyRow
                  key={change.key}
                  change={change}
                  fromUpdateType={flattened.merged.some((m) => m.key === change.key)}
                  updateType={flattened.updateType}
                  onSelectPreset={onSelectPreset}
                  onJumpToStep={onJumpToStep}
                />
              ))}
            </ul>
          </>
        ) : (
          <p className="sim-verdict-none">
            No rule changed anything for this dependency — the defaults apply.
          </p>
        )}
        {consumed.map((block) => (
          <SimConsumedBlock
            key={block.key}
            block={block}
            updateType={flattened.updateType}
            flattenStopIndex={flattenStopIndex}
            onSelectPreset={onSelectPreset}
            onJumpToStep={onJumpToStep}
          />
        ))}
      </div>
      <div className="sim-verdict-foot">
        <button type="button" className="sim-jump" onClick={onJumpToRules}>
          {matchedCount} of {totalRules} rule{totalRules === 1 ? "" : "s"} matched →
        </button>
        {/* Roadmap 018: evidence-export affordances on the verdict card —
            a reproducible link (form + auto-run encoded) and A/B pinning. */}
        <div className="sim-verdict-actions">
          {copySimLink ? (
            <CopyButton onCopy={copySimLink} label="Copy link with this simulation" />
          ) : null}
          {pinned ? (
            <button type="button" className="sim-verdict-action" onClick={onUnpin}>
              Unpin comparison
            </button>
          ) : (
            <button
              type="button"
              className="sim-verdict-action"
              onClick={onPin}
              title="Pin this result as A, edit the config, then simulate again to compare"
            >
              Pin result for comparison
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The simulation's own validator output — errors then warnings, each with the
 *  014 translation below it. */
function SimMessages({
  errors,
  warnings,
  ruleAttribution,
  onJumpToEditor,
  onJumpToSimRule,
  errorLib,
}: {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  ruleAttribution: RuleAttribution[] | null | undefined;
  onJumpToEditor?: (repoIndex: number) => void;
  onJumpToSimRule?: (mergedIndex: number) => void;
  errorLib: ErrorTranslationLib | null;
}) {
  // Keyed by topic + text (roadmap 041) — same identity the messages panel
  // uses; the simulator re-runs on every edit, so a stale index would carry a
  // fixed message's DOM over to its replacement.
  return (
    <ul className="messages sim-messages">
      {errors.map((m) => (
        <li key={`e:${m.topic}:${m.message}`} className="error">
          <strong>{m.topic}</strong>:{" "}
          <RuleMessage
            message={m}
            indexKind="merged"
            ruleAttribution={ruleAttribution}
            onJumpToEditor={onJumpToEditor}
            onJumpToSimRule={onJumpToSimRule}
          />
          <ErrorTranslationView message={m} errorLib={errorLib} config={null} />
        </li>
      ))}
      {warnings.map((m) => (
        <li key={`w:${m.topic}:${m.message}`} className="warn">
          <strong>{m.topic}</strong>:{" "}
          <RuleMessage
            message={m}
            indexKind="merged"
            ruleAttribution={ruleAttribution}
            onJumpToEditor={onJumpToEditor}
            onJumpToSimRule={onJumpToSimRule}
          />
          <ErrorTranslationView message={m} errorLib={errorLib} config={null} />
        </li>
      ))}
    </ul>
  );
}

/** Roadmap 044: the changed keys of one merge step, as inline `<code>` chips
 *  inside the stepper's explanation row. */
function mergedKeyList(merged: MergedKey[]): ReactNode {
  return merged.map((m, i) => (
    <span key={m.key}>
      {i > 0 ? ", " : null}
      <code>
        <OptionKey name={m.key} flagUnknown />
      </code>
    </span>
  ));
}

/**
 * Roadmap 044/046: one stop of the merge timeline — its chip on the shared
 * sequence grammar and its `StepThrough` step. The sequence is base → each
 * MATCHING rule (in merge order) → update-type flattening (whenever blocks
 * existed, merged up or merely consumed) → the final per-dependency config,
 * which replaces the old "show the full resolved dependency config"
 * disclosure. Non-matching rules are deliberately absent — they merge nothing,
 * and the rule list already explains them clause by clause.
 */
interface MergeStop {
  kind: "base" | "rule" | "flatten" | "final";
  /** `kind: "rule"` only — the rule's position in `packageRules`. */
  ruleIndex?: number;
  /** The keys this stop changed (rule and flatten stops). */
  merged?: MergedKey[];
  chip: { dot?: SequenceDotLevel; label: ReactNode; count?: string; ariaLabel: string };
  step: StepThroughStep;
}

/** Stable identity so the flatten diff's widget memo never rebuilds. */
const FLATTEN_BENIGN_REMOVALS = {
  keys: UPDATE_TYPE_KEYS,
  note: "consumed by flattening — resolved into this update's config, then dropped; not a rejection",
};

function buildMergeStops(
  sim: SimulationResult,
  layerByIndex: Map<number, ProvenanceLayer>,
  onSelectPreset?: (nodeId: string) => void,
): MergeStop[] {
  const ruleSteps = sim.mergeSteps.filter((s) => s.kind === "rule");
  const nRules = ruleSteps.length;
  const flattenStep = sim.mergeSteps.find((s) => s.kind === "flatten");
  const blockKeys = Object.keys(sim.flattened.blocks);
  const base = sim.mergeSteps[0]?.before ?? sim.rawFinalConfig;

  const stops: MergeStop[] = [
    {
      kind: "base",
      chip: { dot: "skipped", label: "base", ariaLabel: "Base config — before any rule" },
      step: {
        id: "base",
        before: base,
        after: base,
        counter: "Start",
        head: <span className="migration-step-name">Base config</span>,
        explanation:
          "The effective config with the simulated dependency's fields layered on — what every rule was tested against.",
        body: <div className="empty-note">Starting point — select a merge to see its diff.</div>,
      },
    },
  ];

  for (const [i, ms] of ruleSteps.entries()) {
    const rule = sim.rules.find((r) => r.index === ms.ruleIndex);
    const layer = ms.ruleIndex === undefined ? undefined : layerByIndex.get(ms.ruleIndex);
    const changed = ms.merged.length;
    stops.push({
      kind: "rule",
      ruleIndex: ms.ruleIndex,
      merged: ms.merged,
      chip: {
        // The 024 dot vocabulary, meanings intact: green circle = ran and
        // changed nothing, amber diamond = changed things.
        dot: changed > 0 ? "changed" : "clean",
        label: <span className="stage-chip-mono">packageRules[{ms.ruleIndex}]</span>,
        count: changed > 0 ? `+${changed}` : "±0",
        ariaLabel: `Step ${i + 1} of ${nRules}: packageRules[${ms.ruleIndex}] ${
          changed > 0 ? `changed ${changed} key${changed === 1 ? "" : "s"}` : "changed nothing"
        }`,
      },
      step: {
        id: `rule-${ms.ruleIndex}`,
        before: ms.before,
        after: ms.after,
        counter: `Step ${i + 1} of ${nRules}`,
        head: (
          <>
            <span className="sim-rule-index">packageRules[{ms.ruleIndex}]</span>
            <span className="migration-step-name">{rule ? ruleLabel(rule) : "matched rule"}</span>
            {layer ? (
              <span className="sim-rule-provenance">
                <ProvenanceChip layer={layer} onSelectPreset={onSelectPreset} />
              </span>
            ) : null}
          </>
        ),
        explanation:
          changed > 0 ? (
            <>This rule set {mergedKeyList(ms.merged)}.</>
          ) : (
            <>
              This rule matched but sets nothing beyond its <code>match*</code> selectors — the
              config is unchanged after this step.
            </>
          ),
      },
    });
  }

  // The flatten stop renders whenever update-type blocks existed — merged up
  // or merely consumed. The consumed-only diff is derived here (the engine
  // only records a step when something merged up): the blocks are deleted from
  // the config exactly as upstream `flattenUpdates` does.
  if (flattenStep !== undefined || blockKeys.length > 0) {
    const before = flattenStep?.before ?? sim.rawFinalConfig;
    let after = flattenStep?.after;
    if (after === undefined) {
      const cleaned = { ...before };
      for (const key of UPDATE_TYPE_KEYS) {
        delete cleaned[key];
      }
      after = cleaned;
    }
    const mergedUp = flattenStep?.merged ?? [];
    stops.push({
      kind: "flatten",
      merged: mergedUp,
      chip: {
        dot: "changed",
        label: "flatten",
        count: mergedUp.length > 0 ? `+${mergedUp.length}` : `⊘${blockKeys.length}`,
        ariaLabel:
          mergedUp.length > 0
            ? `Update-type flattening: merged the ${flattenStep?.updateType} block up, ${mergedUp.length} key${mergedUp.length === 1 ? "" : "s"}`
            : `Update-type flattening: consumed ${blockKeys.length} block${blockKeys.length === 1 ? "" : "s"}`,
      },
      step: {
        id: "flatten",
        before,
        after,
        counter: "After the rules",
        head: (
          <>
            <span className="migration-step-name">Update-type flattening</span>
            {flattenStep?.updateType ? (
              <code className="migration-step-key">{flattenStep.updateType}</code>
            ) : null}
          </>
        ),
        explanation:
          mergedUp.length > 0 ? (
            <>
              After the rules, Renovate merges the <code>{flattenStep?.updateType}</code> block up
              into the config and then drops every update-type block. Merged:{" "}
              {mergedKeyList(mergedUp)}.
            </>
          ) : (
            <>
              Renovate resolves the update-type blocks into the config for this update, then drops
              them all —{" "}
              {sim.flattened.updateType === undefined ? (
                <>
                  <Term id="updateType">updateType</Term> is unset, so none of them applied
                </>
              ) : (
                <>
                  none of them changed anything for this <code>{sim.flattened.updateType}</code>{" "}
                  update
                </>
              )}
              ; the {blockKeys.length} block{blockKeys.length === 1 ? " was" : "s were"} consumed
              without merging anything up.
            </>
          ),
        benignRemovals: FLATTEN_BENIGN_REMOVALS,
      },
    });
  }

  stops.push({
    kind: "final",
    chip: { label: "final config", ariaLabel: "Final per-dependency config" },
    step: {
      id: "final",
      before: sim.finalDependencyConfig,
      after: sim.finalDependencyConfig,
      counter: "Result",
      head: <span className="migration-step-name">Final per-dependency config</span>,
      explanation:
        "What Renovate would use for this update — the base config plus everything the stops before this one applied.",
      body: (
        <div className="sim-final-config">
          <div className="sim-final-config-actions">
            <CopyButton
              getText={() => `${JSON.stringify(sim.finalDependencyConfig, null, 2)}\n`}
              label="Copy config"
              title="Copy the final per-dependency config as JSON"
            />
          </div>
          <pre className="config-view">
            <ConfigJson value={sim.finalDependencyConfig} />
          </pre>
        </div>
      ),
    },
  });

  return stops;
}

/**
 * Roadmap 046: the merge sequence on the app's shared sequence grammar (2B of
 * the approved mockup) — every stop visible at once as a `SequenceChip`, the
 * selected stop's detail below as the SAME 004/044 `StepThrough` interaction.
 * The chips and the stepper share one index, so Prev/Next and chip clicks are
 * two handles on the same walk.
 */
function SimMergeTimeline({
  stops,
  index,
  onIndexChange,
  timelineRef,
}: {
  stops: MergeStop[];
  index?: number;
  onIndexChange?: (index: number) => void;
  timelineRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const steps = useMemo(() => stops.map((s) => s.step), [stops]);
  const selected = Math.min(Math.max(index ?? 0, 0), stops.length - 1);
  return (
    <div className="sim-merge-steps" ref={timelineRef}>
      <SequenceTimeline label="Merge sequence">
        {stops.map((stop, i) => (
          <Fragment key={stop.step.id}>
            {i > 0 ? <SequenceSep /> : null}
            <SequenceChip
              selected={i === selected}
              dot={stop.chip.dot}
              count={stop.chip.count}
              aria-label={stop.chip.ariaLabel}
              onClick={() => onIndexChange?.(i)}
            >
              {stop.chip.label}
            </SequenceChip>
          </Fragment>
        ))}
      </SequenceTimeline>
      <StepThrough
        steps={steps}
        index={index}
        onIndexChange={onIndexChange}
        cumulativeNames={["before any rule", "after this step"]}
        cumulativeLabel="Diff vs. base config"
      />
    </div>
  );
}

/**
 * Roadmap 046/047: the body of the "How the final config was built" drawer —
 * the merge timeline. The 046 micro-heading and its standalone summary
 * sentence are gone: the drawer's own title and computed summary row say the
 * same thing while collapsed. When nothing merged, the timeline has no
 * sequence to walk and the final config falls back to the plain disclosure.
 */
function SimMergeBody({
  finalDependencyConfig,
  stops,
  showTimeline,
  mergeStepIndex,
  onMergeStepChange,
  timelineRef,
}: {
  finalDependencyConfig: SimulationResult["finalDependencyConfig"];
  stops: MergeStop[];
  showTimeline: boolean;
  mergeStepIndex?: number;
  onMergeStepChange?: (index: number) => void;
  timelineRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return showTimeline ? (
    <SimMergeTimeline
      stops={stops}
      index={mergeStepIndex}
      onIndexChange={onMergeStepChange}
      timelineRef={timelineRef}
    />
  ) : (
    <details className="sim-final">
      <summary>Show the full resolved dependency config</summary>
      <pre className="config-view">
        <ConfigJson value={finalDependencyConfig} />
      </pre>
    </details>
  );
}

// Roadmap 032: memoized — the simulator renders the full merged rule list and
// reads nothing from the editor; its callback props are identity-stable in
// App (useCallback / the latest-ref idiom), so typing never re-renders it.
export const RuleSimulator = memo(function RuleSimulator({
  result,
  onSelectPreset,
  onJumpToEditor,
  focusRuleIndex,
  onRuleFocused,
  errorLib,
  simRequest,
  onCopySimLink,
  configInvalid,
  mergeStepIndex,
  onMergeStepChange,
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
  /** Roadmap 023: validation reported errors — a real Renovate run would refuse
   *  this config, so these simulation results are hypothetical. */
  configInvalid?: boolean;
  /** Roadmap 044: the merge stepper's index, owned by App so a share link can
   *  restore it (mirrors `migrationStepIndex`). Absent = uncontrolled. */
  mergeStepIndex?: number;
  onMergeStepChange?: (index: number) => void;
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
  // Roadmap 018: applied-once bookkeeping for an incoming share `simRequest`.
  const appliedSimNonce = useRef<number | null>(null);
  const [ranKey, setRanKey] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Roadmap 023: a one-click filter to the user's OWN repo-config rules (their
  // most common "where's my rule?" wish), with clause evidence pre-expanded.
  const [myRulesOnly, setMyRulesOnly] = useState(false);
  // Roadmap 023: the merged index a cross-link asked to see before any
  // simulation exists to render its row — kept to show a "run a simulation"
  // hint rather than the click doing nothing (the "looks broken" finding).
  const [focusHint, setFocusHint] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Roadmap 015: updateType derivation. `engineModule` is loaded once, up
  // front — by the time this component can render, a run has already pulled
  // the engine chunk in (see `simulate` below), so this is a cache hit, not
  // a second network fetch. `updateTypeTouched` tracks whether the user
  // picked the select THEMSELVES: while false, the effective updateType
  // tracks currentValue/newValue live; the moment they touch the select (or
  // a quick-fill runs, which resets it) their choice wins outright, even if
  // they go on to edit the versions afterward.
  // Typed off a type-only import declaration (erased at build time, so the
  // engine still arrives only via the dynamic `import()` in the effect below).
  const [engineModule, setEngineModule] = useState<typeof EngineModule | null>(null);
  const [updateTypeTouched, setUpdateTypeTouched] = useState(false);
  // Roadmap 015: set when Simulate is clicked on a form with no identifying
  // input; cleared reactively the moment the form has ANY meaningful field.
  const [emptyGuardTriggered, setEmptyGuardTriggered] = useState(false);
  // Roadmap 047: the three summary drawers' open state. It lives here rather
  // than on the <details> elements so it survives a quick-fill, a
  // re-simulation and a new pipeline run — "a disclosure must not move or
  // reset unrelated UI", and a re-run must never fold what the user opened —
  // and so cross-links can open the drawer they target.
  const [moreFieldsOpen, setMoreFieldsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const rulesDrawerRef = useRef<HTMLDetailsElement>(null);
  const mergeDrawerRef = useRef<HTMLDetailsElement>(null);
  const ruleAttribution = useRuleProvenance(result);
  // Roadmap 023: the user's own repo-config rules (013 provenance) — the merged
  // indices that came from the repo layer, for the "my rules only" filter.
  const repoRuleIndices = useMemo(
    () =>
      new Set((ruleAttribution ?? []).filter((a) => a.layer.kind === "repo").map((a) => a.index)),
    [ruleAttribution],
  );
  // Roadmap 016: re-simulating (e.g. after editing the form and clicking
  // Simulate again) resets `showAll` to the matched-only default, which can
  // unmount rows the user was scrolled past — the browser's scroll-anchoring
  // then repicks a higher anchor and the page visibly jumps. Capture the
  // scroll position right before the state update that causes the unmount,
  // then restore it once the new DOM has painted (clamped automatically by
  // the browser if the new content is shorter than before).
  const scrollYBeforeSimulate = useRef<number | null>(null);
  // Roadmap 034: `simulate` is redeclared every render (it closes over this
  // render's `finalConfig`), so listing it in the share-link effect's deps
  // would re-run that effect on every render instead of once per link. The
  // latest-ref pattern keeps the deps `[simRequest, result]` while the effect
  // still invokes the CURRENT closure — the one that sees the config the run
  // this link triggered just produced.
  const simulateRef = useRef<
    ((nextForm: FormState, touched: boolean, keepStep?: boolean) => Promise<void>) | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const m = await import("@renovate-config-visualizer/engine");
      if (!cancelled) {
        setEngineModule(m);
      }
    })();
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
    setMyRulesOnly(false);
    setFocusHint(null);
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
      // Roadmap 044: the link's own merge-step index has already been applied
      // by App — this auto-run must not reset it back to step 0, which is the
      // whole point of a link that says "look at what THIS rule does".
      void simulateRef.current?.(next, touched, true);
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
    if (scrollTarget == null) {
      return;
    }
    if (!sim) {
      // No simulation has run yet, so the target row isn't rendered anywhere.
      // Land the user on the simulator and prompt them to run one, rather than
      // leaving the cross-link click looking dead (the "looks broken" finding).
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setFocusHint(scrollTarget);
      setScrollTarget(null);
      onRuleFocused?.();
      return;
    }
    const rule = sim.rules.find((r) => r.index === scrollTarget);
    if (!rule) {
      setScrollTarget(null);
      onRuleFocused?.();
      return;
    }
    // Roadmap 047: the rows live inside the rules drawer now — open it first
    // (nothing a link can reach may sit behind a closed drawer), then let the
    // effect re-run once the row is actually in the DOM.
    if (!rulesOpen) {
      setRulesOpen(true);
      return;
    }
    // Reveal the target row if a filter is hiding it, then let the effect re-run.
    if (myRulesOnly && !repoRuleIndices.has(rule.index)) {
      setMyRulesOnly(false);
      return;
    }
    const visible = myRulesOnly || showAll || rule.verdict !== "no-match";
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
  }, [scrollTarget, sim, showAll, myRulesOnly, rulesOpen, repoRuleIndices, onRuleFocused]);

  // Roadmap 047: a share link whose `simStep` points at a merge stop must
  // arrive with the merge drawer open — the stop it restored is inside it.
  // One-way: a re-simulation resetting the index to 0 never folds the drawer.
  useEffect(() => {
    if ((mergeStepIndex ?? 0) > 0) {
      setMergeOpen(true);
    }
  }, [mergeStepIndex]);

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

  // Roadmap 047: Renovate's own datasource/manager registries, for the two
  // dropdowns. They ride along with the engine chunk the derivation above
  // already needs, so they cost no extra fetch — null until it resolves.
  const datasourceNames = useMemo(
    () => engineModule?.listDatasourceNames() ?? null,
    [engineModule],
  );
  const managerNames = useMemo(() => engineModule?.listManagerNames() ?? null, [engineModule]);

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

  // Keys the rules changed vs. the pre-rules effective config, for the verdict
  // ledger and the final section's summary. Roadmap 046: the base is flattened
  // the same way the engine flattens `finalDependencyConfig` — the update-type
  // blocks Renovate ALWAYS deletes are not "removed by the rules", and listing
  // them as such buried the one real change under seven `removed` rows. A key
  // an update-type block genuinely merged UP still surfaces: it lands
  // top-level on the final config, where the base never had it.
  const changedKeys = useMemo(() => {
    if (!sim || !finalConfig) {
      return [];
    }
    const base: Record<string, unknown> = { ...finalConfig };
    delete base.packageRules;
    for (const key of UPDATE_TYPE_KEYS) {
      delete base[key];
    }
    const keys = new Set([...Object.keys(base), ...Object.keys(sim.finalDependencyConfig)]);
    return [...keys]
      .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(sim.finalDependencyConfig[key]))
      .toSorted();
  }, [sim, finalConfig]);

  // Roadmap 046: the merge timeline's stops — shared between the timeline
  // itself and the verdict ledger's "step N of M →" jump links.
  const mergeStops = useMemo(
    () => (sim ? buildMergeStops(sim, layerByIndex, onSelectPreset) : []),
    [sim, layerByIndex, onSelectPreset],
  );
  const flattenStopIndex = useMemo(() => {
    const i = mergeStops.findIndex((s) => s.kind === "flatten");
    return i === -1 ? undefined : i;
  }, [mergeStops]);
  // No merge recorded and no matched rule → no sequence to walk (matches the
  // 044 stepper's own guard); the final config falls back to the disclosure.
  const showTimeline = (sim?.mergeSteps.length ?? 0) > 0;
  const timelineRef = useRef<HTMLDivElement>(null);

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
  async function simulate(nextForm: FormState, touched: boolean, keepStep = false) {
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
      setFocusHint(null);
      // Roadmap 044: a new simulation is a new merge sequence — start at its
      // first step (the controlled index lives in App, so the reset does too,
      // exactly like the migration stepper's). `keepStep` is the share-link
      // auto-run, whose index the link itself just restored.
      if (!keepStep) {
        onMergeStepChange?.(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }
  // Assigned during render, below the `!finalConfig` early return above — the
  // share-link effect's own guard (`!result.finalConfig`) means it only ever
  // reaches this ref on renders where that return did NOT fire.
  simulateRef.current = simulate;

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
    // Roadmap 036: the copied state lives in CopyButton now.
    await onCopySimLink({ form: shareForm, autoSimulate: true });
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
  const shownRules = sim
    ? myRulesOnly
      ? sim.rules.filter((r) => repoRuleIndices.has(r.index))
      : showAll
        ? sim.rules
        : notableRules
    : [];
  const verdictSegments = sim
    ? buildVerdictSegments(sim, sim.flattened.updateType, changedKeys, ruleAttribution)
    : [];
  // Roadmap 047: the drawers' computed abstracts — matched rules per
  // provenance layer, and the flatten chip's own count for the merge summary.
  const layerCounts = sim ? matchedLayerCounts(sim.rules, layerByIndex) : [];
  const flattenChipCount =
    flattenStopIndex === undefined ? undefined : mergeStops[flattenStopIndex]?.chip.count;
  // Roadmap 047: the authored update-type blocks flattening consumed without
  // applying — the only thing that still earns the verdict card's aside.
  const consumedBlocks = sim ? consumedAuthoredBlocks(sim, ruleAttribution) : [];
  // Roadmap 046: each ledger entry carries the merge stop that last set its
  // key — later merges win, so the LAST stop naming the key is authoritative.
  const nRuleStops = mergeStops.filter((s) => s.kind === "rule").length;
  const verdictChanges: VerdictChange[] = changedKeys.map((key) => {
    let layer: ProvenanceLayer | undefined;
    let stopIndex: number | undefined;
    let stopLabel: string | undefined;
    for (let i = mergeStops.length - 1; i >= 0; i--) {
      const stop = mergeStops[i];
      if (!stop?.merged?.some((m) => m.key === key)) {
        continue;
      }
      stopIndex = i;
      if (stop.kind === "rule") {
        layer = stop.ruleIndex === undefined ? undefined : layerByIndex.get(stop.ruleIndex);
        const ordinal = mergeStops.slice(0, i + 1).filter((s) => s.kind === "rule").length;
        stopLabel = `step ${ordinal} of ${nRuleStops}`;
      } else {
        stopLabel = "flatten step";
      }
      break;
    }
    return {
      key,
      value: sim?.finalDependencyConfig[key],
      present: sim ? key in sim.finalDependencyConfig : false,
      layer,
      stopIndex,
      stopLabel,
    };
  });

  // Roadmap 047: cross-links OPEN what they target. The scroll runs against
  // the drawer's own <details> element, which exists whether or not its body
  // is currently mounted — so the same call works on a closed drawer that this
  // click is opening in the very same tick.
  function jumpToRules() {
    setRulesOpen(true);
    rulesDrawerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** A verdict-card jump link → open the merge drawer, select that stop, and
   *  bring the drawer into view. */
  function jumpToStep(stopIndex: number) {
    setMergeOpen(true);
    onMergeStepChange?.(stopIndex);
    mergeDrawerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="card" ref={cardRef}>
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
      {configInvalid ? <HypotheticalBanner /> : null}
      {focusHint !== null && !sim ? (
        <p className="sim-focus-hint">
          <code>packageRules[{focusHint}]</code> is evaluated here once you run a simulation —
          describe a dependency below and click Simulate to see how it matches.
        </p>
      ) : null}
      <div className="sim-presets">
        {QUICK_FILLS.map(({ label, fill }) => (
          <button key={label} type="button" onClick={() => quickFill(fill)}>
            {label}
          </button>
        ))}
      </div>
      {/* Roadmap 047: four fields before the first decision — what identifies
          the dependency and what identifies the update. Everything a
          quick-fill pre-fills, and everything 015 kept behind "More fields",
          now shares ONE drawer whose summary line shows what it holds. */}
      <RegistryDatalist id={DATASOURCE_LIST_ID} names={datasourceNames} />
      <RegistryDatalist id={MANAGER_LIST_ID} names={managerNames} />
      <div className="sim-form">
        <Field
          label="datasource"
          value={form.datasource}
          onChange={(v) => setForm({ ...form, datasource: v })}
          placeholder="(unset) — type to search"
          datalistId={DATASOURCE_LIST_ID}
        />
        <Field
          label="packageName"
          value={form.packageName}
          onChange={(v) => setForm({ ...form, packageName: v })}
          placeholder="lodash"
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
      </div>
      {updateTypeTouched ? (
        <div className="sim-form sim-form-updatetype">
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
          </label>
        </div>
      ) : (
        <UpdateTypeLine
          effectiveUpdateType={effectiveUpdateType}
          derivedUpdateType={derivedUpdateType}
          currentValue={form.currentValue}
          newValue={form.newValue}
          onOverride={() => setUpdateTypeTouched(true)}
        />
      )}
      <SummaryDrawer
        className="sim-drawer"
        title="More about this update"
        summary={<MoreFieldsSummary form={form} />}
        open={moreFieldsOpen}
        onToggle={setMoreFieldsOpen}
      >
        <div className="sim-form">
          <Field
            label="manager"
            value={form.manager}
            onChange={(v) => setForm({ ...form, manager: v })}
            placeholder="(unset) — type to search"
            datalistId={MANAGER_LIST_ID}
          />
          {/* Roadmap 015/047: sourceUrl was the decisive matcher in two of the
              persona study's three problems — it sits first among the text
              fields here, and the drawer's summary line always shows its
              value, so demoting it costs no scent. */}
          <Field
            label={<Term id="simSourceUrl">sourceUrl</Term>}
            value={form.sourceUrl}
            onChange={(v) => setForm({ ...form, sourceUrl: v })}
            placeholder="https://github.com/facebook/react — the DEPENDENCY's repo"
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
            label="versioning"
            value={form.versioning}
            onChange={(v) => setForm({ ...form, versioning: v })}
            placeholder="semver"
          />
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
      </SummaryDrawer>
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
            <SimVerdictBlock
              matchedCount={matchedCount}
              totalRules={sim.rules.length}
              segments={verdictSegments}
              changes={verdictChanges}
              flattened={sim.flattened}
              consumed={consumedBlocks}
              flattenStopIndex={showTimeline ? flattenStopIndex : undefined}
              dep={
                simForm
                  ? {
                      manager: simForm.manager || simForm.datasource || undefined,
                      packageName: simForm.packageName || simForm.depName || undefined,
                      currentValue: simForm.currentValue || undefined,
                      newValue: simForm.newValue || undefined,
                    }
                  : null
              }
              onSelectPreset={onSelectPreset}
              onJumpToStep={showTimeline ? jumpToStep : undefined}
              onJumpToRules={jumpToRules}
              copySimLink={onCopySimLink ? copySimLink : null}
              pinned={pinned !== null}
              onUnpin={() => setPinned(null)}
              onPin={() => {
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
            />

            {pinned ? (
              <ComparisonPanel
                pinned={pinned}
                comparison={comparison}
                currentDescriptor={currentDescriptor}
              />
            ) : null}

            {[...sim.errors, ...sim.warnings].length > 0 ? (
              <SimMessages
                errors={sim.errors}
                warnings={sim.warnings}
                ruleAttribution={ruleAttribution}
                onJumpToEditor={onJumpToEditor}
                onJumpToSimRule={focusRule}
                errorLib={errorLib ?? null}
              />
            ) : null}
            {sim.notes.map((note) => (
              <p key={note} className="sim-note">
                {note}
              </p>
            ))}
            {/* Roadmap 047: the evidence layers, each behind a summary drawer
                whose collapsed row abstracts what it holds. "0 of N matched"
                with no badges IS the no-match explanation. */}
            <SummaryDrawer
              className="sim-drawer"
              detailsRef={rulesDrawerRef}
              title="Matched rules"
              summary={<RulesSummary matchedCount={matchedCount} totalRules={sim.rules.length} />}
              badges={
                layerCounts.length > 0 ? (
                  <RuleLayerBadges counts={layerCounts} onSelectPreset={onSelectPreset} />
                ) : undefined
              }
              open={rulesOpen}
              onToggle={setRulesOpen}
            >
              <SimRulesBody
                rules={sim.rules}
                shownRules={shownRules}
                notableCount={notableRules.length}
                hiddenCount={hiddenCount}
                repoRuleCount={repoRuleIndices.size}
                myRulesOnly={myRulesOnly}
                onMyRulesOnlyChange={setMyRulesOnly}
                showAll={showAll}
                onShowAllChange={setShowAll}
                layerByIndex={layerByIndex}
                onSelectPreset={onSelectPreset}
              />
            </SummaryDrawer>
            <SummaryDrawer
              className="sim-drawer"
              detailsRef={mergeDrawerRef}
              title="How the final config was built"
              summary={
                <MergeSummary
                  mergeCount={nRuleStops}
                  flattenCount={flattenChipCount}
                  changedKeys={changedKeys}
                />
              }
              open={mergeOpen}
              onToggle={setMergeOpen}
            >
              <SimMergeBody
                finalDependencyConfig={sim.finalDependencyConfig}
                stops={mergeStops}
                showTimeline={showTimeline}
                mergeStepIndex={mergeStepIndex}
                onMergeStepChange={onMergeStepChange}
                timelineRef={timelineRef}
              />
            </SummaryDrawer>
          </div>
        </div>
      ) : null}
    </div>
  );
});
