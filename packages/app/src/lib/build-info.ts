import { isPlainObject } from "@/lib/input-schemas";

/**
 * Roadmap 088 — the build identity behind "verify this build".
 *
 * `__BUILD_INFO__` is a vite `define` (see vite.config.ts): only
 * commit-derived facts, so rebuilding the same commit reproduces the bundle
 * byte-for-byte. A build without git (the Docker image) has `commit: null`,
 * and everything downstream — the landing line, the pane-foot stamp — hides
 * itself rather than showing an identity nothing can verify.
 */

export interface BuildIdentity {
  /** GitHub `owner/name` slug — the attestation's `-R` argument. */
  repo: string;
  /** Full commit SHA the bundle was built from. */
  commit: string;
  /** Latest release tag reachable from that commit (without the `v`), if any. */
  version: string | null;
  /** Commits between that tag and this commit — 0 means the build IS the
   *  tagged release; null means the distance is unknown. */
  versionDistance: number | null;
  /** The commit's committer date (ISO 8601) — shown as "built". */
  commitTime: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function count(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

/** Validated read of the injected value — exported for its tests. */
export function parseBuildIdentity(raw: unknown): BuildIdentity | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const repo = str(raw.repo);
  const commit = str(raw.commit);
  if (!repo || !commit) {
    return null;
  }
  return {
    repo,
    commit,
    version: str(raw.version),
    versionDistance: count(raw.versionDistance),
    commitTime: str(raw.commitTime),
  };
}

export const BUILD_INFO: BuildIdentity | null =
  typeof __BUILD_INFO__ === "undefined" ? null : parseBuildIdentity(__BUILD_INFO__);

export function shortCommit(info: BuildIdentity): string {
  return info.commit.slice(0, 7);
}

/** "v0.5.0" only when the tag points AT the built commit; any other build —
 *  a commit after the tag, or an unknown distance — has no version at all
 *  and is identified by its sha. A version must never dress up a commit
 *  that is not the release. */
export function formatVersion(info: BuildIdentity): string | null {
  return info.version !== null && info.versionDistance === 0 ? `v${info.version}` : null;
}

export function commitUrl(info: BuildIdentity): string {
  return `https://github.com/${info.repo}/commit/${info.commit}`;
}

/** "2026-08-25 14:02 UTC" — stable regardless of the reader's locale. */
export function formatCommitTime(iso: string): string | null {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) {
    return null;
  }
  const day = time.toISOString().slice(0, 10);
  const clock = time.toISOString().slice(11, 16);
  return `${day} ${clock} UTC`;
}

export interface VerifyCommands {
  /** Fetch the served manifest, check GitHub's signed CI attestation on it. */
  attest: string;
  /** Clone, rebuild the served commit, and diff every asset hash — the whole
   *  recipe, runnable as shown from an empty directory. `mise run
   *  verify-build` (mise.toml) is install + build + diff, pinned toolchain. */
  rebuild: string;
}

export function verifyCommands(info: BuildIdentity, origin: string): VerifyCommands {
  const dir = info.repo.split("/")[1] ?? info.repo;
  return {
    attest: `curl -sO ${origin}/build-manifest.json\ngh attestation verify build-manifest.json -R ${info.repo}`,
    rebuild:
      `git clone https://github.com/${info.repo} && cd ${dir}\n` +
      `git checkout ${info.commit}\n` +
      `mise install && mise run verify-build ${origin}`,
  };
}
