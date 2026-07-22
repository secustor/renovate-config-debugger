# 007 — Shareable links + fetch config from repo

Milestone: M3 · Status: planned

## Summary

Make analyses shareable and inputs cheaper: encode the input config (and
simulator inputs) into the URL, and let users load a config directly from a
repository reference instead of pasting.

## User story

As a maintainer helping someone in the Renovate discussions, I paste their
config into the visualizer and send back a link that opens the exact same
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
