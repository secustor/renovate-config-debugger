/**
 * Roadmap 033 — the host-token cluster as one hook. State init (validated
 * reads), change handlers and the invalid-token derivation all map over the
 * HOST_TOKENS table, replacing four hand-repeated state slots (which had
 * already drifted: GitHub had a hoisted change handler, the other three
 * allocated closures inline in JSX).
 *
 * Roadmap 076 adds its sibling, `useCustomHostRules` — the same cluster for
 * the hosts that table does NOT name, which are a list rather than four fixed
 * slots and therefore persist as one JSON value (see lib/custom-host-rules).
 */
import { useCallback, useState } from "react";
import {
  type CustomHostRule,
  persistCustomHostRules,
  readCustomHostRules,
} from "@/lib/custom-host-rules";
import { HOST_TOKENS, type HostTokenDescriptor, type HostTokenId } from "@/data/host-tokens";
import { isValidHost, isValidToken } from "@/lib/input-schemas";
import { persistSession, readSession, sessionRemove } from "@/platform/storage";

/** A host row ready for the token inputs: the table entry plus live state. */
export interface HostTokenField extends HostTokenDescriptor {
  value: string;
  onChange: (value: string) => void;
}

export function useHostTokens(): HostTokenField[] {
  const [tokens, setTokens] = useState<Record<HostTokenId, string>>(() => {
    const initial = {} as Record<HostTokenId, string>;
    for (const host of HOST_TOKENS) {
      initial[host.id] = readSession(host.storageKey, "", isValidToken);
    }
    return initial;
  });

  // Roadmap 030: a token is validated (no control chars, sane length — the
  // header-injection rule) before it is ever written to storage; the field
  // still reflects whatever was typed (so the user isn't blocked mid-edit),
  // it just isn't persisted while invalid — see the inline error rows in
  // features/editor/CredentialsList.tsx for the same check surfaced in the UI.
  function setHostToken(host: HostTokenDescriptor, value: string): void {
    setTokens((prev) => ({ ...prev, [host.id]: value }));
    if (isValidToken(value)) {
      persistSession(host.storageKey, value);
    } else {
      sessionRemove(host.storageKey);
    }
  }

  return HOST_TOKENS.map((host) => ({
    ...host,
    value: tokens[host.id],
    onChange: (value: string) => setHostToken(host, value),
  }));
}

/** Roadmap 076: the credential rows for hosts HOST_TOKENS does not name. */
export interface CustomHostRules {
  rules: readonly CustomHostRule[];
  /** Adding a host already in the list REPLACES its rule — the drawer shows
   *  one row per host, so two rules for one host could never be told apart. */
  addRule: (host: string, hostType: string, token: string) => void;
  removeRule: (host: string) => void;
}

export function useCustomHostRules(): CustomHostRules {
  const [rules, setRules] = useState<readonly CustomHostRule[]>(readCustomHostRules);

  // Roadmap 030, same rule as the per-host tokens above: a host or token that
  // fails validation is never written — here it is never even taken into
  // state, because unlike a token input there is no mid-edit value to
  // reflect (the add form gates its own submit on the same checks).
  // Written outside the state updater on purpose: an updater must stay pure
  // (StrictMode calls it twice).
  const addRule = useCallback(
    (host: string, hostType: string, token: string) => {
      if (!isValidHost(host) || token === "" || !isValidToken(token)) {
        return;
      }
      const next = [...rules.filter((rule) => rule.host !== host), { host, hostType, token }];
      persistCustomHostRules(next);
      setRules(next);
    },
    [rules],
  );

  const removeRule = useCallback(
    (host: string) => {
      const next = rules.filter((rule) => rule.host !== host);
      persistCustomHostRules(next);
      setRules(next);
    },
    [rules],
  );

  return { rules, addRule, removeRule };
}
