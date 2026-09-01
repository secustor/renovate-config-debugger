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
 * cancellation, self-write filtering, and the simulator request's attribution
 * rule — all live here; their comments moved with the statements they
 * annotate.
 */
import { useCallback, useEffect, useInsertionEffect, useRef, useState } from "react";
import { useLatestRef } from "./use-latest-ref";
import { useStableCallback } from "./use-stable-callback";
import type { TraceResult } from "@renovate-config-debugger/engine";
import {
  completeCallback,
  isSignedIn,
  type OAuthConfig,
  readCallbackParams,
  restoreSession,
  type StoredUser,
} from "@/platform/oauth";
import { getRenovateVersion } from "@/platform/run";
import { DEFAULT_ENDPOINT, DEFAULT_PLATFORM } from "@/data/platform-endpoints";
import type { RunInputs } from "@/lib/run-inputs";
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
} from "@/lib/share";
import { errorMessage } from "@/lib/errors";

/** Roadmap 018: a share link's simulator inputs, applied once by nonce. */
export interface SimRequest {
  form: Record<string, string>;
  autoSimulate: boolean;
  /** Roadmap 054: the verdict thread the link asked to open, applied to the
   *  run this request triggers (absent = every thread starts collapsed). */
  simThread?: string;
  /**
   * Roadmap 068 review — the result this request may be applied to: the one
   * the link's OWN run produced, or null when that run produced nothing to
   * simulate against (it failed outright, or it returned a trace with no
   * effective config). Naming it is what makes the attribution rule in
   * `loadShareToken` a matter of identity rather than of timing; see there,
   * and `useShareLinkRequest`, which is the one consumer that resolves it.
   */
  ranResult: TraceResult | null;
  nonce: number;
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
  /** The pipeline run path. The hook AWAITS this (never fire-and-forget) and
   *  keeps what it returns: the resolved value IS the result this link
   *  produced, which is what the simulator request is attributed to when that
   *  result carries an effective config (see `loadShareToken`) — a null means
   *  the run failed outright. A link's run is never declined either:
   *  `App.onRun` queues a request that arrives during another run instead of
   *  dropping it, which is what this path needs, having already replaced the
   *  config, the file name and the platform by the time it gets here. */
  onRun: (inputs: RunInputs, opts: { suppressTokens: boolean }) => Promise<TraceResult | null>;
  /** Roadmap 016: the one path every authoritative content load goes through. */
  loadConfigText: (text: string) => void;
  setFileName: (fileName: ShareFileName) => void;
  /** The one set-and-persist spelling (086). Both values always reach the
   *  UI; persistence is the link policy's decision, passed explicitly. */
  applyPlatformContext: (platform: string, endpoint: string, opts: { persist: boolean }) => void;
  setGlobalText: (text: string) => void;
  setInheritedText: (text: string) => void;
  setPlatformOverride: (override: boolean) => void;
  /** Reveals the host/endpoint field: the Advanced drawer AND the host
   *  sub-section inside it, since one without the other still leaves the field
   *  off screen. ONE callback rather than the two setters it happens to call,
   *  because this hook has exactly one reason to reach for either (the
   *  untrusted-endpoint guard below) and never a reason to open one alone — the
   *  two disclosures stay separately owned in App, where the user toggles
   *  them. */
  openHostCredentials: () => void;
  setNotice: (notice: string | null) => void;
  setSignedIn: (signedIn: boolean) => void;
  setAuthUser: (user: StoredUser | null) => void;
  /** The one way the untrusted-endpoint guard changes (see App.tsx). */
  applyUntrustedGuard: (guard: UntrustedEndpointGuard | null) => void;
  /** Roadmap 075 (iteration 6): the link's pinned tests, as descriptor field
   *  bags — App turns them into pins (minting its own ids) and the Tests tab
   *  re-checks them against the run this link is about to start. Called with
   *  `[]` when the link carries none, for the reason `setSimRequest(null)` is
   *  unconditional: a link installs the screen it describes, and pins from a
   *  previous one are not part of it. */
  setPins: (pins: Record<string, string>[]) => void;
  /** Roadmap 087: the link's repo provenance — the slug the config was loaded
   *  from, or null. Called unconditionally in the populate block for the same
   *  reason `setPins` is: a link installs the screen it describes, and the
   *  repository a PREVIOUS session had loaded is not part of it — App clears
   *  its `LoadedRepo` and holds the slug as the connect panel's suggestion. */
  applyShareRepo: (repo: string | null) => void;
  /** View state pending from a decoded link, applied by App once the run
   *  produces a result (identities → node ids need the resolved tree). App
   *  holds it in a ref (consuming it must not render); this hook only ARMS it,
   *  through a callback rather than the ref, because writing into an object
   *  handed in here would be this hook mutating its own argument. */
  setPendingView: (view: ShareView | null) => void;
  /** Roadmap 017: whether the user has typed since the last authoritative
   *  load, as a ref for the hashchange listener — registered once (empty deps),
   *  it would otherwise close over the state from that first render. */
  hasUnsavedEditsRef: { readonly current: boolean };
  /** Assembles the CURRENT app state (config + view + optional simulator
   *  inputs) for encoding — the view-cluster knowledge stays in App.tsx. */
  buildShareState: (sim?: ShareSimulator) => Promise<ShareState>;
}

export interface ShareLink {
  /** Roadmap 027: a token was present but unreadable — banner text, or null. */
  shareError: string | null;
  /** Roadmap 018: the newest decoded link's simulator inputs, handed to the
   *  RuleSimulator to pre-fill — and, when `autoSimulate`, to run — against
   *  the result that link's config produced. Null whenever the link on screen
   *  asked for no simulation at all. A link whose config fails to run keeps
   *  both the descriptor and its `autoSimulate`, waiting for the run the user
   *  gets after fixing the config; what it never does is land on a result some
   *  other link produced (see `loadShareToken`). */
  simRequest: SimRequest | null;
  buildShareLinkAndCopy: (sim?: ShareSimulator) => Promise<void>;
  /** Roadmap 009 (auth-failure surfacing): the `#config=…` fragment a sign-in
   *  redirect should return to — the current state as a share token, so the
   *  round trip through GitHub keeps the config (and re-runs it on arrival).
   *  See App.tsx's `signInRef` for why the sign-in path needs one at all. */
  buildSignInReturnHash: () => Promise<string>;
}

export function useShareLink(oauthConfig: OAuthConfig | null, host: ShareLinkHost): ShareLink {
  // Roadmap 027: cleared whenever a share load succeeds, so a broken link
  // never reads as "nothing happened" while a working one shows no residue.
  const [shareError, setShareError] = useState<string | null>(null);
  // A fresh nonce per link lets the RuleSimulator apply each request exactly
  // once; WHICH run it may be applied to is the descriptor's own `ranResult`
  // (see the attribution rule in `loadShareToken`).
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
  // Spelled out rather than through `useLatestRef`: the effects below read
  // `hostRef.current.hasUnsavedEditsRef` etc., and `exhaustive-deps` only knows a
  // `.current` read is not a dependency when it can see the `useRef()` call
  // itself — routed through a custom hook it demands the DEREFERENCED value in
  // the list, which is the one thing that must never be in there.
  // The write itself is `useLatestRef`'s, inlined: an insertion effect, so it
  // is not a render-time ref write (`react/refs`) while still landing before
  // every effect and handler of the same commit — which is all this ref is
  // ever read from.
  const hostRef = useRef(host);
  useInsertionEffect(() => {
    hostRef.current = host;
  });

  /** Roadmap 017: the one path every self-initiated hash write goes through —
   *  updates the address bar and records the token (or lack of one) so the
   *  hashchange listener can recognize its own writes.
   *
   *  A `useCallback([])` rather than a plain function declaration because the
   *  two one-shot effects below call it: it reads nothing but a ref and the
   *  `history` global, so it never goes stale, but as a per-render declaration
   *  it was a value those effects used and did not list. Pinned here it can be
   *  listed honestly without either effect re-registering. */
  const writeHash = useCallback((url: string, shareToken: string | null) => {
    lastWrittenTokenRef.current = shareToken;
    history.replaceState(null, "", url);
  }, []);

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
    const nextPlatform = payload.platform ?? DEFAULT_PLATFORM;
    const nextEndpoint = payload.endpoint ?? DEFAULT_ENDPOINT;
    host.loadConfigText(payload.config);
    host.setFileName(payload.fileName);
    // The link's platform/endpoint always reach the UI (transparency: the user
    // must be able to SEE the host that was asked for) but only a trusted one
    // is written to localStorage — a link must never silently repoint a
    // persistent setting at an arbitrary host, where it would outlive the tab
    // and quietly apply to later, credentialed runs.
    host.applyPlatformContext(nextPlatform, nextEndpoint, {
      persist: policy.persistPlatformSettings,
    });
    // 008 layers ride along in v2 links; absent = layers off.
    host.setGlobalText(payload.globalConfig ? JSON.stringify(payload.globalConfig, null, 2) : "");
    host.setInheritedText(
      payload.inheritedConfig ? JSON.stringify(payload.inheritedConfig, null, 2) : "",
    );
    host.setPlatformOverride(payload.platformOverride === true);
    // Roadmap 076: the ONE reason left to force the drawer open is the
    // untrusted-endpoint policy, whose banner tells the user to go review the
    // host — so the field holding it has to be on screen. A link carrying 008
    // layers used to open it too, because that is where the layers were; they
    // are stage nodes on the pipeline rail now, where the link's own run lights
    // them up without anything being unfolded for them.
    if (policy.suppressTokens) {
      host.openHostCredentials();
    }
    host.setPendingView(payload.view ?? null);
    // Roadmap 075 (iteration 6): the pins ride in BEFORE the run below, so the
    // result that run commits is the first thing they are checked against —
    // which is the whole promise of the tab that lists them.
    host.setPins(payload.pins ?? []);
    host.applyShareRepo(payload.repo ?? null);
    // Roadmap 068 review — half one of the attribution rule stated below: a
    // decode that replaces the screen replaces the simulator request with it,
    // HERE, before its own run. A link that carries no `sim` is not silent
    // about the simulator — it says the screen it is installing should carry
    // no request either — so the clear is unconditional within this populate
    // block (a decode that failed above returned without touching anything,
    // leaving the previous link's config AND its request in place, which is
    // the same statement). No request outlives the link that asked for it.
    setSimRequest(null);
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
    let ran: TraceResult | null = null;
    if (!isCancelled()) {
      // Awaited (not fire-and-forget) for what it RETURNS: the result this
      // link produced, which the descriptor below names.
      ran = await host.onRun(
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
    // Roadmap 018/068 review — THE INVARIANT: a simulation may only ever be
    // attributed to the config the link that requested it produced. That is a
    // statement about identity, not about timing or about which entry path
    // decoded the link, and it is carried by two halves that need no flag
    // between them:
    //
    //  1. a request belongs to exactly one link. The unconditional clear
    //     above runs at decode time, BEFORE this link's run, so a descriptor
    //     can never still be sitting there when a later link's result lands.
    //  2. a request names the result it may be applied to — `attributable`
    //     below. When the run produced one, that IS the result; when it did
    //     not, this link has yet to produce one, and the `null` tells
    //     `useShareLinkRequest` to hold the request until a result arrives
    //     that was not already on screen when the request did.
    //
    // The descriptor is handed over either way, `autoSimulate` intact. Losing
    // it on failure was its own bug: the form is the sender's "look at this
    // dependency", the recipient fixes the config the link shipped and runs,
    // and that run is still this link's — half 1 guarantees no other link has
    // been through in the meantime, since one would have cleared this request
    // on its way in. What half 2 forbids is the descriptor landing on the
    // verdict that happened to be up when the link arrived (a previous link's,
    // or an earlier session's) — the pair no sender ever put in a link.
    //
    // One thing neither half can undo: a run started by an EARLIER decode is
    // not cancelled by this one (App queues runs, it does not abandon them),
    // so its result can still commit under this link. This request is not
    // handed over until this link's own run has settled behind it, so the
    // stale commit passes while there is nothing to apply.
    //
    // "Produced a result" is `finalConfig`, not a non-null `ran`: a run only
    // throws on a fatal, and the config the link shipped failing to parse is
    // not one — the pipeline returns the trace it has, effective config
    // absent, and there is nothing for a simulation to be about. Naming that
    // trace would have parked the descriptor on an object no later run can
    // equal, so the request waited for an identity that could never arrive
    // (the recipient fixed the JSON, ran, and got an empty simulator form).
    const attributable = ran?.finalConfig ? ran : null;
    if (!isCancelled() && payload.sim) {
      setSimRequest({
        form: payload.sim.form,
        autoSimulate: payload.sim.autoSimulate === true,
        // Roadmap 054: rides along with the form rather than through `view`
        // (where `simStep` lives) because it is only meaningful for the
        // simulation this descriptor reproduces — see ShareSimulator.
        simThread: payload.sim.simThread,
        ranResult: attributable,
        nonce: ++simNonceRef.current,
      });
    }
  }
  // Roadmap 034: both effects below are registered once (nothing in either
  // dependency list ever changes identity after mount), so calling
  // `loadShareToken` directly would freeze the FIRST render's closure
  // — and with it that render's `onRun`, token and platform state. A link
  // opened later (hashchange) would then run against stale inputs. The
  // latest-ref pattern (as with `selectPresetNodeRef` in App.tsx) keeps both
  // registrations one-shot while always invoking the current closure.
  const loadShareTokenRef = useLatestRef(loadShareToken);

  // On mount: first complete an OAuth callback if the URL carries one (QUERY
  // params ?code&state) — or, when there is none, try roadmap 065's silent
  // cookie restore — then, reading the possibly-restored fragment, decode a
  // shared config, populate state and auto-run. Both auth steps run before the
  // share decode so a share link survives a sign-in round-trip. Still runs once:
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
          // Roadmap 009 (auth-failure surfacing): a token on the return
          // fragment means step 2 below is about to re-run the config the user
          // signed in FROM — the auto-rerun that closes the auth-failure loop.
          // It happens exactly once per callback (this effect is one-shot),
          // and only when a run existed to encode (App.tsx's `signInRef`).
          const returnToken = readShareToken(returnHash);
          writeHash(window.location.pathname + returnHash, returnToken);
          void (async () => {
            const user = await userPromise;
            if (user && mountedRef.current) {
              hostRef.current.setAuthUser(user);
              // Said only once the login is known — a nameless "running
              // again…" would be the app narrating itself; with the login it
              // is the confirmation that the sign-in took, which is the
              // question a user who just came back from GitHub actually has.
              if (returnToken) {
                hostRef.current.setNotice(`Signed in as ${user.login} — running again…`);
              }
            }
          })();
        } catch (err) {
          if (isCancelled()) {
            return;
          }
          hostRef.current.setNotice(
            `GitHub sign-in failed: ${errorMessage(err)}. You can still use the app signed out.`,
          );
          writeHash(window.location.pathname, null);
          return;
        }
      }

      // 2. Roadmap 065 — no callback, but a previous tab may have left a live
      // `HttpOnly` refresh cookie: one silent /refresh restores the session.
      // Ordered here for the same reason the callback branch is (and awaited
      // for the same reason): step 3's decode can auto-run a link whose
      // presets are private, and that run must see the restored token rather
      // than a 404 it would have to be re-run to fix. `restoreSession` is
      // single-flight and returns without a round trip when there is nothing
      // to restore, so the cost on the ordinary signed-out boot is nil.
      if (!callback && oauthConfig && !isSignedIn()) {
        const user = await restoreSession();
        // The session, not the chip, decides `signedIn`: the profile fetch is
        // cosmetic and yields null on failure, so a nameless-but-restored
        // session must still read as signed in (same contract as above).
        if (!isCancelled() && isSignedIn()) {
          hostRef.current.setSignedIn(true);
          if (user) {
            hostRef.current.setAuthUser(user);
          }
        }
      }

      // 3. Shared config (007) from the URL fragment (survives the OAuth strip).
      const shareToken = readShareToken(window.location.hash);
      if (!shareToken) {
        return;
      }
      await loadShareTokenRef.current(shareToken, isCancelled);
    })();
    // `loadShareTokenRef` is a stable ref object, listed only because
    // `exhaustive-deps` cannot see the `useRef()` behind `useLatestRef`;
    // `writeHash` is pinned by its own `useCallback([])`. Neither ever changes
    // identity, so this stays the one-shot registration described above.
  }, [oauthConfig, loadShareTokenRef, writeHash]);

  // Roadmap 017: a share link opened while the app is already running is a
  // hash-only navigation — nothing reloads, so without this listener nothing
  // happens (no load, no run, no error). `decideHashChangeAction` (pure, in
  // share.ts) decides whether the new hash carries a token worth loading and
  // whether loading it would clobber unsaved edits; `event.oldURL` is what
  // lets a declined confirm restore exactly the hash that was showing before
  // the navigation, so the address bar never lies about what's on screen.
  // Registered once — `hasUnsavedEditsRef` (via `hostRef`) and
  // `loadShareTokenRef` keep it reading current state despite that, so the
  // dependency list holds only identity-pinned values: that ref object and
  // `writeHash`'s `useCallback([])`.
  useEffect(() => {
    function onHashChange(event: HashChangeEvent) {
      const decision = decideHashChangeAction(
        window.location.hash,
        lastWrittenTokenRef.current,
        hostRef.current.hasUnsavedEditsRef.current,
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
  }, [loadShareTokenRef, writeHash]);

  // Encodes the CURRENT state (config + view, optionally simulator inputs) into
  // a link, copies it, and mirrors it into the address bar. Never continuously
  // syncs the hash (huge configs would thrash the URL) — on demand only. Tokens
  // are never encoded (see share.ts); `sim` carries only dependency-descriptor
  // form fields (roadmap 018). Rejects when the copy failed, so no caller draws
  // a receipt for a copy that didn't happen — but says where the link IS first,
  // because every caller's catch is silent by design.
  async function buildShareLinkAndCopyImpl(sim?: ShareSimulator) {
    const shareToken = await encodeShare(await host.buildShareState(sim));
    const url = buildShareUrl(shareToken);
    let copied = true;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Insecure context (or a denied permission): `navigator.clipboard` may
      // not even exist.
      copied = false;
    }
    // Before the notice and the throw, deliberately: the address bar (and
    // `lastWrittenTokenRef`) is what both of them tell the user they still have.
    writeHash(url, shareToken);
    if (!copied) {
      // Not an edge case: the encode above has to await, and Safari drops a
      // clipboard write issued after one (roadmap 082), so this is that
      // browser's ordinary outcome — a silent Share button there otherwise.
      host.setNotice("Couldn’t copy to the clipboard — the link is in the address bar.");
      throw new Error("share link not copied: clipboard unavailable");
    }
  }
  // Roadmap 032: the impl closes over this render's `host` (it must — the
  // share state IS the current app state), so it is redeclared every render.
  // Handing that closure out directly would defeat the memoized RuleSimulator
  // (its `onCopySimLink` prop); `useStableCallback` keeps the returned identity
  // stable while every call still encodes the current state.
  const buildShareLinkAndCopy = useStableCallback(buildShareLinkAndCopyImpl);

  /**
   * Roadmap 009 (auth-failure surfacing): the same encode, WITHOUT the copy or
   * the address-bar write — the caller hands the result to `beginSignIn`,
   * which stashes it in sessionStorage and restores it after the callback.
   * Reusing `buildShareUrl` rather than re-spelling `#config=` keeps the one
   * definition of the wire format in share.ts.
   */
  async function buildSignInReturnHashImpl(): Promise<string> {
    return new URL(buildShareUrl(await encodeShare(await host.buildShareState()))).hash;
  }
  // Same reason as above: the impl closes over this render's `host` (it must —
  // the return hash IS the current state), and the identity handed out reaches
  // App's own stable `onSignIn`.
  const buildSignInReturnHash = useStableCallback(buildSignInReturnHashImpl);

  return { shareError, simRequest, buildShareLinkAndCopy, buildSignInReturnHash };
}
