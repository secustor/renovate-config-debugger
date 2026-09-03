/**
 * Roadmap 033 — the ONE table of per-host access tokens. Every place that
 * previously restated the four hosts (App.tsx's state/handlers/inputs/error
 * rows, run.ts's storage-key map, the 009 storage migration) now maps over
 * this instead, so adding a host is a one-row change. Pure data, no React —
 * run.ts (which must stay engine-chunk-light) imports it too.
 */
import type { PresetTokenKey, RepoPlatform } from "@renovate-config-debugger/engine";
import { ownValue } from "@renovate-config-debugger/engine/is";

export interface HostTokenDescriptor {
  /** Stable id, also the token's field prefix in the engine's PresetAuth. */
  id: "github" | "gitlab" | "gitea" | "forgejo";
  /** Short host name, used in the token error rows ("<label> token …"). */
  label: string;
  /** The canonical host this id stands for, as the credentials list names it
   *  (roadmap 076 — a hostRules-style row is addressed by host, not by vendor)
   *  and as a repo reference is written against — NOT the API endpoint's host
   *  (GitHub's is api.github.com), so it cannot be derived from
   *  `PLATFORM_ENDPOINTS`. */
  host: string;
  /** The token input's full label (the GitHub/GitLab ones carry extra hints). */
  inputLabel: string;
  /** sessionStorage key — per-host tokens are secrets, so they live in
   *  sessionStorage (cleared when the tab closes; roadmap 009/010). */
  storageKey: string;
  /** The engine `PresetAuth` token field this host's token is handed over as
   *  (roadmap 076: the list field `hostRules` is deliberately not nameable). */
  authKey: PresetTokenKey;
}

export type HostTokenId = HostTokenDescriptor["id"];

export const HOST_TOKENS: readonly HostTokenDescriptor[] = [
  {
    id: "github",
    label: "GitHub",
    host: "github.com",
    inputLabel: "GitHub personal access token (fallback)",
    storageKey: "rcd.githubToken",
    authKey: "githubToken",
  },
  {
    id: "gitlab",
    label: "GitLab",
    host: "gitlab.com",
    inputLabel: "GitLab token (PRIVATE-TOKEN)",
    storageKey: "rcd.gitlabToken",
    authKey: "gitlabToken",
  },
  {
    id: "gitea",
    label: "Gitea",
    host: "gitea.com",
    inputLabel: "Gitea token",
    storageKey: "rcd.giteaToken",
    authKey: "giteaToken",
  },
  {
    id: "forgejo",
    label: "Forgejo",
    host: "codeberg.org",
    inputLabel: "Forgejo token",
    storageKey: "rcd.forgejoToken",
    authKey: "forgejoToken",
  },
];

/**
 * Platforms whose repositories this app can fetch from the browser (roadmap
 * 007/010) — which is exactly the set of hosts the table above has a token
 * for, since a host is listed here precisely because the browser talks to it.
 * Derived rather than restated so "add a host" stays the one-row change the
 * table's header promises.
 */
const FETCHABLE_PLATFORMS: ReadonlySet<RepoPlatform> = new Set(
  HOST_TOKENS.map((descriptor) => descriptor.id),
);

/** The membership test above, spelled so the compiler applies it — callers
 *  holding a bare `string` narrow instead of casting. */
export function isFetchablePlatform(value: string): value is RepoPlatform {
  return (FETCHABLE_PLATFORMS as ReadonlySet<string>).has(value);
}

/**
 * Roadmap 087: the platforms the engine's `fetchRepoTree` can actually LIST —
 * its GitHub-only guard is the deep half of this gate (see
 * engine/src/shims/repo-config.ts). The From-repository picker and the
 * connect panel's suggestion exist only on these; a repo loaded from any
 * other platform keeps the Manual/Paste doors, since offering a walk that
 * can only throw would make the tab a guaranteed dead end. Kept here (not
 * imported from the engine) because this file must stay engine-chunk-light —
 * the engine reaches the app only through the dynamic `loadEngine()` seam.
 */
const TREE_LISTING_PLATFORMS: ReadonlySet<RepoPlatform> = new Set<RepoPlatform>(["github"]);

/** The membership test above, spelled so the compiler applies it — callers
 *  holding a bare `string` narrow instead of casting. */
export function isTreeListingPlatform(value: string): value is RepoPlatform {
  return (TREE_LISTING_PLATFORMS as ReadonlySet<string>).has(value);
}

/** Known public hosts → the platform that serves their repos, from the same
 *  one table (`host` is documented there as the canonical host of that id).
 *  Private: reached only through `platformForHost`, whose own-key guard is
 *  the point. */
const HOST_PLATFORM: Readonly<Record<string, RepoPlatform>> = Object.fromEntries(
  HOST_TOKENS.map((descriptor) => [descriptor.host, descriptor.id]),
);

/** The platform serving a HOST that may be any string — the own-key guard is
 *  what keeps a pasted `constructor/repo` from reporting a known host. */
export function platformForHost(host: string): RepoPlatform | undefined {
  return ownValue(HOST_PLATFORM, host);
}
