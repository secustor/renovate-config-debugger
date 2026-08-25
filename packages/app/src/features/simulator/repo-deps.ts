/**
 * Roadmap 078 — the From-repository tab's data shapes, and the pure
 * `PackageDependency → FormState` mapping. The DISCOVERY (tree walk, file
 * fetches, extraction) is the app shell's (`app/use-repo-deps.ts`), following
 * the 085 layering precedent: the shell computes the view model, the feature
 * declares its types and draws it — features never import `@/app`, so the
 * types live here and the shell imports them.
 */
import type {
  ExtractedPackageFile,
  PackageDependency,
  RepoPlatform,
} from "@renovate-config-debugger/engine";
import { joinValues } from "./form";
import type { FormState } from "./form";

/**
 * Where the config on screen was loaded from — recorded by App on a
 * successful repo load (the one gesture that makes "the dependencies of your
 * repo" a meaningful offer). `suppressTokens` rides along so the discovery
 * fetches obey the same untrusted-endpoint guard the load itself did.
 */
export interface LoadedRepo {
  platform: RepoPlatform;
  /** `owner/repo` — also the label the tab shows. */
  repo: string;
  endpoint?: string;
  ref?: string;
  suppressTokens: boolean;
}

/** One pinnable row of the repository picker. */
export interface RepoDep {
  /** stable list key: packageFile + depName + index */
  key: string;
  depName: string;
  /** `package.json · ^5.8.3` — the row's muted note. */
  meta: string;
  manager: string;
  packageFile: string;
  /** What quick-pin and "refine in Manual" write into the form. */
  fill: Partial<FormState>;
}

export type RepoDepsStatus = "idle" | "loading" | "ready" | "error";

/** What the tab renders — computed by the shell, drawn by the feature. */
export interface RepoDepsView {
  status: RepoDepsStatus;
  /** `owner/repo` of the loaded repository. */
  repo: string;
  deps: RepoDep[];
  /** Package files actually extracted. */
  fileCount: number;
  /** Matched files past the fetch cap, or claimed only by unmapped managers. */
  skippedFiles: number;
  /** GitHub truncates very large trees; the listing says so. */
  truncated: boolean;
  error: string | null;
}

/**
 * The From-repository tab's offer while NO repo is loaded (the design's
 * connect panel): a share link may name the repository its config was loaded
 * from — `suggestion` — and `onConnect` grants this session repository access
 * (the load path's `LoadedRepo` record, so discovery can run) WITHOUT
 * touching the config the link installed. `onOpenLoad` opens the editor's
 * load-from-repo overlay for any other repository.
 */
export interface RepoConnectOffer {
  suggestion: string | null;
  onConnect: () => void;
  onOpenLoad: () => void;
}

export const EMPTY_REPO_DEPS: RepoDepsView = {
  status: "idle",
  repo: "",
  deps: [],
  fileCount: 0,
  skippedFiles: 0,
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
  if (typeof dep.currentValue === "string" && dep.currentValue !== "") {
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
  const registryUrls = (dep.registryUrls ?? []).filter(
    (url): url is string => typeof url === "string" && url !== "",
  );
  if (registryUrls.length > 0) {
    fill.registryUrls = joinValues(registryUrls);
  }
  return fill;
}

/** Builds the picker rows for one extracted file: named deps only (a dep
 *  without a name cannot be pinned or matched by any rule), in file order. */
export function repoDepsOfFile(file: ExtractedPackageFile): RepoDep[] {
  const rows: RepoDep[] = [];
  for (const [index, dep] of file.deps.entries()) {
    const name = dep.depName ?? dep.packageName;
    if (!name) {
      continue;
    }
    const value =
      typeof dep.currentValue === "string" && dep.currentValue !== ""
        ? dep.currentValue
        : (dep.currentVersion ?? "");
    rows.push({
      key: `${file.fileName}:${index}:${name}`,
      depName: name,
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
