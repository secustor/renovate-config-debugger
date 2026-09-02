# Security Policy

## Reporting a vulnerability

Please report security issues via
[GitHub private vulnerability reporting](https://github.com/secustor/renovate-config-debugger/security/advisories/new)
rather than a public issue — the advisory form is the only reporting channel.

This is a spare-time, single-maintainer project: there's no formal SLA, but
expect an acknowledgement within a few days. Coordinated disclosure (giving a
fix time to land before details go public) is appreciated.

## Supported versions

Only the latest release / `main` is supported. There's no long-term
maintenance branch — the Docker `latest` tags and the hosted site
(https://renovate.secustor.dev) roll forward continuously, and fixes land
there rather than being backported.

## Scope

- Configs never leave the browser except for the preset fetches they
  themselves declare; those go browser → host API directly, with nothing
  proxying configs or presets.
- Access tokens (OAuth or personal access token) live in
  `sessionStorage`/memory and are cleared when the tab closes. Where a
  deployment enables the worker's `REFRESH_COOKIE` — as the public one does —
  the refresh token lives in an `HttpOnly` cookie scoped to the worker mount,
  so the session survives a closed tab; `localStorage` still holds no secret.
  The full table is in [docs/Auth-Flow.md](docs/Auth-Flow.md).
- Share links carry state in the URL fragment only, never a token.
- `packages/oauth-worker` does nothing but the OAuth `code → token` /
  `refresh_token → token` exchange and the `POST /logout` that drops the
  refresh cookie; it never sees a config, a preset, or an API request.

Reports about any of the above guarantees not holding, or about the
`oauth-worker` itself, are especially welcome.
