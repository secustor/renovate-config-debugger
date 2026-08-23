/**
 * Roadmap 033 — the ONE table of per-host access tokens. Every place that
 * previously restated the four hosts (App.tsx's state/handlers/inputs/error
 * rows, run.ts's storage-key map, the 009 storage migration) now maps over
 * this instead, so adding a host is a one-row change. Pure data, no React —
 * run.ts (which must stay engine-chunk-light) imports it too.
 */
import type { PresetTokenKey, RepoPlatform } from "@renovate-config-debugger/engine";

export interface HostTokenDescriptor {
  /** Stable id, also the token's field prefix in the engine's PresetAuth. */
  id: "github" | "gitlab" | "gitea" | "forgejo";
  /** Short host name, used in the token error rows ("<label> token …"). */
  label: string;
  /** The canonical host this id stands for, as the credentials list names it
   *  (roadmap 076 — a hostRules-style row is addressed by host, not by vendor).
   *  These are the hosts of `PLATFORM_ENDPOINTS`' default endpoints. */
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
    storageKey: "rcv.githubToken",
    authKey: "githubToken",
  },
  {
    id: "gitlab",
    label: "GitLab",
    host: "gitlab.com",
    inputLabel: "GitLab token (PRIVATE-TOKEN)",
    storageKey: "rcv.gitlabToken",
    authKey: "gitlabToken",
  },
  {
    id: "gitea",
    label: "Gitea",
    host: "gitea.com",
    inputLabel: "Gitea token",
    storageKey: "rcv.giteaToken",
    authKey: "giteaToken",
  },
  {
    id: "forgejo",
    label: "Forgejo",
    host: "codeberg.org",
    inputLabel: "Forgejo token",
    storageKey: "rcv.forgejoToken",
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
export const FETCHABLE_PLATFORMS: ReadonlySet<RepoPlatform> = new Set(
  HOST_TOKENS.map((descriptor) => descriptor.id),
);

/** Known public hosts → the platform that serves their repos, from the same
 *  one table (`host` is documented there as the canonical host of that id). */
export const HOST_PLATFORM: Readonly<Record<string, RepoPlatform>> = Object.fromEntries(
  HOST_TOKENS.map((descriptor) => [descriptor.host, descriptor.id]),
);
