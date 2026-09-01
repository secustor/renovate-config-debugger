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

/**
 * Roadmap 090: what became of ONE file the discovery walk matched.
 *
 * `not-read` is the fetch cap (and only the cap): the file was claimed and
 * never fetched, so nothing whatever is known about its contents — which is
 * exactly what the Extract phase's rows must say instead of "no deps".
 */
export type RepoDepFileOutcome = "extracted" | "no-deps" | "not-read" | "unreadable" | "error";

/** One file of the walk: who claimed it, and what came back. */
export interface RepoDepFile {
  path: string;
  /** The extractable managers whose file patterns claim this path — several
   *  managers legitimately claim one filename. */
  managers: string[];
  /** The first manager whose extraction produced this file's rows, or null when
   *  the file was never read or produced nothing — one file can be extracted by
   *  a built-in AND by custom-manager blocks (roadmap 093). */
  extractedBy: string | null;
  /** Named, pinnable dependencies this file contributed. */
  depCount: number;
  outcome: RepoDepFileOutcome;
  /** Why extraction failed, when `outcome` is `error`; absent otherwise. */
  error?: string;
}

/** What the tab renders — computed by the shell, drawn by the feature. */
export interface RepoDepsView {
  status: RepoDepsStatus;
  /** `owner/repo` of the loaded repository. */
  repo: string;
  deps: RepoDep[];
  /** Roadmap 090: every matched file, in walk order — the Extract phase's
   *  ledger, and the ONE source every count is derived from
   *  (`lib/discovery-caveats.ts`). Matching is the cheap path-only step, so
   *  this covers the whole walk; the fetch cap only decides which were READ. */
  files: RepoDepFile[];
  /** Roadmap 090: how many managers the walk asked — the honest denominator
   *  for "K of N managers matched files". */
  managersConsidered: number;
  /** Roadmap 093: the custom half of that denominator — how many of the run's
   *  `customManagers` blocks the walk could ask (enabled, a supported
   *  customType, at least one file pattern). 0 when the run supplied none. */
  customManagersConsidered: number;
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
