/**
 * Roadmap 089 — the Dependencies tab's table model: the columns, the
 * groupings, and the pure `RepoDep → DataTableRow` mapping.
 *
 * Every value here already exists on the row the 087 discovery produced —
 * `RepoDep.fill` is the descriptor Renovate's own extraction filled in — so
 * this file reads it and never recomputes it. Pure and DOM-free, which is what
 * lets the grouping, the badge rule and the field list be unit-tested without
 * a renderer.
 */
import type {
  DataTableAction,
  DataTableColumn,
  DataTableField,
  DataTableGrouping,
  DataTableRow,
} from "@/components/data-table";
import type { RepoDep } from "@/types/repo";
import type { TermId } from "@/data/glossary-data";
import type { FormState } from "@/types/simulator";

export const DEP_COLUMN_IDS = {
  currentValue: "currentValue",
  datasource: "datasource",
  depType: "depType",
  manager: "manager",
  packageFile: "packageFile",
} as const;

/**
 * The design's column set. Three are on by default — what a reader scanning a
 * dependency list actually asks of a row ("what version, from where, in what
 * capacity") — and the two that repeat the GROUPING are off, because the
 * default grouping is by package file and the manager rides on its header
 * pills. Both are one click away in the gear, which is the point of having it.
 */
export const DEP_COLUMNS: readonly DataTableColumn[] = [
  { id: DEP_COLUMN_IDS.currentValue, label: "Current value", defaultOn: true, mono: true },
  { id: DEP_COLUMN_IDS.datasource, label: "Datasource", defaultOn: true },
  { id: DEP_COLUMN_IDS.depType, label: "depType", defaultOn: true },
  { id: DEP_COLUMN_IDS.manager, label: "Manager", defaultOn: false },
  { id: DEP_COLUMN_IDS.packageFile, label: "Package file", defaultOn: false, mono: true },
];

export const DEP_GROUPINGS: readonly DataTableGrouping[] = [
  { id: DEP_COLUMN_IDS.packageFile, label: "Package file" },
  { id: DEP_COLUMN_IDS.manager, label: "Manager" },
];

/** Package file first: extraction walks a repository file by file, so it is
 *  the order the rows already arrive in AND the one a reader recognizes. */
export const DEP_DEFAULT_GROUPING: string = DEP_COLUMN_IDS.packageFile;

/**
 * The expanded row's definition list, in reading order: what the dependency
 * IS, then what it currently resolves to, then where it was found, then the
 * lookup details. Fields the descriptor left empty are dropped — a list of
 * blanks says nothing, and extraction fills only what the file states.
 *
 * The labels are Renovate's own field names, deliberately: this row IS the
 * descriptor a pinned test would carry, and a reader who takes it to the
 * simulator (or to a `packageRules` clause) needs the name the config uses.
 */
const DEP_FIELD_ORDER: readonly (keyof FormState)[] = [
  "depName",
  "packageName",
  "currentValue",
  "currentVersion",
  "lockedVersion",
  "datasource",
  "depType",
  "versioning",
  "manager",
  "packageFile",
  "registryUrls",
  "sourceUrl",
  "categories",
  "lockFiles",
  "repository",
  "baseBranch",
  "currentVersionTimestamp",
  "newValue",
  "updateType",
];

/** The glossary entry explaining each field — the same cards the manual form's
 *  labels carry (`field-groups.ts`). The unmapped fields (packageName,
 *  currentValue, newValue) have no entry and stay plain. */
const DEP_FIELD_TERMS: Partial<Record<keyof FormState, TermId>> = {
  depName: "simDepName",
  currentVersion: "simCurrentVersion",
  lockedVersion: "simLockedVersion",
  datasource: "datasource",
  depType: "simDepType",
  versioning: "simVersioning",
  manager: "manager",
  packageFile: "simPackageFile",
  registryUrls: "simRegistryUrls",
  sourceUrl: "simSourceUrl",
  categories: "simCategories",
  lockFiles: "simLockFiles",
  repository: "simRepository",
  baseBranch: "simBaseBranch",
  currentVersionTimestamp: "simCurrentVersionTimestamp",
  updateType: "updateType",
};

export function depFields(fill: Partial<FormState>): DataTableField[] {
  const fields: DataTableField[] = [];
  for (const key of DEP_FIELD_ORDER) {
    const value = fill[key];
    const term = DEP_FIELD_TERMS[key];
    if (typeof value === "string" && value !== "") {
      fields.push({ label: key, value, ...(term === undefined ? {} : { term }) });
    }
  }
  return fields;
}

/**
 * Roadmap 063's managers, when they land: a custom (regex/jsonata) manager's
 * dependencies come from a rule the READER wrote, not from a file format
 * Renovate knows, so a row from one says so. Nothing produces such a manager
 * id yet — the badge is the shape being ready, and costs one string test.
 */
export function depBadge(manager: string): { text: string; title: string } | undefined {
  if (!manager.startsWith("custom.")) {
    return undefined;
  }
  return {
    text: manager,
    title:
      "extracted by a custom manager — the match came from a user-defined rule, not a known file format",
  };
}

/** What the two row actions do. The shell performs both (a pin is App's list,
 *  the simulator is another tab), so the panel is handed them and this only
 *  names them. */
export interface DepRowActions {
  onPin: (fill: Partial<FormState>) => void;
  onOpenInSimulator: (fill: Partial<FormState>) => void;
}

function depActions(dep: RepoDep, actions: DepRowActions): DataTableAction[] {
  return [
    {
      id: "pin",
      label: "Pin as test",
      title: "Pin this dependency as a standing test on the Tests tab",
      onClick: () => actions.onPin(dep.fill),
    },
    {
      id: "simulate",
      label: "Open in simulator",
      title: "Simulate this dependency against the resolved config",
      onClick: () => actions.onOpenInSimulator(dep.fill),
    },
  ];
}

export function depTableRow(dep: RepoDep, actions: DepRowActions): DataTableRow {
  const badge = depBadge(dep.manager);
  return {
    key: dep.key,
    lead: dep.depName,
    cells: {
      [DEP_COLUMN_IDS.currentValue]: dep.value,
      [DEP_COLUMN_IDS.datasource]: dep.fill.datasource ?? "",
      [DEP_COLUMN_IDS.depType]: dep.fill.depType ?? "",
      [DEP_COLUMN_IDS.manager]: dep.manager,
      [DEP_COLUMN_IDS.packageFile]: dep.packageFile,
    },
    groups: {
      // The package-file header wears the managers that read it: several
      // managers legitimately claim one filename (pyproject.toml is pep621's,
      // pixi's and poetry's), and the pills are where that shows.
      [DEP_COLUMN_IDS.packageFile]: { title: dep.packageFile, pill: dep.manager },
      [DEP_COLUMN_IDS.manager]: { title: dep.manager },
    },
    ...(badge === undefined ? {} : { badge }),
    fields: depFields(dep.fill),
    actions: depActions(dep, actions),
  };
}

export function depTableRows(deps: readonly RepoDep[], actions: DepRowActions): DataTableRow[] {
  return deps.map((dep) => depTableRow(dep, actions));
}
