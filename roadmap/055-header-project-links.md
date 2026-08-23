# 055 — Header links to the source and the issue tracker

Milestone: M14 · Status: done

## Summary

The app never says where it comes from or where a bug report goes. The README
does, but nobody reading a shared link has seen the README — a share link
(007) drops a stranger straight into the tool, and from there the project is
unfindable. Two icon-only links in the header corner fix that: the GitHub mark
to the repository, `issue-opened` to the issue tracker.

## User story

As someone who hit a wrong-looking trace, I want the app itself to tell me
where to report it, so that the bug reaches the project instead of dying in a
browser tab.

## Scope

- Two anchors in the header's session corner (037), left of the theme switch
  and the version badge: source, and issues.
- Both are `.btn quiet` — no new button dialect (039), only the two
  declarations an anchor needs that a button does not.
- Both open in a new tab with `rel="noreferrer"`, matching every other
  outbound link in the app.

## Decisions

- **Icon-only.** The corner already carries a three-segment control and a
  badge, and at the header's wrap point a pair of labelled links would push
  the version badge onto its own line. The accessible name lives on the
  anchor (`aria-label` + `title`), so the links are named for a screen reader
  and on hover, just not in pixels.
- **Hard-coded to the upstream repository**, not runtime config (`RCD_*`). A
  self-hoster deploying the Docker image (043) still wants a bug report to
  land upstream — a fork's issue tracker is where such a report would be
  ignored. Revisit if a fork ever asks.
- **`/issues`, not `/issues/new`.** The repository has no issue templates, so
  `new` opens a blank box; the list lets a reporter find the existing thread
  first, and the "New issue" button is one click away.
- The logo is left alone. It is the app's identity, not a link — 016 made the
  header the place that answers "what am I looking at?", and turning the
  identity into navigation would make an accidental click leave the page with
  unsaved config in the editor.

## Verification

`13-unified-chrome-and-theme.spec.ts` locates both links **by accessible
name** — for an icon-only control that name is the whole affordance — and
asserts href, `target`, `rel` and a rendered icon.
