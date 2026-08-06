# 066 — Header session menu: the account belongs in the corner

Milestone: M14 · Status: done

Mockups: [`mockups/066/header-account-menu.html`](mockups/066/header-account-menu.html)
(three variants, interactive — this doc implements variant C).

## Problem

The GitHub session (009) lived in the **config toolbar**: a chip in the action
row under the editor card, between the file-name select and the Run button.
Nobody looks there. Every user arrives expecting the account control top-right,
and the app's own copy already assumed it was there —
`AdvancedZone.tsx` told the reader that signing in is "at the top of the page"
while it wasn't.

Worse, one concept was scattered across three affordances in two places:

- **Sign out** — a bare button inside the identity chip
- **revoke** — a lowercase underlined link beside it, whose difference from
  sign-out lived only in a `title` attribute nobody hovers
- **Manage repository access** — not in the chip at all; only reachable from
  `GithubAuthHint`, i.e. only after something had already failed

And the signed-out state was a full labelled `Sign in with GitHub` button
parked two controls away from the primary action it competed with.

## Decision

**One trigger in the header's top-right corner, holding everything about the
session — and the trigger's icon carries the state.**

| State                       | Icon   | Accessible name        | Panel contents                                                          |
| --------------------------- | ------ | ---------------------- | ----------------------------------------------------------------------- |
| Signed in                   | avatar | `Account: <login>`     | Identity · Manage repository access · Revoke · Sign out · Theme · Links |
| Signed out, OAuth available | gear   | `Settings and sign-in` | Sign in with GitHub · Theme · Links                                     |
| OAuth unconfigured (043)    | gear   | `Settings`             | Theme · Links                                                           |
| Restoring (065)             | gear   | `Settings`             | as signed-out, until the silent refresh lands                           |

The gear is the load-bearing part of the decision, not a detail. Collapsing the
corner into an account control only works if the control still means something
in the two states that have no account: a self-hosted deployment with no OAuth
(043) would otherwise get a nameless button holding the theme switch, which is
worse than what it replaced. A gear says "settings live here" in every
deployment, and the account rows are simply present or absent inside it.

Two consequences fall out of the icon swap that motivated collapsing the whole
corner rather than only the account:

- **The header's width is constant.** Both glyphs and the real avatar render
  into the same 26px circle, so nothing reflows when a session restores or
  ends. The wrap-point problem 055 spent a document reasoning about stops
  existing rather than getting worse — the row is now a badge and one button.
- **065 needs no "restoring" state.** The gear _is_ the resting state, so a
  silent cookie refresh swaps gear → avatar in place. An avatar-only design
  would have had to render a skeleton to avoid flashing "Sign in" and then
  swapping a beat later.

The version badge stays visible in the row: it is a fact, not an action, and a
fact behind a click is not readable.

## Costs, accepted

- **The theme switch (037) goes from one click to two.** It is a decision a
  user makes about once per machine, and it was spending permanent header width
  to save a click nobody makes twice. The `.seg` control keeps its shape inside
  the panel — one click once open, not a submenu — and deliberately does _not_
  dismiss the menu, because the point of a theme control is comparing the
  result of the choice.
- **Signed-out sign-in is no longer a permanently visible button.** The header
  was never the real discovery path: `GithubAuthHint` and `AuthFailureBanner`
  already put a labelled "Sign in with GitHub" in front of the user _at the
  moment it matters_ — when a private preset 404s or the rate limit bites — and
  009 called those error paths "the core UX of the feature". A permanent header
  button is convenience for a user who already knows they need it, and that
  user will find a gear.

## Scope

- `components/SessionMenu.tsx` — the trigger and the panel, decomposed into
  `Identity`, `AccountGroup` and `SessionMenuPanel` for the depth ratchet (048).
- `components/SessionMenuItem.tsx` — one row, an anchor when it has an `href`
  and a button otherwise. Carries the optional caption that finally states, in
  the open, what sign-out does that revoke does not.
- `components/SessionAvatar.tsx` — avatar / person / gear in one circle, with
  an `onError` fallback: a 404'd profile image used to break a small chip
  mid-page and would now break the header's primary control.
- `hooks/use-session-menu.ts` — the disclosure contract. Escape and any chosen
  item close **and return focus to the trigger** (023/039's rule, from
  `use-repo-load.ts`); an outside pointer press and focus leaving by Tab close
  without the refocus, because the user has already said where they are going.
- `ProjectLinks` (055) becomes labelled menu rows. Its icon-only rule was a
  concession to the crowded header row, and that row is gone.
- `AppHeaderTools` grows to 7 props; `ConfigToolbar` loses 5 and the chip;
  `ConfigColumn` loses 4 and keeps `onSignIn` for the auth hint.

### Not in scope

- The error-path surfacing (`GithubAuthHint`, `AuthFailureBanner`) does not
  move. A hint belongs beside the failure it explains; promoting "Manage
  repository access" into the menu makes it permanently reachable without
  taking it out of the contextual place it is also needed.
- Anything in `platform/oauth.ts`. The token lifecycle, the 065 cookie restore
  and `signOut()` are untouched — 066 is presentation only.
- ARIA `role="menu"`. The panel mixes actions with the theme _radiogroup_, and
  calling that a menu would be a lie; it is a disclosure (`aria-expanded` +
  `aria-controls`), which is also the pattern the repo-load form already uses.

## Tests

- `e2e/18-session-menu.spec.ts` — the disclosure contract: the corner is one
  control, the panel holds the theme switch and both project links, Escape
  closes and returns focus, an outside click closes. Deliberately asserts
  nothing about the account rows: whether they render depends on whether the
  build had OAuth configured, so those assertions would test the environment.
- `e2e/13-unified-chrome-and-theme.spec.ts` — the 037 theme assertions, now
  opening the menu first (`openSessionMenu` in `helpers.ts`), plus a new one
  that choosing a theme does not dismiss it.
