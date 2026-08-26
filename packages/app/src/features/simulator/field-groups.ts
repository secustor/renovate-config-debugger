import type { TermId } from "@/data/glossary-data";
import { MANAGER_LIST_ID } from "./datalist-ids";
import { MULTI_VALUE_KEYS } from "./form";
import type { FormState } from "@/types/simulator";

/**
 * Roadmap 079: the three named field groups, and the fields each one holds.
 *
 * The list lives apart from the components because the count pill on a CLOSED
 * group is derived from it — the header has to be able to say how many of its
 * fields hold a value without the fields being mounted — and because a group's
 * membership is a fact about the descriptor, unit-testable without a DOM.
 *
 * Together with the sentence line's own five fields (`packageName`,
 * `currentValue`, `newValue`, `datasource` and the derived `updateType` chip)
 * these cover `FormState` exactly: a field in neither place would be a field
 * the form never shows.
 */
export const GROUP_KEYS = {
  repo: ["manager", "packageFile", "depType", "depName"],
  source: ["sourceUrl", "registryUrls", "repository", "baseBranch"],
  versioning: [
    "versioning",
    "currentVersion",
    "lockedVersion",
    "lockFiles",
    "categories",
    "currentVersionTimestamp",
  ],
} as const satisfies Record<string, readonly (keyof FormState)[]>;

/** How many of a group's fields carry a value — the closed group's count pill. */
export function countSet(form: FormState, keys: readonly (keyof FormState)[]): number {
  return keys.filter((key) => form[key].trim() !== "").length;
}

/** A field a group holds — every one of them, since the groups partition
 *  everything the sentence line does not own. */
export type GroupedKey = (typeof GROUP_KEYS)[keyof typeof GROUP_KEYS][number];

/** What a placeholder is allowed to read when it names something only the
 *  running app knows — the registries that ride along with the engine chunk,
 *  and so are null until it resolves. */
export interface FieldContext {
  managerNames: readonly string[] | null;
}

/**
 * Everything the form needs to render one field BESIDES its group and its
 * order, both of which `GROUP_KEYS` above already states.
 *
 * The field's own name is the label text and the `FormState` key alike, so it
 * is the record's key rather than a third copy of the same string. Every
 * label wears the glossary hover (`term`): these are Renovate's own descriptor
 * fields, and the card is where "which matcher reads this" is answered without
 * leaving the form. It is the app's richer form of the design's `title`
 * tooltips, and it is keyboard-reachable, which a title is not.
 */
export interface FieldSpec {
  term: TermId;
  placeholder?: string | ((ctx: FieldContext) => string);
  /** Roadmap 047: a `<datalist>` id — turns the field into a native
   *  type-to-search combobox without changing anything else about it. */
  datalist?: string;
}

/**
 * Roadmap 079: the fields as data, one entry per grouped key.
 *
 * `Record<GroupedKey, …>` is the invariant that made this a table: a field
 * added to a group above and forgotten here is a type error, where before it
 * was a group whose count pill counted a field it never rendered.
 */
export const FIELD_SPECS: Record<GroupedKey, FieldSpec> = {
  manager: {
    term: "manager",
    placeholder: ({ managerNames }) =>
      managerNames === null
        ? "(unset) — type to search"
        : `(unset) — type to search ${managerNames.length} managers`,
    datalist: MANAGER_LIST_ID,
  },
  packageFile: { term: "simPackageFile", placeholder: "package.json" },
  depType: { term: "simDepType", placeholder: "dependencies" },
  depName: { term: "simDepName", placeholder: "= packageName" },
  // Roadmap 015/047: sourceUrl was the decisive matcher in two of the persona
  // study's three problems, so it leads its group — and the group's own
  // question ("where it comes from") is the scent the old drawer's summary line
  // had to spell out.
  sourceUrl: { term: "simSourceUrl", placeholder: "https://github.com/lodash/lodash" },
  registryUrls: { term: "simRegistryUrls", placeholder: "add URL, press ⏎" },
  repository: { term: "simRepository", placeholder: "your-org/your-repo" },
  baseBranch: { term: "simBaseBranch", placeholder: "main" },
  versioning: { term: "simVersioning", placeholder: "semver" },
  currentVersion: { term: "simCurrentVersion" },
  lockedVersion: { term: "simLockedVersion" },
  lockFiles: { term: "simLockFiles", placeholder: "add file, press ⏎" },
  categories: { term: "simCategories", placeholder: "add category, press ⏎" },
  currentVersionTimestamp: {
    term: "simCurrentVersionTimestamp",
    placeholder: "2024-01-01T00:00:00.000Z",
  },
};

/** The three groups in the order the form shows them, each with the question
 *  its header asks. */
export const FIELD_GROUPS = [
  { title: "Where it lives in your repo", keys: GROUP_KEYS.repo },
  { title: "Where it comes from", keys: GROUP_KEYS.source },
  { title: "Versioning details", keys: GROUP_KEYS.versioning },
] as const;

/** Whether a field is one of the chip editors — read from `MULTI_VALUE_KEYS`
 *  rather than restated, so the editor a field gets and the shape
 *  `toDescriptor` sends can never disagree. */
export function isMultiValue(key: GroupedKey): boolean {
  return (MULTI_VALUE_KEYS as readonly string[]).includes(key);
}

/** The placeholder a field shows, resolved against what the app knows now. */
export function fieldPlaceholder(spec: FieldSpec, ctx: FieldContext): string | undefined {
  return typeof spec.placeholder === "function" ? spec.placeholder(ctx) : spec.placeholder;
}
