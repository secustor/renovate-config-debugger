/**
 * Roadmap 076 — the credentials the drawer carries for hosts the four-row
 * HOST_TOKENS table does not name: `hostRules`-shaped entries (matchHost +
 * hostType + token) the engine resolves per request URL.
 *
 * Tokens are secrets, so this lives in sessionStorage ONLY (roadmap 009/010):
 * cleared when the tab closes, never in localStorage, and never in a share
 * link. No React — `run.ts` (which must stay engine-chunk-light) imports it too.
 *
 * In `lib/` rather than `data/`: it holds no data table at all. It is the
 * validation of an untrusted sessionStorage payload plus the CRUD around it,
 * i.e. behaviour, and its neighbours are the other validators
 * (structure review, finding 20).
 */
import { isNonEmptyString, isPlainObject, isString } from "@renovate-config-debugger/engine/is";
import { jsonLiteral } from "@renovate-config-debugger/engine/json";
import { isValidHost, isValidToken } from "@/lib/input-schemas";
import { sessionGet, sessionRemove, sessionSet } from "@/platform/storage";

export interface CustomHostRule {
  /** A bare host name (`isValidHost`) — the engine's `matchHost`. */
  host: string;
  /** Renovate's host-type vocabulary; `"any"` for a host typed in by hand. */
  hostType: string;
  token: string;
}

/** One sessionStorage key for the whole list — the rows are dynamic, so a
 *  key per host would leave orphans behind on every removal. */
export const HOST_RULES_KEY = "rcd.hostRules";

const MAX_HOST_TYPE_LENGTH = 32;
/** Renovate's host types are plain lowercase identifiers (`npm`, `docker`,
 *  `gitlab`, `go`, …) plus this app's `"any"`. */
const HOST_TYPE = /^[a-z0-9-]+$/;

function isValidHostType(value: unknown): value is string {
  return isString(value) && value.length <= MAX_HOST_TYPE_LENGTH && HOST_TYPE.test(value);
}

function parseRule(raw: unknown): CustomHostRule | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const { host, hostType, token } = raw;
  if (!isString(host) || !isValidHost(host)) {
    return null;
  }
  if (!isNonEmptyString(token) || !isValidToken(token)) {
    return null;
  }
  if (!isValidHostType(hostType)) {
    return null;
  }
  return { host, hostType, token };
}

/**
 * Roadmap 030: storage drifts across app versions and can be hand-edited, so
 * every entry is re-validated on the way out and an entry that fails is
 * dropped rather than poisoning the run (or, worse, reaching a request
 * header). Never throws — a corrupt value reads back as "no rules".
 */
export function readCustomHostRules(): readonly CustomHostRule[] {
  const raw = sessionGet(HOST_RULES_KEY);
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sessionRemove(HOST_RULES_KEY);
    return [];
  }
  if (!Array.isArray(parsed)) {
    sessionRemove(HOST_RULES_KEY);
    return [];
  }
  const rules: CustomHostRule[] = [];
  for (const entry of parsed) {
    const rule = parseRule(entry);
    if (rule) {
      rules.push(rule);
    }
  }
  return rules;
}

/** Writes the list back, dropping anything that would not survive a read.
 *  An empty list removes the key entirely (absence IS "no rules"). */
export function persistCustomHostRules(rules: readonly CustomHostRule[]): void {
  const valid = rules.filter((rule) => parseRule(rule) !== null);
  if (valid.length === 0) {
    sessionRemove(HOST_RULES_KEY);
    return;
  }
  sessionSet(HOST_RULES_KEY, jsonLiteral(valid));
}
