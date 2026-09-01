/**
 * Roadmap 078 — the pure `PackageDependency → FormState` mapping for the
 * From-repository tab. The tab's data shapes are the shared contract in
 * `@/types/repo`; the DISCOVERY (tree walk, file fetches, extraction) lives in
 * `./use-repo-deps`.
 */
import type { ExtractedPackageFile, PackageDependency } from "@renovate-config-debugger/engine";
import { isNonEmptyString } from "@renovate-config-debugger/engine/is";
import { joinValues } from "./form";
import type { FormState } from "@/types/simulator";
import type { RepoDep, RepoDepsView } from "@/types/repo";

/** The idle view the tab renders before any discovery has run. */
export const EMPTY_REPO_DEPS: RepoDepsView = {
  status: "idle",
  repo: "",
  deps: [],
  files: [],
  managersConsidered: 0,
  customManagersConsidered: 0,
  truncated: false,
  error: null,
};

/**
 * The near-mechanical mapping 078 names: extraction's own field names and
 * values, the file's path as `packageFile`, the matched manager as `manager`.
 * Extraction reads the file — it does not know the next version, so
 * `newValue`/`updateType` stay the user's (the quick-pin buttons write those).
 */
export function depToFill(file: ExtractedPackageFile, dep: PackageDependency): Partial<FormState> {
  const fill: Partial<FormState> = {
    manager: file.manager,
    packageFile: file.fileName,
  };
  if (dep.depName) {
    fill.depName = dep.depName;
  }
  if (dep.packageName) {
    fill.packageName = dep.packageName;
  } else if (dep.depName) {
    fill.packageName = dep.depName;
  }
  if (isNonEmptyString(dep.currentValue)) {
    fill.currentValue = dep.currentValue;
  }
  if (dep.currentVersion) {
    fill.currentVersion = dep.currentVersion;
  }
  const datasource = dep.datasource ?? file.datasource;
  if (datasource) {
    fill.datasource = datasource;
  }
  if (dep.depType) {
    fill.depType = dep.depType;
  }
  if (dep.versioning) {
    fill.versioning = dep.versioning;
  }
  if (dep.lockedVersion) {
    fill.lockedVersion = dep.lockedVersion;
  }
  const registryUrls = (dep.registryUrls ?? []).filter(isNonEmptyString);
  if (registryUrls.length > 0) {
    fill.registryUrls = joinValues(registryUrls);
  }
  return fill;
}

/** Builds the picker rows for one extracted file: named deps only (a dep
 *  without a name cannot be pinned or matched by any rule), minus the ones
 *  extraction itself marked `skipReason` (file:/workspace: links, unpinned
 *  `*` ranges, engines Renovate refuses) — production Renovate never
 *  generates an update for those, so offering them as pinnable tests would
 *  be an unearned claim. In file order. */
export function repoDepsOfFile(file: ExtractedPackageFile): RepoDep[] {
  const rows: RepoDep[] = [];
  for (const [index, dep] of file.deps.entries()) {
    const name = dep.depName ?? dep.packageName;
    if (!name || dep.skipReason) {
      continue;
    }
    const value = isNonEmptyString(dep.currentValue)
      ? dep.currentValue
      : (dep.currentVersion ?? "");
    rows.push({
      key: `${file.fileName}:${index}:${name}`,
      depName: name,
      value,
      meta: value === "" ? file.fileName : `${file.fileName} · ${value}`,
      manager: file.manager,
      packageFile: file.fileName,
      fill: depToFill(file, dep),
    });
  }
  return rows;
}

/** A picked row on its way to being a pin: the dep, the chosen update type,
 *  and the (optional) next version the reader types. */
export interface RepoDraft {
  dep: RepoDep;
  type: "patch" | "minor" | "major";
  newValue: string;
}

/** What the draft's Pin writes: the extracted descriptor plus the reader's
 *  chosen update type and, when typed, the next version. */
export function draftFill(draft: RepoDraft): Partial<FormState> {
  const fill: Partial<FormState> = { ...draft.dep.fill, updateType: draft.type };
  const newValue = draft.newValue.trim();
  if (newValue !== "") {
    fill.newValue = newValue;
  }
  return fill;
}

/** Rows the picker shows before the "… N more across …" line — the design's
 *  cap (5 rows, then the footer counts the rest). The list never grows past
 *  it, so the tab keeps its height and the search is the way to the tail. */
export const REPO_DEPS_SHOWN = 5;

/** The package files of the rows past the cap, distinct and in row order —
 *  the "… N more across package.json, Dockerfile, …" footer names them. */
export function hiddenDepFiles(hidden: readonly RepoDep[]): string[] {
  const files: string[] = [];
  for (const dep of hidden) {
    if (!files.includes(dep.packageFile)) {
      files.push(dep.packageFile);
    }
  }
  return files;
}

/** Case-insensitive substring filter over name, file and manager — the search
 *  row's semantics. */
export function filterRepoDeps(deps: readonly RepoDep[], query: string): RepoDep[] {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return [...deps];
  }
  return deps.filter(
    (dep) =>
      dep.depName.toLowerCase().includes(q) ||
      dep.packageFile.toLowerCase().includes(q) ||
      dep.manager.toLowerCase().includes(q),
  );
}
