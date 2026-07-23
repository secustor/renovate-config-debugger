import { useEffect, useMemo, useState } from "react";
import type {
  ClauseEvaluation,
  DependencyDescriptor,
  RuleEvaluation,
  SimulationResult,
  TraceResult,
} from "@renovate-config-visualizer/engine";
import { OptionKey } from "../option-docs";
import { ConfigJson } from "./ConfigJson";

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

function toDescriptor(form: FormState): DependencyDescriptor {
  // "bump" is a real Renovate updateType, but matchUpdateTypes only sees it
  // via the isBump flag on in-range updates — set both.
  const updateType = trimmed(form.updateType);
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

function previewValue(value: unknown, max = 60): string {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function inputsPreview(clause: ClauseEvaluation): string {
  const entries = Object.entries(clause.inputValues);
  if (entries.length === 0) {
    return "no input value set";
  }
  return entries.map(([key, value]) => `${key} = ${previewValue(value, 40)}`).join(", ");
}

function clauseIcon(state: ClauseEvaluation["state"]): string {
  if (state === "matched") {
    return "✓";
  }
  if (state === "no-match" || state === "error") {
    return "✗";
  }
  return "⚠";
}

function clauseExplanation(clause: ClauseEvaluation): string {
  switch (clause.state) {
    case "matched":
      return `matched (${inputsPreview(clause)})`;
    case "no-match":
      return `no match against ${inputsPreview(clause)}`;
    default:
      return clause.note ?? clause.state;
  }
}

const VERDICT_LABEL: Record<RuleEvaluation["verdict"], string> = {
  matched: "matched",
  "no-match": "no match",
  "not-simulated": "not simulated",
};

/** Short label: the rule's first present selector clause + value preview. */
function ruleLabel(rule: RuleEvaluation): string {
  const first = rule.clauses[0];
  if (!first) {
    return "no match* selectors";
  }
  return `${first.key}: ${previewValue(first.value, 48)}`;
}

function RuleRow({ rule }: { rule: RuleEvaluation }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`sim-rule${expanded ? " expanded" : ""}`}>
      <button
        type="button"
        className="sim-rule-head"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="caret">{expanded ? "▾" : "▸"}</span>
        <span className="sim-rule-index">#{rule.index + 1}</span>
        <span className="sim-rule-label">{ruleLabel(rule)}</span>
        <span className={`badge sim-verdict verdict-${rule.verdict}`}>
          {VERDICT_LABEL[rule.verdict]}
        </span>
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
              <div className="sim-merged-title">Applied to the dependency config</div>
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

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
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
        spellCheck={false}
      />
    </label>
  );
}

export function RuleSimulator({ result }: { result: TraceResult }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [sim, setSim] = useState<SimulationResult | null>(null);
  const [ranKey, setRanKey] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new run invalidates any previous simulation (the rules may differ).
  useEffect(() => {
    setSim(null);
    setRanKey(null);
    setError(null);
  }, [result]);

  const finalConfig = result.finalConfig;
  const packageRules = useMemo(
    () => (Array.isArray(finalConfig?.packageRules) ? finalConfig.packageRules : []),
    [finalConfig],
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

  if (!finalConfig) {
    return null;
  }

  async function simulate(nextForm: FormState) {
    if (!finalConfig) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const engine = await import("@renovate-config-visualizer/engine");
      const simResult = await engine.simulatePackageRules({
        config: finalConfig,
        dep: toDescriptor(nextForm),
      });
      setSim(simResult);
      setRanKey(JSON.stringify(nextForm));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  function quickFill(fill: Partial<FormState>) {
    const next = { ...EMPTY_FORM, ...fill };
    setForm(next);
    void simulate(next);
  }

  if (packageRules.length === 0) {
    return (
      <div className="card">
        <div className="card-title">packageRules simulator</div>
        <p className="empty-note">
          This config has no <code>packageRules</code> — nothing to simulate. Rules added by presets
          would appear here after a run that resolves them.
        </p>
      </div>
    );
  }

  const stale = sim !== null && ranKey !== JSON.stringify(form);
  const matchedCount = sim?.rules.filter((r) => r.verdict === "matched").length ?? 0;

  return (
    <div className="card">
      <div className="card-title">
        packageRules simulator
        <span className="sim-title-hint">
          {" "}
          — which of the {packageRules.length} rule{packageRules.length === 1 ? "" : "s"} hit a
          hypothetical update?
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
        <label className="sim-field">
          updateType
          <select
            value={form.updateType}
            onChange={(e) => setForm({ ...form, updateType: e.target.value })}
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
            label="sourceUrl"
            value={form.sourceUrl}
            onChange={(v) => setForm({ ...form, sourceUrl: v })}
            placeholder="https://github.com/lodash/lodash"
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
            label="repository"
            value={form.repository}
            onChange={(v) => setForm({ ...form, repository: v })}
            placeholder="my-org/my-repo"
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
          onClick={() => void simulate(form)}
          disabled={running}
        >
          {running ? "Simulating…" : "Simulate"}
        </button>
        {stale ? (
          <span className="sim-stale">inputs changed — simulate again to refresh</span>
        ) : null}
      </div>

      {error ? <p className="sim-error">Simulation failed: {error}</p> : null}

      {sim ? (
        <div className="sim-results">
          {[...sim.errors, ...sim.warnings].length > 0 ? (
            <ul className="messages sim-messages">
              {sim.errors.map((m, i) => (
                <li key={`e${i}`} className="error">
                  <strong>{m.topic}</strong>: {m.message}
                </li>
              ))}
              {sim.warnings.map((m, i) => (
                <li key={`w${i}`} className="warn">
                  <strong>{m.topic}</strong>: {m.message}
                </li>
              ))}
            </ul>
          ) : null}
          {sim.notes.map((note) => (
            <p key={note} className="sim-note">
              {note}
            </p>
          ))}
          <div className="sim-summary">
            {matchedCount} of {sim.rules.length} rule{sim.rules.length === 1 ? "" : "s"} matched
          </div>
          <div className="sim-rules">
            {sim.rules.map((rule) => (
              <RuleRow key={rule.index} rule={rule} />
            ))}
          </div>
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
      ) : null}
    </div>
  );
}
