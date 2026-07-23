# 017 — Share links opened in a running app (hashchange)

Milestone: M5 · Status: planned

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
