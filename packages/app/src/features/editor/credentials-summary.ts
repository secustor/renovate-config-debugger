/**
 * Roadmap 076 — what the Advanced drawer's summary line says about credentials
 * before anyone opens it.
 *
 * Pure, and its own module, for the reason every other derivation in this app
 * is one: the drawer's `<summary>` is the only place a reader learns that this
 * session is carrying a token at all, and "carrying" is not a fact the markup
 * should be re-deciding inline. A `default` state is stated positively — github
 * on its shipped endpoint, nothing saved, nobody signed in — rather than as
 * "the count happens to be zero", because the endpoint is half of what makes
 * the defaults the defaults.
 */
import { PLATFORM_ENDPOINTS } from "@/data/platform-endpoints";
import type { HostTokenId } from "@/data/host-tokens";

export interface CredentialsInput {
  /** The per-host tokens, exactly as `useHostTokens` reports them. */
  tokens: readonly { id: HostTokenId; value: string }[];
  /** Roadmap 009: a GitHub sign-in covers github.com, so it counts as that
   *  host's credential whether or not a PAT is also saved. */
  signedIn: boolean;
  platform: string;
  endpoint: string;
}

export interface CredentialsSummary {
  /** Hosts this session can authenticate against. */
  count: number;
  /** Nothing has been changed from what the app ships with. */
  isDefault: boolean;
}

/** The endpoint field is empty (platform default in force) or literally the
 *  platform's shipped default. */
function isDefaultEndpoint(platform: string, endpoint: string): boolean {
  return endpoint === "" || endpoint === PLATFORM_ENDPOINTS[platform];
}

export function credentialsSummary(input: CredentialsInput): CredentialsSummary {
  let count = 0;
  for (const token of input.tokens) {
    if (token.id === "github") {
      continue;
    }
    if (token.value !== "") {
      count += 1;
    }
  }
  const github = input.tokens.find((token) => token.id === "github");
  if (input.signedIn || (github?.value ?? "") !== "") {
    count += 1;
  }
  return {
    count,
    isDefault:
      count === 0 &&
      input.platform === "github" &&
      isDefaultEndpoint(input.platform, input.endpoint),
  };
}
