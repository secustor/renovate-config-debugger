# 003 — Inline option documentation

Milestone: M1 · Status: done 2026-07-23

> Implemented with the editor from 001 (CodeMirror, not Monaco): editor hovers
> come from `codemirror-json-schema` + Renovate's own JSON schema; read-only
> JSON views render keys through a shared hover-card component fed by
> `getOptionIndex()` (engine); diff views get the same cards via caret
> hit-testing on `"key":` tokens. Unknown keys are only flagged inside
> config-shaped objects (root + containers derived from the options'
> `parents` metadata), so free-form objects like `constraints` stay clean.

## Summary

Every option key shown anywhere in the app (input editor, diffs, preset tree,
effective config) is hoverable/clickable and explains itself, using Renovate's
own option metadata from `lib/config/options/index.ts`.

## User story

As a user reading an unfamiliar option (`rangeStrategy`, `postUpdateOptions`,
…) anywhere in the visualizer, I hover it and immediately see what it does,
its type and default, and a deep link to docs.renovatebot.com — without
leaving the page.

## Scope

- Build an option index from the imported metadata at load time: description,
  type, default, allowed values, `supportedManagers`, `supportedPlatforms`,
  experimental/deprecation flags, parent restrictions (`parents`).
- Hover cards on option keys in all config renderings (Monaco hover provider
  for the editor; wrapper component for read-only views).
- Deep links to `https://docs.renovatebot.com/configuration-options/#<option>`.
- Flag deprecated/experimental options visually wherever they appear.
- Unknown keys get a distinct "not a Renovate option" style — this alone
  catches a large class of config typos.

## Out of scope

- Explaining _values_ (e.g. what a given `matchPackageNames` pattern matches)
  — that's 006 territory.

## Dependencies

- 1. Independent of 002; can be built in parallel.
