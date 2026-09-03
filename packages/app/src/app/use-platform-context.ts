/**
 * Roadmap 086 (the 048-deferred state-sharing ruling): the platform context —
 * which host the run talks to, the 008 global layer that can dictate it, the
 * explicit override, and the untrusted-endpoint guard — as one hook. It was
 * App.tsx's largest remaining state cluster, and its set-and-persist sequence
 * was spelled three times (here, the known-host repo load, the share link's
 * decode) with three deliberately different persist conditions.
 *
 * `applyPlatformContext` is now the one spelling. Persistence stays an
 * explicit parameter — the three conditions are security-relevant and belong
 * to the call sites: a hand-picked platform persists, a KNOWN-host repo load
 * persists, a share link persists only when its policy says the endpoint is
 * trusted (a link must never silently repoint a persistent setting at an
 * arbitrary host). The validity guard on the write mirrors the one `readLocal`
 * applies on the way back in.
 *
 * The guard pair (state + ref) keeps its 2026-07-25 contract: every mutation
 * goes through `applyUntrustedGuard`, ref first, so a handler that installs or
 * clears the guard and starts a fetch in the SAME tick decides token
 * suppression from the new value — over-suppressing would break a legitimate
 * private repo load, under-suppressing would leak the token.
 */
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { isString } from "@renovate-config-debugger/engine/is";
import { DEFAULT_ENDPOINT, DEFAULT_PLATFORM, PLATFORM_ENDPOINTS } from "@/data/platform-endpoints";
import {
  isValidEndpoint,
  isValidPlatform,
  type LayerParseResult,
  parseLayerJson,
} from "@/lib/input-schemas";
import type { UntrustedEndpointGuard } from "@/lib/share";
import {
  ENDPOINT_KEY,
  localRemove,
  persistLocal,
  PLATFORM_KEY,
  readLocal,
} from "@/platform/storage";
import { useSyncedReset } from "@/hooks/use-synced-reset";

export interface PlatformContext {
  /** The stored/typed platform — what `buildInputs` runs with. */
  platform: string;
  endpoint: string;
  /** The 008 global layer's JSON text (empty = layer off) and its parse. */
  globalText: string;
  setGlobalText: (text: string) => void;
  globalParse: LayerParseResult;
  /** Platform context values the global config carries (008/010 interplay). */
  globalPlatform: string | undefined;
  globalEndpoint: string | undefined;
  hasGlobalContext: boolean;
  /** The explicit "override the global config's context" flag (010). */
  platformOverride: boolean;
  setPlatformOverride: (override: boolean) => void;
  /** True while the control REFLECTS the global config's values. */
  reflectGlobal: boolean;
  /** What the toolbar shows — the global config's context unless overridden. */
  displayPlatform: string;
  displayEndpoint: string;
  /** Roadmap 010: a non-github display platform runs preset fetches locally. */
  usesLocal: boolean;
  untrustedGuard: UntrustedEndpointGuard | null;
  /** The same value read synchronously — see this file's header. */
  untrustedGuardRef: RefObject<UntrustedEndpointGuard | null>;
  /** The one way the guard changes — ref first, so a same-tick reader sees it. */
  applyUntrustedGuard: (next: UntrustedEndpointGuard | null) => void;
  /**
   * The one set-and-persist spelling. Both values always reach the UI
   * (transparency: the user must be able to SEE the host that was asked
   * for); `persist` is the caller's security decision.
   */
  applyPlatformContext: (platform: string, endpoint: string, opts: { persist: boolean }) => void;
  onPlatformChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  /** The override's own off switch ("use the global config's values"). */
  onUseGlobalValues: () => void;
  /** "Continue without tokens": acknowledgement, not a credentials decision. */
  onAcknowledgeUntrusted: () => void;
  /** "Use my tokens with <host>": the explicit, host-named opt-in. */
  onTrustUntrustedHost: () => void;
}

export function usePlatformContext(): PlatformContext {
  const [platform, setPlatform] = useState(() =>
    readLocal(PLATFORM_KEY, DEFAULT_PLATFORM, isValidPlatform),
  );
  const [endpoint, setEndpoint] = useState(() =>
    readLocal(ENDPOINT_KEY, DEFAULT_ENDPOINT, isValidEndpoint),
  );
  const [globalText, setGlobalText] = useState("");
  const [platformOverride, setPlatformOverride] = useState(false);
  // Security 2026-07-25: set while the platform context in force came from a
  // share link naming an untrusted endpoint. This is the ONLY thing that
  // decides token suppression — it outlives the banner on purpose. Cleared
  // only by the explicit opt-in, by hand-editing platform/endpoint, or by
  // loading something else.
  const [untrustedGuard, setUntrustedGuard] = useState<UntrustedEndpointGuard | null>(null);
  const untrustedGuardRef = useRef<UntrustedEndpointGuard | null>(null);

  // Roadmap 030: parses the optional JSON global layer (008),
  // pollution-checked. Empty text = layer off; error text kept verbatim (the
  // layer-editor render site and the run-blocking message depend on it).
  const globalParse = useMemo(() => parseLayerJson(globalText), [globalText]);
  const globalPlatform = isString(globalParse.config?.platform)
    ? globalParse.config.platform
    : undefined;
  const globalEndpoint = isString(globalParse.config?.endpoint)
    ? globalParse.config.endpoint
    : undefined;
  const hasGlobalContext = globalPlatform !== undefined || globalEndpoint !== undefined;
  const reflectGlobal = hasGlobalContext && !platformOverride;
  const displayPlatform = reflectGlobal && globalPlatform !== undefined ? globalPlatform : platform;
  // A global-config platform also displaces the toolbar endpoint (it belongs
  // to the toolbar's platform): fall back to the global platform's default.
  const displayEndpoint =
    reflectGlobal && globalEndpoint !== undefined
      ? globalEndpoint
      : reflectGlobal && globalPlatform !== undefined
        ? (PLATFORM_ENDPOINTS[globalPlatform] ?? "")
        : endpoint;
  const usesLocal = displayPlatform !== "github";

  // An override only exists relative to global-config values; when the global
  // config stops defining platform/endpoint, snap back to normal behavior.
  //
  // React's "adjust state when a prop changes" idiom rather than an effect: the
  // global config gaining or losing a platform context is the whole trigger and
  // the snap-back reads nothing else. It is a real CLEAR and not a mask over the
  // flag: a global config that comes back later must not resurrect an override
  // the user set against the previous one. Done during render, the toolbar never
  // paints a frame claiming an override against a global config that no longer
  // states one.
  useSyncedReset(hasGlobalContext, () => {
    if (!hasGlobalContext) {
      setPlatformOverride(false);
    }
  });

  const applyUntrustedGuard = useCallback((next: UntrustedEndpointGuard | null) => {
    untrustedGuardRef.current = next;
    setUntrustedGuard(next);
  }, []);

  const applyPlatformContext = useCallback(
    (nextPlatform: string, nextEndpoint: string, opts: { persist: boolean }) => {
      setPlatform(nextPlatform);
      setEndpoint(nextEndpoint);
      if (opts.persist) {
        // Validated before persisted (030) — mirrored by `readLocal`'s guard,
        // so an unpersistable value costs the write, never a poisoned read.
        if (isValidPlatform(nextPlatform)) {
          persistLocal(PLATFORM_KEY, nextPlatform);
        }
        if (isValidEndpoint(nextEndpoint)) {
          persistLocal(ENDPOINT_KEY, nextEndpoint);
        }
      }
    },
    [],
  );

  /**
   * Security 2026-07-25: the user typing in the platform/endpoint fields is a
   * deliberate act that REPLACES the context a link installed, so it ends the
   * guard. Whatever they typed is then governed by the ordinary hand-typed
   * rules (`isValidEndpoint` for storage, the run gate for Run).
   */
  const onPlatformChange = useCallback(
    (value: string) => {
      // With a global config supplying platform/endpoint, a manual change is
      // an explicit override (008/010) — flagged with a visible warning.
      if (hasGlobalContext) {
        setPlatformOverride(true);
      }
      applyUntrustedGuard(null);
      setPlatform(value);
      if (isValidPlatform(value)) {
        persistLocal(PLATFORM_KEY, value);
      }
      // Snap the endpoint to the new platform's default; the user can edit.
      const next = PLATFORM_ENDPOINTS[value] ?? "";
      setEndpoint(next);
      persistLocal(ENDPOINT_KEY, next);
    },
    [hasGlobalContext, applyUntrustedGuard],
  );

  // Roadmap 030: the endpoint is validated (http(s) only) before it is
  // persisted; an invalid value stays only in the live field (the run gate
  // blocks Run rather than silently using it) and never reaches storage.
  const onEndpointChange = useCallback(
    (value: string) => {
      if (hasGlobalContext) {
        setPlatformOverride(true);
      }
      applyUntrustedGuard(null);
      setEndpoint(value);
      if (isValidEndpoint(value)) {
        persistLocal(ENDPOINT_KEY, value);
      } else {
        localRemove(ENDPOINT_KEY);
      }
    },
    [hasGlobalContext, applyUntrustedGuard],
  );

  const onUseGlobalValues = useCallback(() => {
    setPlatformOverride(false);
  }, []);

  /** The banner collapses to the standing reminder beside Run; suppression
   *  itself is deliberately untouched. */
  const onAcknowledgeUntrusted = useCallback(() => {
    const guard = untrustedGuardRef.current;
    if (guard) {
      applyUntrustedGuard({ ...guard, acknowledged: true });
    }
  }, [applyUntrustedGuard]);

  /** From here the endpoint is treated exactly like a hand-typed one — later
   *  runs carry credentials and the context may persist to localStorage. */
  const onTrustUntrustedHost = useCallback(() => {
    applyUntrustedGuard(null);
    applyPlatformContext(platform, endpoint, { persist: true });
  }, [applyUntrustedGuard, applyPlatformContext, platform, endpoint]);

  return {
    platform,
    endpoint,
    globalText,
    setGlobalText,
    globalParse,
    globalPlatform,
    globalEndpoint,
    hasGlobalContext,
    platformOverride,
    setPlatformOverride,
    reflectGlobal,
    displayPlatform,
    displayEndpoint,
    usesLocal,
    untrustedGuard,
    untrustedGuardRef,
    applyUntrustedGuard,
    applyPlatformContext,
    onPlatformChange,
    onEndpointChange,
    onUseGlobalValues,
    onAcknowledgeUntrusted,
    onTrustUntrustedHost,
  };
}
