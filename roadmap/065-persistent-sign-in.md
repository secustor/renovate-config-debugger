# 065 — Persistent sign-in: HttpOnly refresh-token cookie

Renumbered from 053 (2026-08-05): main took that number for the analytics
localhost-exclusion item while this work sat in review, and 054–061 went to
items that landed or were reserved since. The `feat/persistent-sign-in-cookie`
branch name predates the renumber and stays as-is.

## Problem

The 009 session lives in memory + `sessionStorage`, so closing the tab signs
the user out even though GitHub issued a 6-month refresh token. The BCP-aligned
reason was to keep tokens out of persistent, XSS-readable storage — putting the
refresh token in `localStorage` would trade that away.

## Decision

Keep every token out of persistent JS-readable storage AND survive tab
closure: the **refresh token moves into an `HttpOnly` cookie set by the
oauth-worker**, opt-in per deployment (`REFRESH_COOKIE=true`). The access
token stays in memory + `sessionStorage` exactly as in 009. The only thing the
app persists in `localStorage` is a non-secret marker ("a cookie session
exists until \<epoch ms\>") so boot knows a silent refresh is worth trying.

This is the OAuth-BCP "BFF-lite" shape: XSS can still use the session while
the page is open (it can always call `/refresh` itself), but it can no longer
**exfiltrate** the long-lived refresh token — possession stays with the
browser's cookie jar.

### Deployment shape (production)

Same-origin path routing, not a second hostname: the worker is routed at
`renovate.secustor.dev/oauth/*` (Cloudflare Workers route; the zone moved to
Cloudflare DNS for this). Same-origin means no CORS preflight coupling, no
third-party-cookie exposure in any browser, and `SameSite=Strict`.

Consequences the code must honor:

- **Route prefix**: on a route the worker receives `/oauth/exchange` etc., on
  `workers.dev` or the Node image it receives `/exchange`. The handler strips
  one leading `/oauth` segment; the cookie `Path` mirrors the mount
  (`/oauth` when prefixed, `/` otherwise) so the cookie is **never sent to
  GitHub Pages requests** on the shared hostname.
- **Cookie name** uses the `__Secure-` prefix (not `__Host-`, which would
  force `Path=/` — exactly what the previous point forbids).
- **Orange-cloud dependency**: a Workers route only fires on proxied traffic,
  so the `renovate` DNS record must be proxied (SSL mode Full (strict);
  GitHub Pages holds a valid cert for the hostname). The record stays
  DNS-only until Cloudflare's Universal SSL cert for the zone is issued.

### Protocol changes (worker)

All behind `REFRESH_COOKIE=true`; with it unset the worker is byte-identical
to 009 — the stock Docker image and `workers.dev` deployments are unaffected.
A `*.workers.dev` host keeps 009 **even with the var set**: that URL is only
ever reached cross-site, where the `SameSite=Strict` cookie would be stored
nowhere and sent never — engaging cookie mode there would strip the in-body
refresh token in exchange for a cookie the browser drops, capping the session
at one access token. The handler excludes the host structurally, which is what
makes publishing `REFRESH_COOKIE=true` safe while `workers.dev` is still the
live entry point (before the DNS switch).

- `POST /exchange`, `POST /refresh` (success): the `refresh_token` is removed
  from the JSON body and set as
  `__Secure-rcv-refresh=<token>; HttpOnly; Secure; SameSite=Strict;
Path=<mount>; Max-Age=<refresh_token_expires_in>`; the body instead carries
  `refresh_token_cookie: true` (how the SPA knows which mode it is talking
  to) and keeps `refresh_token_expires_in` (feeds the localStorage marker).
  GitHub rotates refresh tokens, so every successful refresh re-sets the
  cookie.
- `POST /refresh`: `refresh_token` may come from the body (009 clients,
  cookie-off deployments) or, in cookie mode, from the cookie. A GitHub
  "bad grant" error clears the cookie (`Max-Age=0`) so clients stop probing.
- `POST /logout` (new): clears the cookie, 204. Origin-gated like everything
  else.
- CORS: `access-control-allow-headers` unchanged;
  `access-control-allow-credentials: true` is always sent (with the exact
  reflected origin, never `*`) so same-site-but-cross-origin deployments
  (e.g. an `oauth.` subdomain) also work with `credentials: "include"`.

The worker stays **stateless**: the cookie IS the storage; nothing is
persisted server-side and the never-sees-content boundary is unchanged.

### App changes

- Worker calls send `credentials: "include"` (harmless when no cookie
  exists; requires the allow-credentials header above).
- `applyTokenResponse`: when the response says `refresh_token_cookie`, no
  refresh token is stored; instead the marker
  `rcv.oauth.cookieSession = <refresh horizon epoch ms>` goes to
  `localStorage` (non-secret; validated like every stored value).
- Boot restore: on mount, signed out + live marker → one silent `/refresh`
  (then the profile fetch for the chip). **Single-flight** like 009's
  callback exchange: StrictMode double-mounts the effect, and because GitHub
  rotates refresh tokens, a second concurrent refresh would burn the session
  it was trying to restore. Runs before the share-link decode so an auto-run
  sees the restored token. Failure = signed out for this boot, but only a
  **definitive** rejection (a 4xx — the grant is dead) also drops the marker;
  a maybe-transient failure (offline boot, a 5xx) keeps it so the next boot
  retries instead of stranding a still-good cookie.
- `getValidToken()`: an expired access token with no in-JS refresh token but
  a live marker refreshes through the cookie (empty `/refresh` body) instead
  of signing out. The same transient/definitive split applies: only a 4xx
  signs out (which fires `/logout`); a transient failure answers null for
  that one call and leaves the session to retry — signing out on a blip
  could burn a still-good cookie.
- `signOut()`: also clears the marker and fires `POST /logout` (best-effort)
  so the cookie dies with the session.

### Out of scope

- Encrypting the cookie value: it only ever travels browser ↔ worker over
  TLS and is `HttpOnly`; a stolen cookie is replayable against `/refresh`
  regardless of encryption, so a worker-side secret would add key management
  without a matching threat reduction.
- Per-host PATs stay session-only: they don't rotate and are often broadly
  scoped — 009's storage rules for them are unchanged.
- GitLab (tracked by 007/010).
