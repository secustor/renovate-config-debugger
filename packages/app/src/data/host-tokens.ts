/**
 * Roadmap 033 — the ONE table of per-host access tokens. Every place that
 * previously restated the four hosts (App.tsx's state/handlers/inputs/error
 * rows, run.ts's storage-key map, the 009 storage migration) now maps over
 * this instead, so adding a host is a one-row change. Pure data, no React —
 * run.ts (which must stay engine-chunk-light) imports it too.
 */
import type { PresetAuth } from "@renovate-config-debugger/engine";

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
  /** The engine `PresetAuth` field this host's token is handed over as. */
  authKey: keyof PresetAuth;
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
