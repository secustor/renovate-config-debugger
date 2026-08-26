import type { RepoPlatform } from "@renovate-config-debugger/engine";
import type { FormState } from "./simulator";

/**
 * The repository CONTRACT types — the shapes the app shell and the feature
 * slices agree on when they talk about a loaded repository.
 *
 * Why they are here rather than in the slices that render them: the documented
 * "085 layering precedent" had the shell compute a view model and the FEATURE
 * declare its type, which is a workaround for the no-`@/app` rule and inverts
 * the dependency it exists to protect. `features/simulator/repo-deps.ts` had
 * eight consumers, four of them shell; deleting the simulator slice broke six
 * shell modules — so the stated goal of the cross-feature ban, that a slice
 * stays extractable, did not actually hold.
 *
 * With the types down here both sides import DOWNWARD: the shell fills these
 * in, the slices render them, and neither names the other. The functions that
 * build and interpret them stay feature-local — only the contract moved.
 *
 * Every affected import was already type-only, so this is a zero-runtime
 * change. `src/types/` is shared automatically: the shared-layer lint override
 * is written as "everything under src/ that is not a feature or the shell", so
 * a new folder is inside the boundary without touching the config.
 */

/** A repository this session has been granted access to — what the load path
 *  records so dependency discovery has somewhere to run. */
export interface LoadedRepo {
  platform: RepoPlatform;
  /** `owner/repo` — also the label the tab shows. */
  repo: string;
  endpoint?: string;
  ref?: string;
  suppressTokens: boolean;
}

export type RepoDepsStatus = "idle" | "loading" | "ready" | "error";

/** One pinnable row of the repository picker. */
export interface RepoDep {
  /** stable list key: packageFile + depName + index */
  key: string;
  depName: string;
  /** The extracted value — `currentValue`, else `currentVersion`, else `""`.
   *  One derivation for the row's meta, the draft sentence's "from", and the
   *  pinned-badge tiebreak. */
  value: string;
  /** `package.json · ^5.8.3` — the row's muted note. */
  meta: string;
  manager: string;
  packageFile: string;
  /** What quick-pin and "refine in Manual" write into the form. */
  fill: Partial<FormState>;
}

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
  /** Opens the editor's load-from-repo overlay; the panel passes its own
   *  button so a dismissal returns focus HERE, not to the editor column. */
  onOpenLoad: (returnFocus?: HTMLElement) => void;
}

/** One row of the signed-in repository picker. */
export interface RepoPickerRow {
  /** `owner/repo`. */
  name: string;
  /** `TypeScript · 2d ago`. */
  note: string;
  /** The config file a load would find: a name, null after a probe found
   *  nothing, undefined while unknown (probe pending or failed). */
  configFile: string | null | undefined;
  /** Whether the reference field currently names this repo. */
  selected: boolean;
}

/** The whole picker as the shell computes it. */
export interface RepoPickerView {
  status: "loading" | "error" | "ready";
  rows: RepoPickerRow[];
  /** Matches beyond the rows shown — the "and N more" line. */
  hiddenMatches: number;
  onPick: (name: string) => void;
}
