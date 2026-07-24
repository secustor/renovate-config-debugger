# 017 — Share links opened in a running app (hashchange)

Milestone: M5 · Status: done 2026-07-24

> Implemented as specified. The mount effect's decode→populate→run body
> (config text, filename, platform/endpoint, 008 layers, pending view, the
> version-drift notice, the run itself) is now one `loadShareToken` function
> called from both the mount effect (a link opened fresh) and a new
> `hashchange` listener (a link opened while the app is already running,
> which is a hash-only navigation — nothing reloads, so without a listener
> nothing happens at all). Whether a `hashchange` event should do anything is
> a pure predicate, `decideHashChangeAction(newHash, lastSelfWrittenToken,
contentDiffersFromLoaded)` in `share.ts`: it reads the new hash's token,
> ignores it if absent or equal to the last token the app itself wrote, and
> otherwise reports whether loading it would clobber unsaved edits. Clobber
> guard: when the editor's current text differs from `loadedContent` (016's
> baseline), `window.confirm("Load shared config? Your current edits will be
replaced.")` gates the load; declining restores the address bar to exactly
> what was showing before the navigation, read from the `hashchange` event's
> own `event.oldURL` (not reconstructed) so a stale token from three
> navigations ago can never leak back in. Self-mutations: every place the app
> writes the hash itself — Copy link, clearing an unreadable link, restoring
> the pre-sign-in fragment after an OAuth round-trip — now goes through one
> `writeHash(url, token)` helper that records the token in a ref before
> calling `history.replaceState`, so the listener recognizes and ignores its
> own writes (defense in depth: `replaceState` doesn't fire `hashchange` in
> any current browser, but the bookkeeping is cheap and future-proof).
> Verified by hand against a production build (`vite preview`, not `vite
dev`) with hand-generated tokens: a same-tab hash change with no pending
> edits loads and runs silently; with edits present it prompts, declining
> leaves the editor and address bar untouched, accepting loads and re-runs;
> dispatching a synthetic `hashchange` for the app's own just-written token
> triggers no prompt and no reload. `decideHashChangeAction` is exported as a
> pure, DOM-free function specifically so it's ready to unit-test, but the
> app package has no vitest setup and none was added here — pulling it into
> the engine package to test it there would be contrived (it depends on
> app-only share-link plumbing, not engine concerns) and adding a vitest
> config to the app package is disproportionate to a small bugfix. The
> regression test for this — including the exact "share link opened in a
> running app" scenario — lands with the e2e suite in 020.

## Summary

Bug found while preparing the persona study: the share-link decode effect
runs only on mount. Navigating from the already-open app to a share URL is a
hash-only navigation — nothing reloads, so **nothing happens**: no config
load, no run, no error. A user clicking a colleague's link while the app is
open silently keeps looking at their old state, which can misattribute
results to the wrong config.

## User story

As a user with the visualizer already open, I want clicking a share link to
load and run that shared analysis — or ask me first if I have unsaved work —
exactly like opening it in a fresh tab would.

## Scope

- Listen for `hashchange`; on a new `#config=` token, run the same
  decode-populate-run path as the mount effect.
- Guard against clobbering: if the current editor content differs from the
  last loaded/run state, confirm before overwriting ("Load shared config?
  Your current edits will be replaced.").
- Ignore the hash mutations the app itself makes (Copy link mirrors the
  token into the address bar — must not re-trigger a run).
- Covered by an e2e test (020) — this exact regression is its motivating
  case.

## Out of scope

- Encoding simulator inputs in share links (018).

## Dependencies

- 007 (share codec).
