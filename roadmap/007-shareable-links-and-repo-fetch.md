# 007 — Shareable links + fetch config from repo

Milestone: M4 · Status: done 2026-07-23

> Implemented as specified. Shareable links live entirely in the URL fragment
> (`#config=<token>`): the payload — config text, file name, non-default
> platform/endpoint, and view state (stage, selected preset's structural
> identity, migration step) — is JSON → UTF-8 → native `CompressionStream`
> `deflate-raw` → base64url, so no compression dependency and nothing hits
> server logs. Tokens and injected presets are never encoded. The Renovate
> version rides along for an honest version-drift notice on open. Opening a link
> decodes, populates state and auto-runs, then translates the stored node
> identity to the current run's node id (identities are stable across runs, ids
> are not — the translation reuses `computeTreeStats` via helpers exported from
> `PresetTree`). "Copy link" encodes on demand (never continuously syncing the
> hash) and `history.replaceState`s the URL to match. Load-from-repo probes
> Renovate's documented config-file locations in order via a new engine module
> `shims/repo-config.ts` (`fetchRepoConfig`), reusing the 010 raw-file
> transports/auth: first hit wins, a 404 falls through, an `ExternalHostError`
> (CORS/auth/rate-limit) aborts the whole probe, `package.json`'s `renovate` key
> is honored (object or `extends` string), and exhaustion throws a catchable
> `RepoConfigNotFoundError`. A known host (github.com/gitlab.com/gitea.com/
> codeberg.org) also sets the platform context so a later `local>` resolves;
> a bare `owner/repo` uses the current context. Migration-step lifting gives the
> top-level `MigrationSteps` optional controlled `index`/`onIndexChange` props
> (the preset-detail instance stays uncontrolled). Deviations: none material —
> the config-file-name list is hardcoded (upstream exports `getConfigFileNames()`
> not the raw array) with a pointer to `config/app-strings.js`.

## Summary

Make analyses shareable and inputs cheaper: encode the input config (and
simulator inputs) into the URL, and let users load a config directly from a
repository reference instead of pasting.

## User story

As a maintainer helping someone in the Renovate discussions, I paste their
config into the debugger and send back a link that opens the exact same
analysis. As a user, I type `github.com/org/repo` and the app finds and loads
its Renovate config file.

## Scope

- URL state: compressed config in the fragment (`#config=<base64(deflate)>`)
  so shared configs never hit any server logs; include app/Renovate version
  for honest replay warnings when versions drift.
- "Load from repo": given a repo slug/URL (GitHub first, GitLab later), probe
  Renovate's documented config file locations in order (`renovate.json`,
  `renovate.json5`, `.github/renovate.json`, `.renovaterc`, `package.json`
  `renovate` key, …) mirroring `lib/workers/repository/init/merge.ts`
  detection order, and show which file won.
- Optional PAT (localStorage only, never in URLs) shared with 002's preset
  fetching; clear rate-limit messaging.
- "Copy link" affordance on every view (preset tree node, migration step,
  simulator result) via view state in the URL.

## Out of scope

- Server-side persistence, shortlinks, any backend.

## Dependencies

- 001; integrates with 002/004/006 views as they exist.
