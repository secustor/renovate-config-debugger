/**
 * Roadmap 007/010/039/048 — the load-from-repo cluster as one hook: the
 * disclosure the form lives in (and the focus hand-back that closing it owes
 * the button that opened it), the reference the user types, the in-flight flag
 * the button reads, the GitHub sign-in hint a failure may offer, and the load
 * itself — parse the reference, decide the platform context it implies, fetch
 * the config, and run it.
 *
 * The pieces are one concept because they are one gesture: everything here
 * exists to turn a string like `github.com/owner/repo` into a run, and every
 * piece of state is either an input to that or a consequence of it.
 *
 * App.tsx keeps everything the load acts ON — the editor's content, the
 * platform context, the layer parses, the untrusted-endpoint guard and the run
 * path itself — and hands it in through {@link RepoLoadHost}.
 */
import { type RefObject, useRef, useState } from "react";
import type { RepoPlatform, TraceResult } from "@renovate-config-debugger/engine";
import { PLATFORM_ENDPOINTS } from "@/data/platform-endpoints";
import { isValidRepoHost, isValidRepoRefPart } from "@/lib/input-schemas";
import type { ShareFileName, UntrustedEndpointGuard } from "@/lib/share";
import { loadRepoConfig } from "@/platform/run";
import { ENDPOINT_KEY, persistLocal, PLATFORM_KEY } from "@/platform/storage";
import type { RunInputs } from "@/lib/run-inputs";

/** Platforms whose repos can be fetched from the browser (roadmap 007/010). */
const FETCHABLE_PLATFORMS = new Set<RepoPlatform>(["github", "gitlab", "gitea", "forgejo"]);

/** Known public hosts → the platform that serves their repos. */
const HOST_PLATFORM: Record<string, RepoPlatform> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "gitea.com": "gitea",
  "codeberg.org": "forgejo",
};

/** Strips a trailing `.git` and slashes from a repo path. */
function stripRepoSuffix(path: string): string {
  return path.replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
}

/**
 * Parses a repo reference liberally: `org/repo`, `github.com/org/repo`, a full
 * URL (`https://gitlab.com/org/repo`), or scp-style (`git@github.com:org/repo.git`).
 * Returns the host (null for a bare slug) and the repo path (may be nested for
 * GitLab subgroups), or null when it is not a recognizable reference.
 */
function parseRepoRef(raw: string): { host: string | null; repo: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const scp = /^git@([^:]+):(.+)$/.exec(trimmed);
  if (scp?.[1] && scp[2]) {
    return { host: scp[1], repo: stripRepoSuffix(scp[2]) };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const repo = stripRepoSuffix(u.pathname);
      return repo ? { host: u.host, repo } : null;
    } catch {
      return null;
    }
  }
  const path = stripRepoSuffix(trimmed);
  const segments = path.split("/");
  // A first segment that looks like a domain (contains a dot) is treated as a
  // host; owners/groups never contain dots on the supported hosts.
  if (segments.length >= 3 && segments[0]?.includes(".")) {
    return { host: segments[0], repo: segments.slice(1).join("/") };
  }
  if (segments.length < 2 || segments.some((s) => s === "")) {
    return null;
  }
  return { host: null, repo: path };
}

/**
 * What the load needs from App.tsx. Handed in fresh every render and read
 * through the current render's closure, so a load started from a click always
 * sees the state that click was made against.
 */
export interface RepoLoadHost {
  /** The platform context in force — what a bare `owner/repo` load uses, and
   *  what decides whether such a load is fetchable from the browser at all. */
  platform: string;
  endpoint: string;
  setPlatform: (platform: string) => void;
  setEndpoint: (endpoint: string) => void;
  /** Roadmap 016: the one path every authoritative content load goes through. */
  loadConfigText: (text: string) => void;
  setFileName: (fileName: ShareFileName) => void;
  setNotice: (notice: string | null) => void;
  setFatal: (fatal: string | null) => void;
  /** Blocks the load (and says why, through `setFatal`) when a config layer or
   *  the endpoint field is unusable — the same gate a manual Run passes. */
  blockedByLayerErrors: () => boolean;
  /** The one way the untrusted-endpoint guard changes (see App.tsx). */
  applyUntrustedGuard: (guard: UntrustedEndpointGuard | null) => void;
  /** The guard read synchronously: token suppression is decided in the SAME
   *  tick the guard may be cleared in, so it must not come from a `useState`
   *  closure React has not re-rendered yet. */
  untrustedGuardRef: { readonly current: UntrustedEndpointGuard | null };
  /** The pipeline run path, awaited so a failure surfaces through this load. */
  onRun: (inputs: RunInputs, opts: { suppressTokens: boolean }) => Promise<TraceResult | null>;
  /** The 008 global layer, parsed — it rides along in the run below. */
  globalConfig: Record<string, unknown> | undefined;
  /** `platformOverride && hasGlobalContext`, as the run takes it (010). */
  platformOverride: boolean;
  /**
   * Roadmap 045: the inherited config the run should use — the org probe's
   * result when auto-load is on, otherwise whatever the layer already holds.
   * A function, not a value, because App declares the inherited-config layer
   * AFTER this hook (that layer derives from `repoInput`, which this hook
   * owns); the load calls it at the one point in the sequence a real
   * `inheritConfig` run resolves the layer.
   */
  resolveInheritedConfig: (args: {
    platform: RepoPlatform;
    endpoint: string;
    /** The repo slug that was actually loaded — the templating authority. */
    loadedRepo: string;
    suppressTokens: boolean;
  }) => Promise<Record<string, unknown> | undefined>;
  /** Whether OAuth is configured at all — a failure only offers the sign-in
   *  hint when signing in is actually possible (009). */
  oauthConfigured: boolean;
}

export interface RepoLoad {
  /** Load-from-repo disclosure (039): collapsed by default — the form only
   *  exists while open, and the button that toggles it lives in the editor
   *  card's title bar. */
  repoFormOpen: boolean;
  repoToggleRef: RefObject<HTMLButtonElement | null>;
  toggleRepoForm: () => void;
  closeRepoForm: () => void;
  repoInput: string;
  setRepoInput: (value: string) => void;
  repoRef: string;
  setRepoRef: (value: string) => void;
  repoLoading: boolean;
  /** When a GitHub load fails with a not-found/auth/rate-limit error, offer
   *  the sign-in / install hint next to the failure (009). null = no hint. */
  repoAuthHint: { rateLimited: boolean } | null;
  onLoadRepo: () => Promise<void>;
}

export function useRepoLoad(host: RepoLoadHost): RepoLoad {
  const {
    platform,
    endpoint,
    setPlatform,
    setEndpoint,
    loadConfigText,
    setFileName,
    setNotice,
    setFatal,
    blockedByLayerErrors,
    applyUntrustedGuard,
    untrustedGuardRef,
    onRun,
    globalConfig,
    platformOverride,
    resolveInheritedConfig,
    oauthConfigured,
  } = host;
  // Load-from-repo disclosure (039): collapsed by default — the form only
  // exists while `repoFormOpen`, and the button that opens it lives in the
  // editor card's title bar.
  const [repoFormOpen, setRepoFormOpen] = useState(false);
  const repoToggleRef = useRef<HTMLButtonElement>(null);
  const [repoInput, setRepoInput] = useState("");
  const [repoRef, setRepoRef] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  // When a GitHub load fails with a not-found/auth/rate-limit error, offer the
  // sign-in / install hint next to the failure (009). null = no hint.
  const [repoAuthHint, setRepoAuthHint] = useState<{ rateLimited: boolean } | null>(null);

  /** Roadmap 023/039: closing the repo panel — by Cancel, by Escape, or by a
   *  load that succeeded — hands focus back to the button that opened it. The
   *  panel is gone, so focus must land somewhere deliberate, and that button
   *  is both where the user came from and what describes what just closed. */
  function closeRepoForm() {
    setRepoFormOpen(false);
    repoToggleRef.current?.focus();
  }

  function toggleRepoForm() {
    if (repoFormOpen) {
      closeRepoForm();
    } else {
      setRepoFormOpen(true);
    }
  }

  // Fetches a repo's Renovate config file and runs it. Derives the platform
  // from a known host (and sets the platform context so a later run resolves
  // `local>` correctly); a bare slug uses the current platform context.
  async function onLoadRepo() {
    const parsed = parseRepoRef(repoInput);
    const trimmedRef = repoRef.trim();
    // Roadmap 030: the parsed host/repo/ref are bounded and control-character
    // free before they compose a request URL/path — the same "Enter a repo
    // as..." notice covers a reference that parsed but shouldn't be trusted.
    if (
      !parsed ||
      !isValidRepoRefPart(parsed.repo) ||
      (parsed.host && !isValidRepoHost(parsed.host)) ||
      !isValidRepoRefPart(trimmedRef)
    ) {
      setNotice("Enter a repo as owner/repo, github.com/owner/repo, or a full repository URL.");
      return;
    }
    let repoPlatform: RepoPlatform;
    let repoEndpoint: string;
    const knownHost = parsed.host ? HOST_PLATFORM[parsed.host] : undefined;
    if (parsed.host && !knownHost) {
      setNotice(
        `Unknown host ${parsed.host}. Set its host and API endpoint under Advanced options → "Repository host & access tokens", then load with the owner/repo form.`,
      );
      return;
    }
    if (knownHost) {
      repoPlatform = knownHost;
      repoEndpoint = PLATFORM_ENDPOINTS[knownHost] ?? "";
    } else {
      if (!FETCHABLE_PLATFORMS.has(platform as RepoPlatform)) {
        setNotice(
          `The current repository host (${platform}) can't be fetched from the browser. Choose github, gitlab, gitea or forgejo under Advanced options → "Repository host & access tokens", or use a full URL.`,
        );
        return;
      }
      repoPlatform = platform as RepoPlatform;
      repoEndpoint = endpoint;
    }

    if (blockedByLayerErrors()) {
      return;
    }
    // Security 2026-07-25: a load from a KNOWN host replaces the platform
    // context with that host's shipped default, so it ends a link's guard —
    // nothing untrusted is left in force. A bare `owner/repo` load reuses the
    // current endpoint, which may be exactly the host the link chose, so it
    // stays suppressed (both for the file probe and the run that follows).
    const suppressTokens = !knownHost && untrustedGuardRef.current !== null;
    if (knownHost) {
      applyUntrustedGuard(null);
    }
    setRepoLoading(true);
    setFatal(null);
    setNotice(null);
    setRepoAuthHint(null);
    try {
      const loaded = await loadRepoConfig(
        {
          platform: repoPlatform,
          repo: parsed.repo,
          endpoint: repoEndpoint || undefined,
          ref: trimmedRef || undefined,
        },
        { suppressTokens },
      );
      const nextFileName: ShareFileName = loaded.fileName.endsWith(".json5")
        ? "renovate.json5"
        : "renovate.json";
      if (knownHost) {
        setPlatform(repoPlatform);
        persistLocal(PLATFORM_KEY, repoPlatform);
        setEndpoint(repoEndpoint);
        persistLocal(ENDPOINT_KEY, repoEndpoint);
      }
      loadConfigText(loaded.content);
      setFileName(nextFileName);
      setNotice(`Loaded ${loaded.fileName} from ${parsed.repo}`);
      // Roadmap 039: the panel's job is done — it collapses so the config it
      // just fetched gets the height back. A FAILED load leaves it open: the
      // reference in it is what the user has to correct.
      closeRepoForm();
      // Roadmap 045: the inherited-config probe runs between the repo config
      // arriving and the run that processes it — the order a real run resolves
      // the two in, so the very first result already includes the org layer
      // instead of appearing only on a second Run. Its own failures never fail
      // the load: the repo config is already here.
      const inheritedForRun = await resolveInheritedConfig({
        platform: repoPlatform,
        endpoint: repoEndpoint,
        loadedRepo: parsed.repo,
        suppressTokens,
      });
      await onRun(
        {
          fileName: nextFileName,
          content: loaded.content,
          platform: repoPlatform,
          endpoint: repoEndpoint || endpoint,
          globalConfig,
          inheritedConfig: inheritedForRun,
          platformOverride,
        },
        { suppressTokens },
      );
    } catch (err) {
      const e = err as { name?: string; probed?: string[]; err?: { message?: string } };
      let detail = "";
      if (e?.name === "RepoConfigNotFoundError") {
        const count = e.probed?.length ?? 0;
        setFatal(
          `No Renovate config found in ${parsed.repo} (tried ${count} locations). It may keep its config elsewhere, on a non-default branch, or in a private repo needing a token.`,
        );
      } else {
        detail = e?.err?.message ?? (err instanceof Error ? err.message : String(err));
        setFatal(
          `Could not load from ${repoEndpoint || "the default endpoint"}: ${detail}. For a private repo, sign in or add a token; some hosts block browser (CORS) requests entirely.`,
        );
      }
      // Offer the sign-in / install hint for GitHub loads that look like a
      // private-repo (not-found) or auth/rate-limit failure (009).
      if (oauthConfigured && repoPlatform === "github") {
        const rateLimited = /rate limit or missing token/i.test(detail);
        if (e?.name === "RepoConfigNotFoundError" || rateLimited) {
          setRepoAuthHint({ rateLimited });
        }
      }
    } finally {
      setRepoLoading(false);
    }
  }

  return {
    repoFormOpen,
    repoToggleRef,
    toggleRepoForm,
    closeRepoForm,
    repoInput,
    setRepoInput,
    repoRef,
    setRepoRef,
    repoLoading,
    repoAuthHint,
    onLoadRepo,
  };
}
