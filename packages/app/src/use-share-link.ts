/**
 * Roadmap 033 — the share/hash/decode cluster as one hook: the `#config=`
 * protocol state (share error banner text, a link's simulator request), the
 * address-bar bookkeeping (`writeHash`/`clearShareHash` and the self-write
 * filter), the single decode→populate→run path (`loadShareToken`), the mount
 * and hashchange effects that feed it, and the encode side's copy-link entry
 * point. App.tsx supplies everything the cluster acts ON (state setters, the
 * run path, the untrusted-endpoint guard) through {@link ShareLinkHost}.
 *
 * The cluster's invariants — the StrictMode mount latch, decode-generation
 * cancellation, self-write filtering, and run-before-sim-arm ordering — all
 * live here; their comments moved with the statements they annotate.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { TraceResult } from "@renovate-config-visualizer/engine";
import { completeCallback, type OAuthConfig, readCallbackParams, type StoredUser } from "./oauth";
import { getRenovateVersion } from "./run";
import {
  buildShareUrl,
  decideHashChangeAction,
  decideShareRunPolicy,
  decodeShareResult,
  encodeShare,
  readShareToken,
  type ShareDecodeError,
  type ShareFileName,
  type ShareSimulator,
  type ShareState,
  type ShareView,
  type UntrustedEndpointGuard,
  untrustedGuardForPolicy,
} from "./share";
import { ENDPOINT_KEY, persistLocal, PLATFORM_KEY } from "./storage";

/** Roadmap 018: a share link's simulator inputs, applied once by nonce. */
export interface SimRequest {
  form: Record<string, string>;
  autoSimulate: boolean;
  nonce: number;
}

export interface RunInputs {
  fileName: ShareFileName;
  content: string;
  platform: string;
  endpoint: string;
  /** Parsed 008 layers; absent = layer off. */
  globalConfig?: Record<string, unknown>;
  inheritedConfig?: Record<string, unknown>;
  /** The user explicitly overrode the global config's platform/endpoint. */
  platformOverride?: boolean;
}

/**
 * Roadmap 027: the prominent banner shown when a `#config=` token was present
 * but unreadable, tailored to the failure mode. Every message says what to do
 * (get a fresh link, check the whole URL was copied), since the fix is always
 * on the sender's side.
 */
const SHARE_ERROR_MESSAGES: Record<ShareDecodeError, string> = {
  damaged:
    "This shared link is damaged and couldn’t be read. Ask the sender to copy the link again, and make sure the whole URL was copied. Showing the default config instead.",
  cutOff:
    "This shared link appears to be cut off. Ask the sender to copy the link again, and make sure the whole URL was copied. Showing the default config instead.",
  incompatible:
    "This shared link was made by an incompatible version of the app and couldn’t be read. Ask the sender for a fresh link. Showing the default config instead.",
};

/**
 * What the share cluster needs from App.tsx. Handed in fresh every render;
 * `loadShareToken` reads it through the current render's closure (kept
 * current by the latest-ref registration below) and the one-shot effects
 * read it through `hostRef`, so nothing here goes stale.
 */
export interface ShareLinkHost {
  /** The pipeline run path. The hook AWAITS this (never fire-and-forget) —
   *  the run-before-sim-arm ordering below holds by construction only while
   *  the promise resolves after the result state commits. */
  onRun: (inputs: RunInputs, opts: { suppressTokens: boolean }) => Promise<TraceResult | null>;
  /** Roadmap 016: the one path every authoritative content load goes through. */
  loadConfigText: (text: string) => void;
  setFileName: (fileName: ShareFileName) => void;
  setPlatform: (platform: string) => void;
  setEndpoint: (endpoint: string) => void;
  setGlobalText: (text: string) => void;
  setInheritedText: (text: string) => void;
  setPlatformOverride: (override: boolean) => void;
  setAdvancedOpen: (open: boolean) => void;
  setHostSectionOpen: (open: boolean) => void;
  setNotice: (notice: string | null) => void;
  setSignedIn: (signedIn: boolean) => void;
  setAuthUser: (user: StoredUser | null) => void;
  /** The one way the untrusted-endpoint guard changes (see App.tsx). */
  applyUntrustedGuard: (guard: UntrustedEndpointGuard | null) => void;
  /** View state pending from a decoded link, applied by App once the run
   *  produces a result (identities → node ids need the resolved tree). */
  pendingViewRef: { current: ShareView | null };
  /** Roadmap 017: mirrors of `content`/`loadedContent` for the hashchange
   *  listener, which is registered once (empty deps) and would otherwise
   *  close over the state from that first render. */
  contentRef: { readonly current: string };
  loadedContentRef: { readonly current: string };
  /** Assembles the CURRENT app state (config + view + optional simulator
   *  inputs) for encoding — the view-cluster knowledge stays in App.tsx. */
  buildShareState: (sim?: ShareSimulator) => Promise<ShareState>;
}

export interface ShareLink {
  /** Roadmap 027: a token was present but unreadable — banner text, or null. */
  shareError: string | null;
  /** Roadmap 018: a decoded link's simulator inputs, handed to the
   *  RuleSimulator to pre-fill (and, when `autoSimulate`, run) once the
   *  pipeline run this link triggered has produced its result. */
  simRequest: SimRequest | null;
  buildShareLinkAndCopy: (sim?: ShareSimulator) => Promise<void>;
}

export function useShareLink(oauthConfig: OAuthConfig | null, host: ShareLinkHost): ShareLink {
  // Roadmap 027: cleared whenever a share load succeeds, so a broken link
  // never reads as "nothing happened" while a working one shows no residue.
  const [shareError, setShareError] = useState<string | null>(null);
  // A fresh nonce per link lets the RuleSimulator apply each request exactly
  // once; set AFTER the run so the child applies it against the freshly-run
  // config, on both mount and hashchange.
  const [simRequest, setSimRequest] = useState<SimRequest | null>(null);
  const simNonceRef = useRef(0);
  // Roadmap 017: the last `#config=` token (or null) the app itself wrote
  // into the address bar via `history.replaceState` — Copy link, clearing an
  // unreadable share link, or restoring a pre-sign-in fragment after OAuth.
  // The hashchange listener compares against this to ignore its own writes
  // (replaceState doesn't fire `hashchange`, but this stays correct even if
  // a browser ever did, or a future navigation replays the same URL).
  const lastWrittenTokenRef = useRef<string | null>(null);
  // Roadmap 017: guards a decode against a later hashchange (or unmount)
  // superseding it before its async work (decodeShareResult, getRenovateVersion)
  // resolves.
  const decodeGenerationRef = useRef(0);
  // The flag must be (re)set in the effect BODY, not only in the ref
  // initializer: React StrictMode (dev) mounts, runs the cleanup, then mounts
  // again — a cleanup-only latch stays false forever after the second mount,
  // which silently cancelled every share-link decode under `vite dev`.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // The latest host callbacks for the one-shot effects below (same latest-ref
  // idiom as `loadShareTokenRef`); reading through a ref keeps the effects'
  // dependency lists honest without re-registering them every render.
  const hostRef = useRef(host);
  hostRef.current = host;

  /** Roadmap 017: the one path every self-initiated hash write goes through —
   *  updates the address bar and records the token (or lack of one) so the
   *  hashchange listener can recognize its own writes. */
  function writeHash(url: string, shareToken: string | null) {
    lastWrittenTokenRef.current = shareToken;
    history.replaceState(null, "", url);
  }

  /** Drops the `#config=` fragment, keeping any query string. */
  function clearShareHash() {
    writeHash(window.location.pathname + window.location.search, null);
  }

  /**
   * Roadmap 007/017: decodes a share token, populates every piece of state
   * a link can carry, and runs — the single decode→populate→run path shared
   * by the mount effect (a link opened fresh) and the hashchange listener
   * below (a link opened while the app is already running). `isCancelled`
   * lets either caller abandon the result of a decode a later event has
   * superseded (component unmount, or a second hashchange arriving before
   * the first finishes its awaits).
   */
  async function loadShareToken(shareToken: string, isCancelled: () => boolean): Promise<void> {
    // Roadmap 031: `getRenovateVersion()` IS the module-cached engine import,
    // and any successful decode ends in a run that needs that chunk — so the
    // (multi-second) download starts here and overlaps the decode instead of
    // following it. Ordering preserved: nothing below reads the version
    // before this promise resolves, and the decode→guard→populate→run
    // sequence is untouched. Never rejects (null = engine import failed —
    // the run below awaits the same cached import and surfaces that failure
    // through onRun's fatal-error path), so a decode that fails early can
    // abandon it without an unhandled rejection.
    const versionPromise: Promise<string | null> = getRenovateVersion().catch(() => null);
    const decoded = await decodeShareResult(shareToken);
    if (isCancelled()) {
      return;
    }
    if (!decoded.ok) {
      setShareError(SHARE_ERROR_MESSAGES[decoded.reason]);
      // A previous link's guard does not describe this one — but the platform
      // context it installed is still in force, so it is NOT cleared here.
      clearShareHash();
      return;
    }
    setShareError(null);
    const payload = decoded.payload;
    // Security 2026-07-25: decide — before anything is applied — whether this
    // link may use the user's credentials and rewrite their stored settings.
    // A new link fully replaces the platform context, so it also replaces (or
    // clears) any guard a previous link installed.
    const policy = decideShareRunPolicy(payload);
    host.applyUntrustedGuard(untrustedGuardForPolicy(policy));
    const nextPlatform = payload.platform ?? "github";
    const nextEndpoint = payload.endpoint ?? "https://api.github.com";
    host.loadConfigText(payload.config);
    host.setFileName(payload.fileName);
    // The link's platform/endpoint always reach the UI (transparency: the user
    // must be able to SEE the host that was asked for) but only a trusted one
    // is written to localStorage — a link must never silently repoint a
    // persistent setting at an arbitrary host, where it would outlive the tab
    // and quietly apply to later, credentialed runs.
    host.setPlatform(nextPlatform);
    host.setEndpoint(nextEndpoint);
    if (policy.persistPlatformSettings) {
      persistLocal(PLATFORM_KEY, nextPlatform);
      persistLocal(ENDPOINT_KEY, nextEndpoint);
    }
    // 008 layers ride along in v2 links; absent = layers off.
    host.setGlobalText(payload.globalConfig ? JSON.stringify(payload.globalConfig, null, 2) : "");
    host.setInheritedText(
      payload.inheritedConfig ? JSON.stringify(payload.inheritedConfig, null, 2) : "",
    );
    host.setPlatformOverride(payload.platformOverride === true);
    if (payload.globalConfig || payload.inheritedConfig || policy.suppressTokens) {
      host.setAdvancedOpen(true);
    }
    if (policy.suppressTokens) {
      host.setHostSectionOpen(true);
    }
    host.pendingViewRef.current = payload.view ?? null;
    // Roadmap 031: the version-drift notice is informational — it must not
    // hold the run behind the full engine download, so it fires whenever the
    // version lands (usually mid-run), under the same cancellation rule it
    // always had.
    void (async () => {
      const current = await versionPromise;
      if (current !== null && !isCancelled() && payload.renovate && payload.renovate !== current) {
        host.setNotice(
          `This link was created with Renovate v${payload.renovate}; you're on v${current} — results may differ.`,
        );
      }
    })();
    if (!isCancelled()) {
      // Awaited (not fire-and-forget) so a carried simulator descriptor is
      // armed AFTER the result commits — the RuleSimulator then applies it
      // against the freshly-run config, identically on mount and hashchange.
      await host.onRun(
        {
          fileName: payload.fileName,
          content: payload.config,
          platform: nextPlatform,
          endpoint: nextEndpoint,
          globalConfig: payload.globalConfig,
          inheritedConfig: payload.inheritedConfig,
          platformOverride: payload.platformOverride === true,
        },
        { suppressTokens: policy.suppressTokens },
      );
    }
    if (!isCancelled() && payload.sim) {
      setSimRequest({
        form: payload.sim.form,
        autoSimulate: payload.sim.autoSimulate === true,
        nonce: ++simNonceRef.current,
      });
    }
  }
  // Roadmap 034: both effects below are registered once (empty deps), so
  // calling `loadShareToken` directly would freeze the FIRST render's closure
  // — and with it that render's `onRun`, token and platform state. A link
  // opened later (hashchange) would then run against stale inputs. The
  // latest-ref pattern (as with `selectPresetNodeRef` in App.tsx) keeps both
  // registrations one-shot while always invoking the current closure.
  const loadShareTokenRef = useRef(loadShareToken);
  loadShareTokenRef.current = loadShareToken;

  // On mount: first complete an OAuth callback if the URL carries one (QUERY
  // params ?code&state), then — reading the possibly-restored fragment — decode
  // a shared config, populate state and auto-run. OAuth runs before the share
  // decode so a share link survives a sign-in round-trip. Still runs once:
  // `oauthConfig` is a `useMemo(…, [])` over build-time env (App.tsx), so it
  // is a constant for the app's lifetime — it is in the deps only because it
  // is read here, not because this is meant to re-run.
  useEffect(() => {
    const generation = ++decodeGenerationRef.current;
    const isCancelled = () => !mountedRef.current || decodeGenerationRef.current !== generation;
    void (async () => {
      // 1. OAuth callback (009): validate state, exchange via the Worker, store
      // the token, then strip the query and restore the pre-sign-in fragment.
      const callback = oauthConfig ? readCallbackParams(window.location.search) : null;
      if (callback) {
        try {
          const { userPromise, returnHash } = await completeCallback(callback.code, callback.state);
          if (isCancelled()) {
            return;
          }
          // Roadmap 031: the token is stored, so the session is signed in NOW
          // — a share link riding on `returnHash` decodes and auto-runs below
          // without waiting for the cosmetic profile fetch, whose result
          // lands on the toolbar chip whenever it arrives. Ordering
          // preserved: the fragment is restored before the share decode
          // reads it, and the auto-run still sees the stored token. Gated on
          // the mount latch (not the decode generation) — a hashchange
          // superseding the DECODE must not strand the chip nameless.
          hostRef.current.setSignedIn(true);
          writeHash(window.location.pathname + returnHash, readShareToken(returnHash));
          void (async () => {
            const user = await userPromise;
            if (user && mountedRef.current) {
              hostRef.current.setAuthUser(user);
            }
          })();
        } catch (err) {
          if (isCancelled()) {
            return;
          }
          hostRef.current.setNotice(
            `GitHub sign-in failed: ${err instanceof Error ? err.message : String(err)}. You can still use the app signed out.`,
          );
          writeHash(window.location.pathname, null);
          return;
        }
      }

      // 2. Shared config (007) from the URL fragment (survives the OAuth strip).
      const shareToken = readShareToken(window.location.hash);
      if (!shareToken) {
        return;
      }
      await loadShareTokenRef.current(shareToken, isCancelled);
    })();
  }, [oauthConfig]);

  // Roadmap 017: a share link opened while the app is already running is a
  // hash-only navigation — nothing reloads, so without this listener nothing
  // happens (no load, no run, no error). `decideHashChangeAction` (pure, in
  // share.ts) decides whether the new hash carries a token worth loading and
  // whether loading it would clobber unsaved edits; `event.oldURL` is what
  // lets a declined confirm restore exactly the hash that was showing before
  // the navigation, so the address bar never lies about what's on screen.
  // Registered once (empty deps) — `contentRef`/`loadedContentRef` (via
  // `hostRef`) and `loadShareTokenRef` keep it reading current state despite
  // that.
  useEffect(() => {
    function onHashChange(event: HashChangeEvent) {
      const decision = decideHashChangeAction(
        window.location.hash,
        lastWrittenTokenRef.current,
        hostRef.current.contentRef.current !== hostRef.current.loadedContentRef.current,
      );
      if (decision.action === "ignore") {
        return;
      }
      if (
        decision.needsConfirm &&
        !window.confirm("Load shared config? Your current edits will be replaced.")
      ) {
        const oldHash = new URL(event.oldURL).hash;
        writeHash(
          window.location.pathname + window.location.search + oldHash,
          readShareToken(oldHash),
        );
        return;
      }
      const generation = ++decodeGenerationRef.current;
      const isCancelled = () => !mountedRef.current || decodeGenerationRef.current !== generation;
      void loadShareTokenRef.current(decision.token, isCancelled);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Encodes the CURRENT state (config + view, optionally simulator inputs) into
  // a link, copies it, and mirrors it into the address bar. Never continuously
  // syncs the hash (huge configs would thrash the URL) — on demand only. Tokens
  // are never encoded (see share.ts); `sim` carries only dependency-descriptor
  // form fields (roadmap 018).
  async function buildShareLinkAndCopyImpl(sim?: ShareSimulator) {
    const shareToken = await encodeShare(await host.buildShareState(sim));
    const url = buildShareUrl(shareToken);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can be unavailable (insecure context); the URL bar still updates.
    }
    writeHash(url, shareToken);
  }
  // Roadmap 032: the impl closes over this render's `host` (it must — the
  // share state IS the current app state), so it is redeclared every render.
  // Handing that closure out directly would defeat the memoized RuleSimulator
  // (its `onCopySimLink` prop); the latest-ref idiom (as with
  // `loadShareTokenRef` above) keeps the returned identity stable while every
  // call still encodes the current state.
  const buildShareLinkAndCopyRef = useRef(buildShareLinkAndCopyImpl);
  buildShareLinkAndCopyRef.current = buildShareLinkAndCopyImpl;
  const buildShareLinkAndCopy = useCallback(
    (sim?: ShareSimulator) => buildShareLinkAndCopyRef.current(sim),
    [],
  );

  return { shareError, simRequest, buildShareLinkAndCopy };
}
