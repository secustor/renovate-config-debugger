import type { DependencyDescriptor } from "@renovate-config-debugger/engine";
import type { FormState } from "@/types/simulator";

export const EMPTY_FORM: FormState = {
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

export const UPDATE_TYPES = [
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
export const QUICK_FILLS: { label: string; fill: Partial<FormState> }[] = [
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

/**
 * Roadmap 079: the quick-fill the form still agrees with, or null.
 *
 * "Agrees with" is every value the fill writes still being the form's — an
 * edit to one of them drops the chip, an edit to a field the fill never
 * touched keeps it. Derived rather than remembered, so the chip cannot outlive
 * the form it describes (a pin clears the form; the empty state's own
 * quick-start chips seed it from outside the simulator form entirely).
 */
export function activeQuickFill(form: FormState): string | null {
  const hit = QUICK_FILLS.find(({ fill }) =>
    Object.entries(fill).every(([key, value]) => form[key as keyof FormState] === value),
  );
  return hit?.label ?? null;
}

function trimmed(value: string): string | undefined {
  const t = value.trim();
  return t === "" ? undefined : t;
}

/**
 * Roadmap 079: the comma-separated multi-value fields, split for display.
 *
 * `FormState` keeps these as ONE string on purpose — the share-link codec
 * encodes the form as flat strings and `list()` below is what Renovate
 * actually receives — so the chip editor is a view over that string, not a
 * second representation of it. A value containing a comma cannot be expressed
 * either way, which is the same limit the comma-separated text field had.
 */
export function splitValues(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** The inverse of `splitValues` — what a chip edit writes back into the form. */
export function joinValues(values: readonly string[]): string {
  return values.join(", ");
}

// Roadmap 079 follow-up: a paste containing any of these reads as several
// values, not one — comma/semicolon-separated lists and newline- or
// whitespace-separated lists are both things a user's clipboard holds.
const PASTE_SEPARATOR = /[,;\s]/;
const PASTE_SEPARATOR_RUN = /[,;\s]+/;

/**
 * The values a pasted blob carries, or `null` when it carries only one.
 *
 * `null` is the "not ours" answer: a paste with no separator falls through to
 * the browser's own insertion, which already handles a cursor position and a
 * selection correctly. An empty array is a different answer — the paste WAS a
 * list, of nothing (a lone comma, a run of whitespace) — and the chip editor
 * claims it rather than inserting the separators as text.
 */
export function splitPastedValues(text: string): string[] | null {
  if (!PASTE_SEPARATOR.test(text)) {
    return null;
  }
  return text
    .split(PASTE_SEPARATOR_RUN)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** The fields this form keeps as ONE comma-separated string but Renovate — and
 *  so a pasted descriptor — carries as an array. `list()` below is what turns
 *  them back into one. */
export const MULTI_VALUE_KEYS = [
  "lockFiles",
  "registryUrls",
  "categories",
] as const satisfies readonly (keyof FormState)[];

function list(value: string): string[] | undefined {
  const items = splitValues(value);
  return items.length > 0 ? items : undefined;
}

/**
 * @param effectiveUpdateType Roadmap 015: the updateType to actually send —
 * the derived value when the user hasn't manually overridden the select,
 * `form.updateType` otherwise. Defaults to `form.updateType` so callers that
 * only need e.g. the empty-form check don't have to compute derivation.
 */
export function toDescriptor(form: FormState, effectiveUpdateType?: string): DependencyDescriptor {
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
export function hasMeaningfulInput(form: FormState): boolean {
  return Object.values(toDescriptor(form)).some((v) => v !== undefined);
}
