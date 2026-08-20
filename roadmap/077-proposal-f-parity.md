# 077 — Proposal F parity: Share moves to the header

Milestone: M20 · Status: done (feat/v2)

## Summary

A review pass against the design project's `Proposal F - Integrated Shell.dc.html`
— the mock 075's shell was built from — item by item: header, editor column,
results column. Most of the mock was already shipped (075/076); this pass closes
the gaps that were genuinely missing rather than deliberately different, and
records the deliberate differences in one place so the next comparison doesn't
re-litigate them.

## What changed

- **Share is the header's, with a receipt.** "Copy link" was a toolbar button
  among the document actions (Format, Revert, Run), but the link it copies is
  not a fact about the document: it carries the whole session — config, 008
  layers, pinned tests, the view. It is now a Share button in the header's
  session corner (`ShareButton`), and the copy gets a receipt the flipping
  label alone couldn't give: a transient popover with the copied URL and the
  one promise that matters — "Includes your config, pipeline layers, and
  pinned tests. Tokens are never included." (true by construction; share.ts
  never encodes a token). Landing has no Share: there is no view worth a link
  before the first run, the same gate Copy link had. On a narrow viewport the
  label hides (the Run kbd's rule) so the header cannot wrap to a second line
  and push the stacked results below the fold — the name stays via
  `aria-label`.
- **The document got its own copy.** The mock's toolbar has a copy button
  beside the file name; the app had no way to copy the config at all (only the
  link). `CopyButton` grew an `iconOnly` mode for it — the name it copies is
  printed right next to it.
- **Pins say they travel.** The pins view ends with "Pins are saved with the
  share link — Share in the header copies it.", with "Share" live (the same
  build-and-copy) and an inline "Copied ✓" receipt, because the header's
  popover is a screen away from this click.
- **The signed-in github.com row shows who.** The drawer's credentials row now
  carries the session avatar beside "signed in ✓" — the same face as the
  header trigger, cosmetic and allowed to be absent (the profile fetch may
  fail).
- **One copy alignment.** A stage card with nothing to diff says "This stage
  changed nothing in this run." (the mock's run-scoped phrasing) instead of
  "made no changes to the config".
- **Dev no longer reloads itself mid-click.** The first field report on this
  feature was "the Share button is not working", and the button was fine — on
  a cold `.vite` cache, `vite dev`'s optimizer discovered `zod/mini` (the
  share codec's chunk) at click time, and "optimized dependencies changed.
  reloading" threw the page, the run and the click away. The same failure hit
  the first run (the engine chunk's deps). `optimizeDeps.include` in the
  app's vite.config.ts now pre-bundles the steady-state discovery list (read
  from `.vite/deps/_metadata.json`), with the engine's own deps chained
  through the linked workspace package, and `path` — the shim alias onto
  `pathe`, which can't be pre-optimized — excluded so it is served as plain
  ESM. Verified: cold-cache dev session, first run and first Share click,
  zero optimizer events. Production builds never had the problem.

## Deliberate differences kept (the design should adopt these, not the app)

Each of these was compared against the mock and kept, for reasons already
argued in code or an earlier roadmap doc:

- **Migrate's delta is `Δ N`, not `+1 −1`** — the trace records a rewrite, not
  an added/removed pair (`stage-delta.ts`).
- **Tab count pills are neutral** — the pill grammar tones a pill only when it
  reports SOMETHING (errors, warnings); a bare count is `.pill-count`. The
  mock's accent-blue nonzero counts would make every number look like a claim.
- **The header digest is muted, not accent** — a status line is read past, not
  read (index.css, 075 iteration 3).
- **The drawer's collapsed line says the context** (`github · api.github.com` +
  `default`/`N credentials`), not the mock's "github.com anonymous" — the
  endpoint is half of what makes the defaults the defaults (076).
- **Add-host quick-fills are the platform hosts** (github/gitlab/gitea/
  codeberg), not the mock's registry hosts — the browser engine fetches
  presets only, so a `registry.npmjs.org` token would authenticate nothing.
- **"+ Pin a dependency…" (the ghost row), not an always-open "Add a test"
  form** — 075 iteration 6's no-seeded-pins rule.
- **Pin cards say `✓ N matched` / `✗ N of your own rules didn’t match`** in
  plain text where the mock uses toned pills and framing copy; the chips
  already carry the outcome.
- **Stage-card hints for skipped layers** live in the diff body (with the
  editor right above), not appended to the card header.
- **The session menu keeps "Source on GitHub" + "Report an issue"** as two
  rows where the mock has one "Project on GitHub"; the theme switch stays
  Auto-first (the default leads) with icons.
- **Everything the mock doesn't know about stays**: the landing, the banners
  (stale, hypothetical, auth-failure, share-error, untrusted endpoint), the
  Tests tab's full simulator view, Format/Revert, the filename select
  (json/json5), the headless note, the header's error-state verdict pill, and
  the rail's `error` glyph.
