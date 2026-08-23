/**
 * Roadmap 085 — parsing the one string the repo-load form accepts.
 *
 * Extracted from `use-repo-load` (where it was private and untestable) and
 * extended past "which repository": a pasted reference may also name a BRANCH
 * (`owner/repo@ref`, a `/tree/<ref>` URL) or an exact FILE (a `/blob/<ref>/…`
 * URL, a raw.githubusercontent.com URL). The parser only ever *reads* the
 * string — validation against the request-building rules stays where it was,
 * in `use-repo-load` via `input-schemas`.
 */

/** What a pasted reference names. `host: null` means "a bare slug — use the
 *  current platform context". `ref`/`path` are present only when the reference
 *  itself named them. */
export interface RepoReference {
  host: string | null;
  repo: string;
  /** Branch or tag the reference pinned (`@ref`, `/tree/<ref>`, `/blob/<ref>/…`). */
  ref?: string;
  /** Exact file the reference named (`/blob/<ref>/<path>` and friends) — when
   *  present the load reads THIS file instead of running config discovery. */
  path?: string;
}

/** Strips a trailing `.git` and slashes from a repo path. Shared with
 *  `inherit-probe`, which reads the same reference shapes half-typed. */
export function stripRepoSuffix(path: string): string {
  return path.replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
}

/** The one host heuristic: a leading path segment containing a dot is a HOST,
 *  never an owner — owners and groups cannot contain dots on any supported
 *  host. Shared with `inherit-probe` for the same reason as
 *  {@link stripRepoSuffix}: both modules read the same typed reference, and a
 *  second spelling of this rule is how they would come to disagree about where
 *  the owner starts. */
export function isHostSegment(segment: string | undefined): boolean {
  return segment !== undefined && segment.includes(".");
}

/** The web-UI path segments that separate `owner/repo` from a ref: GitHub's
 *  `blob|tree|raw`, Gitea/Forgejo's `src` (with an optional kind segment). */
const FILE_MARKERS = new Set(["blob", "raw"]);
const TREE_MARKERS = new Set(["tree"]);

/** Splits URL path segments at a recognized web-UI marker into repo/ref/path.
 *  Returns null when no marker shape applies (a plain repository URL). */
function splitAtMarker(segments: string[]): RepoReference | null {
  // GitLab's unambiguous form: `group/sub/repo/-/blob/<ref>/<path>` — the `-`
  // separator is what makes subgroup paths parseable at all.
  const dash = segments.indexOf("-");
  if (dash >= 2 && segments.length > dash + 2) {
    const marker = segments[dash + 1] ?? "";
    if (FILE_MARKERS.has(marker) || TREE_MARKERS.has(marker)) {
      const repo = segments.slice(0, dash).join("/");
      const ref = segments[dash + 2];
      const rest = segments.slice(dash + 3);
      return {
        host: null,
        repo,
        ...(ref ? { ref } : {}),
        ...(FILE_MARKERS.has(marker) && rest.length > 0 ? { path: rest.join("/") } : {}),
      };
    }
  }
  if (segments.length < 4) {
    return null;
  }
  const [owner = "", name = "", marker = "", ...tail] = segments;
  const repo = `${owner}/${name}`;
  // Gitea/Forgejo: `owner/repo/src/branch/<ref>/<path>` (the kind segment may
  // be absent on older links: `owner/repo/src/<ref>/<path>`).
  if (marker === "src") {
    const kinded = tail[0] === "branch" || tail[0] === "tag" || tail[0] === "commit";
    const ref = kinded ? tail[1] : tail[0];
    const rest = tail.slice(kinded ? 2 : 1);
    return {
      host: null,
      repo,
      ...(ref ? { ref } : {}),
      ...(rest.length > 0 ? { path: rest.join("/") } : {}),
    };
  }
  // GitHub: `owner/repo/blob/<ref>/<path>`, `owner/repo/tree/<ref>`,
  // `owner/repo/raw/<ref>/<path>`.
  if (FILE_MARKERS.has(marker) || TREE_MARKERS.has(marker)) {
    const [ref, ...rest] = tail;
    return {
      host: null,
      repo,
      ...(ref ? { ref } : {}),
      ...(FILE_MARKERS.has(marker) && rest.length > 0 ? { path: rest.join("/") } : {}),
    };
  }
  return null;
}

/** raw.githubusercontent.com carries no marker segment: `owner/repo/<ref>/<path>`
 *  or the newer `owner/repo/refs/heads/<ref>/<path>`. The host is normalized
 *  to github.com — that is the platform that serves the repo. */
function parseRawGithub(segments: string[]): RepoReference | null {
  const [owner, name, ...tail] = segments;
  if (!owner || !name || tail.length === 0) {
    return null;
  }
  const repo = `${owner}/${name}`;
  if ((tail[0] === "refs" && tail[1] === "heads") || (tail[0] === "refs" && tail[1] === "tags")) {
    const ref = tail[2];
    const rest = tail.slice(3);
    if (!ref) {
      return null;
    }
    return { host: "github.com", repo, ref, ...(rest.length > 0 ? { path: rest.join("/") } : {}) };
  }
  const [ref, ...rest] = tail;
  return {
    host: "github.com",
    repo,
    ...(ref ? { ref } : {}),
    ...(rest.length > 0 ? { path: rest.join("/") } : {}),
  };
}

function parseUrl(trimmed: string): RepoReference | null {
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  const segments = u.pathname.split("/").filter(Boolean);
  if (u.hostname === "raw.githubusercontent.com") {
    return parseRawGithub(segments);
  }
  const split = splitAtMarker(segments);
  if (split) {
    return { ...split, host: u.host };
  }
  const repo = stripRepoSuffix(u.pathname);
  return repo ? { host: u.host, repo } : null;
}

/** `owner/repo@ref` (and `host/owner/repo@ref`): the suffix after the LAST `@`
 *  is a branch or tag. The last one, because scp-style `git@…` is handled
 *  before this ever runs. */
function splitAtRef(slug: string): { base: string; ref?: string } {
  const at = slug.lastIndexOf("@");
  if (at <= 0 || at === slug.length - 1) {
    return { base: slug };
  }
  return { base: slug.slice(0, at), ref: slug.slice(at + 1) };
}

/**
 * Parses a repo reference liberally: `org/repo` (optionally `@branch`),
 * `github.com/org/repo`, a full URL — a repository home, a `/tree/<branch>`
 * page, or a `/blob/<branch>/<file>` page — or scp-style
 * (`git@github.com:org/repo.git`). Returns null when it is not a recognizable
 * reference.
 */
export function parseRepoReference(raw: string): RepoReference | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const scp = /^git@([^:]+):(.+)$/.exec(trimmed);
  if (scp?.[1] && scp[2]) {
    return { host: scp[1], repo: stripRepoSuffix(scp[2]) };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return parseUrl(trimmed);
  }
  const { base, ref } = splitAtRef(trimmed);
  const path = stripRepoSuffix(base);
  const segments = path.split("/");
  // A first segment that looks like a domain (contains a dot) is treated as a
  // host; owners/groups never contain dots on the supported hosts. The
  // schemeless form gets the same web-UI parsing as a full URL.
  if (segments.length >= 3 && isHostSegment(segments[0])) {
    const parsed = parseUrl(`https://${path}`);
    return parsed ? { ...parsed, ...(ref && !parsed.ref ? { ref } : {}) } : null;
  }
  if (segments.length < 2 || segments.some((s) => s === "")) {
    return null;
  }
  return { host: null, repo: path, ...(ref ? { ref } : {}) };
}

/** The editor file-mode a fetched file gets: json5 for `.json5`, json for
 *  everything else (`.json`, `.jsonc`, extensionless `.renovaterc`) — the same
 *  single rule the discovery load applies to its result. */
export function configFileNameFor(path: string): "renovate.json" | "renovate.json5" {
  return path.endsWith(".json5") ? "renovate.json5" : "renovate.json";
}

/**
 * Extracts the `renovate` key from a package.json body, mirroring the engine's
 * own `extractPackageJsonConfig` (private there): an object is pretty-printed,
 * a string becomes Renovate's `{ "extends": [value] }` shorthand, anything
 * else — including a missing key — is null.
 */
export function extractRenovateFromPackageJson(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const value = (parsed as Record<string, unknown>).renovate;
  if (typeof value === "string") {
    return JSON.stringify({ extends: [value] }, null, 2);
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  return null;
}
