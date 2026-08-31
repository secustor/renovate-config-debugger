import type { TermId } from "@/data/glossary-data";
import type { FormState } from "@/types/simulator";

/**
 * The ONE field → glossary-term table for Renovate's dependency descriptor:
 * which card explains each `FormState` field's label, wherever that label is
 * drawn (the simulator form's inputs, the dependency row's definition list).
 * Two feature slices need it and may not import each other, so it lives here.
 *
 * `Record<keyof FormState, …>` is the invariant: a new descriptor field is a
 * compile error here, never a silently hoverless label. `null` marks the one
 * field with no card. Declaration order is the descriptor's reading order —
 * what the dependency IS, what it currently resolves to, where it was found,
 * then the lookup details — and consumers that render every field walk it.
 */
export const DESCRIPTOR_TERMS = {
  depName: "simDepName",
  packageName: "simPackageName",
  currentValue: "simCurrentValue",
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
  newValue: null,
  updateType: "updateType",
} as const satisfies Record<keyof FormState, TermId | null>;

/** Every descriptor field, in reading order. The cast is the standard
 *  `Object.keys` widening; the table's `Record` bound keeps it honest. */
export const DESCRIPTOR_FIELD_ORDER = Object.keys(DESCRIPTOR_TERMS) as readonly (keyof FormState)[];
