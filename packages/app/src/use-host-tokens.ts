/**
 * Roadmap 033 — the host-token cluster as one hook. State init (validated
 * reads), change handlers and the invalid-token derivation all map over the
 * HOST_TOKENS table, replacing four hand-repeated state slots (which had
 * already drifted: GitHub had a hoisted change handler, the other three
 * allocated closures inline in JSX).
 */
import { useState } from "react";
import { HOST_TOKENS, type HostTokenDescriptor, type HostTokenId } from "./host-tokens";
import { isValidToken } from "./input-schemas";
import { persistSession, readSession, sessionRemove } from "./storage";

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
  // it just isn't persisted while invalid — see the token inputs' inline
  // error rows (App.tsx) for the same check surfaced in the UI.
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
