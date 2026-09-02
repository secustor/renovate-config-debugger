/**
 * Roadmap 076/077 (Proposal F) — what the Advanced drawer's collapsed line says
 * about credentials before anyone opens it.
 *
 * The design's grammar is `⟨host⟩ ✓` / `⟨host⟩ anonymous`, plus ` · +N` when
 * other hosts carry tokens too: the line names the host this session's
 * platform context points at and states — positively, never as "the count is
 * zero" — whether the session can authenticate against it. Pure, and its own
 * module, because "carrying a credential" is not a fact the markup should be
 * re-deciding inline.
 */
import { defaultEndpointFor } from "@/data/platform-endpoints";
import type { HostTokenId } from "@/data/host-tokens";
import { isValidToken } from "@/lib/input-schemas";

export interface CredentialsInput {
  /** The per-host tokens, exactly as `useHostTokens` reports them — `host` is
   *  the descriptor's canonical display host (github.com, gitlab.com, …). */
  tokens: readonly { id: HostTokenId; host: string; value: string }[];
  /** Roadmap 009: a GitHub sign-in covers github.com, so it counts as that
   *  host's credential whether or not a PAT is also saved. */
  signedIn: boolean;
  platform: string;
  endpoint: string;
  /** Roadmap 076: how many custom `hostRules` rows the session carries. They
   *  are credentials for hosts the four-row table does not name, so they can
   *  never BE the primary host — they only ever add to the ` · +N` tail. */
  customHostCount: number;
}

/** The endpoint field is empty (platform default in force) or literally the
 *  platform's shipped default. */
function isDefaultEndpoint(platform: string, endpoint: string): boolean {
  return endpoint === "" || endpoint === defaultEndpointFor(platform);
}

/** The host the line names. On the shipped endpoint that is the platform's
 *  canonical site host (`github.com`, not `api.github.com` — the design names
 *  the place, not the API path to it); once the endpoint is overridden it is
 *  the override's host, which is where requests actually go. */
function primaryHost(input: CredentialsInput, canonical: string | undefined): string {
  if (isDefaultEndpoint(input.platform, input.endpoint) && canonical !== undefined) {
    return canonical;
  }
  const effective = input.endpoint || defaultEndpointFor(input.platform) || "";
  if (effective !== "") {
    try {
      return new URL(effective).host;
    } catch {
      return effective;
    }
  }
  return input.platform;
}

export function credentialsLine(input: CredentialsInput): string {
  const primary = input.tokens.find((token) => token.id === input.platform);
  // "Carries a credential" is HostRows' rule: set AND valid — the app refuses to
  // save an invalid token, so the line must not claim one authenticates.
  const primaryValue = primary?.value ?? "";
  const primaryAuthed =
    (input.platform === "github" && input.signedIn) ||
    (primaryValue !== "" && isValidToken(primaryValue));
  let extras = input.customHostCount;
  for (const token of input.tokens) {
    if (token.id === input.platform) {
      continue;
    }
    // A sign-in and a PAT are one credential for github.com, not two.
    if (
      (token.value !== "" && isValidToken(token.value)) ||
      (token.id === "github" && input.signedIn)
    ) {
      extras += 1;
    }
  }
  const host = primaryHost(input, primary?.host);
  const status = primaryAuthed ? "✓" : "anonymous";
  return extras > 0 ? `${host} ${status} · +${extras}` : `${host} ${status}`;
}
