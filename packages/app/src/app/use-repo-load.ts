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
 * path itself — and hands it in through {@link RepoLoadHost}. It also owns the
 * reference field's state: the inherited-config layer derives its probe target
 * from it, so the two hooks would otherwise have to close over each other's
 * later-declared bindings (see `repoInput` below).
 */
import { type RefObject, useCallback, useRef, useState } from "react";
import { ESCAPE_PRIORITY } from "@/lib/escape-stack";
import { useEscapeLayer } from "@/hooks/use-escape-layer";
import type { RepoPlatform, TraceResult } from "@renovate-config-debugger/engine";
import { PLATFORM_ENDPOINTS } from "@/data/platform-endpoints";
import { FETCHABLE_PLATFORMS, HOST_PLATFORM } from "@/data/host-tokens";
import { isGithubRateLimited } from "@/lib/github-failure";
import { isValidRepoHost, isValidRepoRefPart } from "@/lib/input-schemas";
import { configFileNameFor, parseRepoReference } from "@/lib/repo-reference";
import type { ShareFileName, UntrustedEndpointGuard } from "@/lib/share";
import { extractPackageJsonConfig, loadRepoConfig, loadRepoFile } from "@/platform/run";
import type { RunInputs } from "@/lib/run-inputs";
import { causedErrorMessage } from "@/lib/errors";
import type { LoadedRepo } from "@/types/repo";

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
  /** The one set-and-persist spelling (086). A load from a KNOWN host is a
   *  deliberate act, so it persists — the security decision stays visible at
   *  this call site. */
  applyPlatformContext: (platform: string, endpoint: string, opts: { persist: boolean }) => void;
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
   * Roadmap 007/039: the reference the user types — App's state, not this
   * hook's, because the inherited-config layer derives its probe target from
   * the same string and is declared BEFORE this hook (it has to be: the load
   * calls into it). Owning it here would mean one of the two hooks closing over
   * a binding the render has not created yet.
   */
  repoInput: string;
  /**
   * Roadmap 045: the inherited config the run should use — the org probe's
   * result when auto-load is on, otherwise whatever the layer already holds.
   * A function, not a value, because the probe is a fetch: the load calls it at
   * the one point in the sequence a real `inheritConfig` run resolves the
   * layer — after the repo config has arrived, before the run that processes it.
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
  /** Roadmap 078: a SUCCESSFUL load records where the config came from — the
   *  fact that makes "pick from your repo's detected dependencies" a
   *  meaningful offer on the Tests tab. */
  onRepoLoaded: (repo: LoadedRepo) => void;
}

export interface RepoLoad {
  /** Load-from-repo disclosure (039): collapsed by default — the form only
   *  exists while open, and the button that toggles it lives in the editor
   *  card's title bar. */
  repoFormOpen: boolean;
  repoToggleRef: RefObject<HTMLButtonElement | null>;
  toggleRepoForm: () => void;
  /** Opens the form (a no-op when already open) — the Tests tab's connect
   *  panel reaches for the SAME overlay rather than growing its own load
   *  form (087). The opener may pass its own element; close hands focus back
   *  there instead of the editor's toggle (which lives in the other column).
   *  Identity-stable, since it travels through the memoized run-view
   *  provider. */
  openRepoForm: (returnFocus?: HTMLElement) => void;
  closeRepoForm: () => void;
  repoRef: string;
  setRepoRef: (value: string) => void;
  repoLoading: boolean;
  /** When a GitHub load fails with a not-found/auth/rate-limit error, offer
   *  the sign-in / install hint next to the failure (009). null = no hint. */
  repoAuthHint: { rateLimited: boolean } | null;
  /** Loads `reference` when given (a welcome-panel shortcut), else the typed
   *  `repoInput` (the form's submit). */
  onLoadRepo: (reference?: string) => Promise<void>;
}

export function useRepoLoad(host: RepoLoadHost): RepoLoad {
  const {
    platform,
    endpoint,
    applyPlatformContext,
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
    repoInput,
    resolveInheritedConfig,
    oauthConfigured,
    onRepoLoaded,
  } = host;
  // Load-from-repo disclosure (039): collapsed by default — the form only
  // exists while `repoFormOpen`, and the button that opens it lives in the
  // editor card's title bar.
  const [repoFormOpen, setRepoFormOpen] = useState(false);
  const repoToggleRef = useRef<HTMLButtonElement>(null);
  const [repoRef, setRepoRef] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  // When a GitHub load fails with a not-found/auth/rate-limit error, offer the
  // sign-in / install hint next to the failure (009). null = no hint.
  const [repoAuthHint, setRepoAuthHint] = useState<{ rateLimited: boolean } | null>(null);

  /** 087: the overlay gained a second opener (the Tests tab's connect panel),
   *  so "the button that opened it" is no longer always the editor's toggle —
   *  an opener may hand its own element over, and close returns focus there
   *  while it is still in the document. */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  /** Roadmap 023/039: closing the repo panel — by Cancel, by Escape, or by a
   *  load that succeeded — hands focus back to the button that opened it. The
   *  panel is gone, so focus must land somewhere deliberate, and that button
   *  is both where the user came from and what describes what just closed. */
  function closeRepoForm() {
    setRepoFormOpen(false);
    const opener = returnFocusRef.current;
    returnFocusRef.current = null;
    if (opener?.isConnected) {
      opener.focus();
      return;
    }
    repoToggleRef.current?.focus();
  }

  function toggleRepoForm() {
    if (repoFormOpen) {
      closeRepoForm();
    } else {
      setRepoFormOpen(true);
    }
  }

  const openRepoForm = useCallback((returnFocus?: HTMLElement) => {
    returnFocusRef.current = returnFocus ?? null;
    setRepoFormOpen(true);
  }, []);

  // Roadmap 075: the form became an OVERLAY over the editor (039's chrome row
  // would push the document it is about to replace out of a fixed-height pane),
  // so it is a layer on the 068 ladder like every other thing that covers the
  // page — Escape from anywhere dismisses it, and the bare-key jump layer
  // stands aside while it is up. Its own `onKeyDown` still handles the press
  // that arrives with focus INSIDE the form (it stops propagation, so it never
  // reaches the ladder's document listener); this is the half that used to be
  // missing — an Escape pressed after focus had moved on left it standing.
  useEscapeLayer(repoFormOpen, closeRepoForm, ESCAPE_PRIORITY.popover);

  // Fetches a repo's Renovate config file and runs it. Derives the platform
  // from a known host (and sets the platform context so a later run resolves
  // `local>` correctly); a bare slug uses the current platform context.
  async function onLoadRepo(reference?: string) {
    const parsed = parseRepoReference(reference ?? repoInput);
    // Roadmap 085: the reference itself may pin a branch (`@ref`, a /tree/
    // URL) or an exact file (a /blob/ URL). The form's own ref field wins when
    // BOTH name one — it is the more deliberate gesture — and an explicit
    // `reference` argument is a shortcut whose ref, if any, is its own.
    const trimmedRef = reference !== undefined ? "" : repoRef.trim();
    const effectiveRef = trimmedRef || parsed?.ref || "";
    // Roadmap 030: the parsed host/repo/ref/path are bounded and control-
    // character free before they compose a request URL/path — the same "Enter
    // a repo as..." notice covers a reference that parsed but shouldn't be
    // trusted.
    if (
      !parsed ||
      !isValidRepoRefPart(parsed.repo) ||
      (parsed.host && !isValidRepoHost(parsed.host)) ||
      !isValidRepoRefPart(effectiveRef) ||
      (parsed.path !== undefined && !isValidRepoRefPart(parsed.path))
    ) {
      setNotice(
        "Enter a repo as owner/repo, github.com/owner/repo, a full repository URL, or a config file URL (…/blob/main/renovate.json).",
      );
      return;
    }
    let repoPlatform: RepoPlatform;
    let repoEndpoint: string;
    const knownHost = parsed.host ? HOST_PLATFORM[parsed.host] : undefined;
    if (parsed.host && !knownHost) {
      setNotice(
        `Unknown host ${parsed.host}. Set its host and API endpoint under Advanced — hosts & credentials → "Repository host", then load with the owner/repo form.`,
      );
      return;
    }
    if (knownHost) {
      repoPlatform = knownHost;
      repoEndpoint = PLATFORM_ENDPOINTS[knownHost] ?? "";
    } else {
      if (!FETCHABLE_PLATFORMS.has(platform as RepoPlatform)) {
        setNotice(
          `The current repository host (${platform}) can't be fetched from the browser. Choose github, gitlab, gitea or forgejo under Advanced — hosts & credentials → "Repository host", or use a full URL.`,
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
      let loaded: { fileName: string; content: string };
      if (parsed.path !== undefined) {
        // Roadmap 085: the reference named an exact file, so discovery would
        // be inventing behavior — read THAT file, or say it is not there.
        const raw = await loadRepoFile(
          {
            platform: repoPlatform,
            repo: parsed.repo,
            path: parsed.path,
            endpoint: repoEndpoint || undefined,
            ref: effectiveRef || undefined,
          },
          { suppressTokens },
        );
        const refLabel = effectiveRef ? `@${effectiveRef}` : "";
        if (raw === null) {
          setFatal(
            `No ${parsed.path} in ${parsed.repo}${refLabel}. Check the path and branch — or, for a private repo, sign in or add a token.`,
          );
          if (oauthConfigured && repoPlatform === "github") {
            setRepoAuthHint({ rateLimited: false });
          }
          return;
        }
        const content = parsed.path.endsWith("package.json")
          ? await extractPackageJsonConfig(raw)
          : raw;
        if (content === null) {
          setFatal(`${parsed.path} in ${parsed.repo}${refLabel} has no "renovate" key.`);
          return;
        }
        // Empty config file is `{}` upstream — the same rule discovery applies.
        loaded = { fileName: parsed.path, content: content.trim() === "" ? "{}" : content };
      } else {
        loaded = await loadRepoConfig(
          {
            platform: repoPlatform,
            repo: parsed.repo,
            endpoint: repoEndpoint || undefined,
            ref: effectiveRef || undefined,
          },
          { suppressTokens },
        );
      }
      const nextFileName: ShareFileName = configFileNameFor(loaded.fileName);
      if (knownHost) {
        applyPlatformContext(repoPlatform, repoEndpoint, { persist: true });
      }
      loadConfigText(loaded.content);
      setFileName(nextFileName);
      setNotice(
        `Loaded ${loaded.fileName} from ${parsed.repo}${effectiveRef ? `@${effectiveRef}` : ""}`,
      );
      // Roadmap 078: the config on screen now demonstrably came from this
      // repository — record it so the Tests tab can offer its dependencies.
      onRepoLoaded({
        platform: repoPlatform,
        repo: parsed.repo,
        ...(repoEndpoint === "" ? {} : { endpoint: repoEndpoint }),
        ...(effectiveRef === "" ? {} : { ref: effectiveRef }),
        suppressTokens,
      });
      // Roadmap 039: the panel's job is done — it collapses so the config it
      // just fetched gets the height back. A FAILED load leaves it open: the
      // reference in it is what the user has to correct. A shortcut load never
      // opened it, and closing would steal focus for the toggle button.
      if (repoFormOpen) {
        closeRepoForm();
      }
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
        detail = causedErrorMessage(err);
        setFatal(
          `Could not load from ${repoEndpoint || "the default endpoint"}: ${detail}. For a private repo, sign in or add a token; some hosts block browser (CORS) requests entirely.`,
        );
      }
      // Offer the sign-in / install hint for GitHub loads that look like a
      // private-repo (not-found) or auth/rate-limit failure (009).
      if (oauthConfigured && repoPlatform === "github") {
        const rateLimited = isGithubRateLimited(detail);
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
    openRepoForm,
    closeRepoForm,
    repoRef,
    setRepoRef,
    repoLoading,
    repoAuthHint,
    onLoadRepo,
  };
}
