# 027 — Share-link failure diagnostics

Milestone: M7 · Status: planned

## Summary

User-reported (2026-07-24): a share link opened against a running dev
server "does not fill the configuration and doesn't run the pipeline."
Investigated same day: the reported token is genuinely corrupted — it
inflates cleanly up to the `view` field and then decodes to garbage
(deflate-raw carries no checksum, so corruption/truncation can slip through
inflation and only fail at `JSON.parse`). The current build's encoder and
decoder round-trip the identical config correctly (verified in-browser,
twice, plus the 020 e2e), so the app was right to reject the token — but
its only signal is a small dismissable notice below the advanced-options
row ("This shared link could not be read; showing the default config
instead."), which in practice reads as _nothing happened_.

## User story

As someone opening a colleague's share link that got mangled in transit, I
want the app to tell me loudly that the link is broken — and ideally
whether it looks truncated — so I ask for a fresh link instead of
concluding the tool is broken.

## Scope

- Make the unreadable-link state prominent: banner at the top of the page
  (not a dismissable footnote), stating what happened and what to do
  ("ask the sender to copy the link again; make sure the whole URL was
  copied").
- Distinguish failure modes where possible: token present but inflate
  fails vs inflates but JSON-invalid (the truncation/corruption signature)
  vs decodes but wrong shape — with tailored wording ("this link appears
  cut off").
- Add an integrity field to the payload (additive to v2, e.g. a config
  length or short checksum) so truncation is detectable _reliably_ rather
  than heuristically; old links without the field keep today's behavior.
- e2e case (020 suite): corrupted and truncated tokens surface the banner
  and never leave the app silently on the default config.

## Out of scope

- Recovering partial configs from corrupt tokens (the readable prefix is
  not trustworthy input).

## Dependencies

- 007 (share codec), 017 (load paths), 020 (e2e suite).
