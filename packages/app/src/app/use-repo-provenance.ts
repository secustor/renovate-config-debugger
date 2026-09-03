import { useCallback, useState } from "react";
import { isTreeListingPlatform } from "@/data/host-tokens";
import { useStableCallback } from "@/hooks/use-stable-callback";
import type { LoadedRepo } from "@/types/repo";

/**
 * Where the config on screen came from.
 *
 * Two pieces of state that only make sense as a pair, and three writers that
 * were spread across ~1,000 lines of `App`. The tell that they wanted a name:
 * "the config came from nowhere now" was written twice as a bare two-setter
 * sequence — once for a share link's arrival, once for the Try-example button —
 * with nothing saying that both were the same idea, and nothing stopping a
 * third site from setting only one of the two.
 *
 * They are NOT the same idea, as it turns out, which is the other reason to
 * name them: a link REPLACES this session's provenance with its own claim,
 * while the example DISCARDS provenance entirely. Written as two setter calls
 * those read identically. Written as `adoptShareClaim` and `clear` they cannot
 * be confused, and the difference is stated once.
 */

export interface RepoProvenanceHost {
  /** The platform context in force. A suggestion is only actionable while the
   *  context could actually LIST the repo. */
  platform: string;
  endpoint: string;
  /** Whether a share link's untrusted-endpoint guard is in force — a connect
   *  made under one must not send the user's tokens. */
  suppressTokens: boolean;
}

export interface RepoProvenance {
  /** Roadmap 078: the repository a successful load fetched the config from —
   *  replaced by the next load. The Tests tab's From-repository picker exists
   *  only while this does. */
  loadedRepo: LoadedRepo | null;
  /** Roadmap 087: the repo a SHARE LINK said its config came from. Provenance
   *  the link CLAIMS, not a load this session performed — nothing is fetched
   *  until the user clicks the button that names it. Null while the platform
   *  context could not list it anyway, since the click would then lead only to
   *  a discovery that errors. */
  suggestion: string | null;
  /** A load succeeded: this is where the text on screen came from. */
  recordLoad: (repo: LoadedRepo) => void;
  /** A share link arrived. Its claim REPLACES this session's provenance — the
   *  previous `loadedRepo` described a config that is no longer on screen. */
  adoptShareClaim: (repo: string | null) => void;
  /** The text was replaced by something that belongs to no repository (the
   *  example, a wholesale edit). There is no provenance to describe. */
  clear: () => void;
  /** Accept the suggestion: grant this session repository ACCESS without
   *  touching the config the link installed. Keeps the platform context the
   *  link applied on arrival, and obeys its untrusted-endpoint guard exactly as
   *  a typed load would. Identity-stable — it travels through the run-view
   *  provider. */
  connect: () => void;
}

export function useRepoProvenance(host: RepoProvenanceHost): RepoProvenance {
  const [loadedRepo, setLoadedRepo] = useState<LoadedRepo | null>(null);
  const [claimedRepo, setClaimedRepo] = useState<string | null>(null);

  const recordLoad = useCallback((repo: LoadedRepo) => {
    setLoadedRepo(repo);
  }, []);

  const adoptShareClaim = useCallback((repo: string | null) => {
    setLoadedRepo(null);
    setClaimedRepo(repo);
  }, []);

  const clear = useCallback(() => {
    setLoadedRepo(null);
    setClaimedRepo(null);
  }, []);

  const canList = isTreeListingPlatform(host.platform);

  // The impl closes over THIS render's context; `useStableCallback` keeps the
  // handed-out identity stable.
  const connect = useStableCallback(() => {
    // Re-tested here, not read off `canList`: a boolean carries no narrowing
    // across the callback boundary, and the `platform` field below needs it.
    if (claimedRepo === null || !isTreeListingPlatform(host.platform)) {
      return;
    }
    setLoadedRepo({
      platform: host.platform,
      repo: claimedRepo,
      ...(host.endpoint === "" ? {} : { endpoint: host.endpoint }),
      suppressTokens: host.suppressTokens,
    });
  });

  return {
    loadedRepo,
    suggestion: canList ? claimedRepo : null,
    recordLoad,
    adoptShareClaim,
    clear,
    connect,
  };
}
