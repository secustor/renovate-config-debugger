# 056 — Document how to give the GitHub App access to your repositories

Milestone: M14 · Status: captured 2026-08-04, section not yet written

## Summary

009 shipped "Sign in with GitHub" and 043 documented how a self-hoster
_provisions_ their own App. Nobody documented the step in between, the one
every user of the public deployment hits: **signing in is not the same as
granting access.** A GitHub App user token only reaches the intersection of
what the user can see and the repositories the App was **installed on**, so a
signed-in user pointing at a private preset repo still gets a 404 until the App
is installed there.

Today that knowledge exists in exactly two places, both too late or too small:
a one-line hint next to a failed fetch (`GithubAuthHint`, "Signed in, still
failing? The app may not be installed on this repository. → Manage repository
access") and a clause in the README privacy block. Neither tells an org member
that they may need an owner's approval, and neither is findable before the
failure.

This doc captures everything needed to write that section, so writing it is
transcription rather than research.

## The App (public deployment)

Verified 2026-08-04 against `secustor/renovate-config-debugger` Actions
variables and the live App page:

| Fact           | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| App name       | **Renovate Config Debugger**                                                |
| Owner          | [@secustor](https://github.com/secustor)                                    |
| Slug           | `renovate-config-debugger`                                                  |
| Public page    | <https://github.com/apps/renovate-config-debugger>                          |
| Install flow   | <https://github.com/apps/renovate-config-debugger/installations/new>        |
| Client id      | `Iv23liGkwiSqbmCvZK6P` (public by design; already in the shipped bundle)    |
| Permission     | Repository → **Contents: read-only**, nothing else                          |
| Token lifetime | 8 h user token + 6-month refresh token (expiring tokens on)                 |

The install URL is not a constant in the code. `installUrl()`
(`packages/app/src/platform/oauth.ts:114`) derives it from the configured
slug and falls back to `https://github.com/settings/installations` when a
deployment sets no `VITE_GITHUB_APP_SLUG` / `RCV_GITHUB_APP_SLUG` — so the
README section must name the upstream App explicitly rather than describe "the
link in the app", which differs per deployment.

## What the section has to say

1. **Sign in ≠ access.** Public repositories are readable by any signed-in
   user regardless of installation; private ones need the App installed on
   them. This is the whole reason the section exists — lead with it.
2. **Installing on your own account.** Open the App page, choose _Only select
   repositories_, pick the config/preset repos, install. The consent screen
   reads "read the contents of the repositories you select" because Contents:
   read-only is the only permission requested.
3. **Installing on an organization.** Same flow, pick the org instead. A
   member without installation rights gets an _Install and request_ / _Request_
   button, and GitHub mails the owner; the owner can trim the repository
   selection before approving.
4. **Adding a repository later.** Installation is editable — Settings →
   Applications → Installed GitHub Apps → Renovate Config Debugger →
   _Repository access_. This is where the in-app "Manage repository access"
   link lands.
5. **Revoking.** Two different actions worth separating: revoking the
   _authorization_ (Settings → Applications → Authorized GitHub Apps, personal,
   drops the token's account grant) vs _uninstalling_ (removes the App's access
   to the account's repositories entirely; the only lever an org owner has over
   a member's grant).
6. **When the App is not an option.** GitHub Enterprise Server (the App lives
   on github.com only), orgs that will not approve third-party App
   installations, and Worker outages — all fall back to a fine-grained personal
   access token under _Platform context & per-host tokens_ in advanced
   settings. Say this in the same section; it is the honest escape hatch, and
   burying it is what makes people paste a classic PAT instead.

## Links to use

Action links (deep links a reader can click):

- Install / manage the App:
  <https://github.com/apps/renovate-config-debugger/installations/new>
- Your installed Apps: <https://github.com/settings/installations>
- Your authorized Apps (revoke): <https://github.com/settings/applications>

GitHub documentation (all four verified 2026-08-04):

- [Installing a GitHub App from a third party](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party)
  — the account/repository selection steps, and the _Install and request_ path
  for members without rights.
- [Requesting a GitHub App from your organization owner](https://docs.github.com/en/apps/using-github-apps/requesting-a-github-app-from-your-organization-owner)
  — what the owner receives, and that owners can be pointed straight at
  `https://github.com/apps/APP-NAME/installations/new`.
- [Reviewing GitHub Apps installed in your organization](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/reviewing-github-apps-installed-in-your-organization)
  — the owner-side view: permissions, repository access, suspend/delete.
- [Reviewing and revoking authorization of GitHub Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-revoking-authorization-of-github-apps)
  — revoke vs uninstall, and that owners cannot revoke a member's
  authorization.

Repo-internal links the section should cross-reference:

- [`packages/oauth-worker/README.md`](../packages/oauth-worker/README.md#provisioning)
  — for self-hosters, whose users install a **different** App.
- [009](009-github-oauth-sign-in.md) — why a GitHub App and not an OAuth App
  (the `repo` scope is read/write to everything; per-repo read-only is the
  trust story).

## Where it goes

The README's GitHub material is spread over three `<details>` blocks
(self-hosting sign-in, privacy/tokens, preset hosting). Access-granting belongs
with the user-facing half, not the self-hosting half:

- **Recommended:** a new `<details>` block in the README, "Giving the App access
  to your private repositories", directly after "Privacy, tokens & GitHub
  sign-in" — the block that already introduces the App and its single
  permission. Keeping it collapsed matches the README's existing shape; the
  summary line is what a scanner sees.
- Self-hosted deployments get one sentence pointing at
  `packages/oauth-worker/README.md`: their users install the operator's App,
  and the links above are examples, not addresses.
- The privacy block's existing bullet ("Private presets and private repo
  configs need auth…") then shrinks to a pointer, so the fact lives in one
  place.

## Out of scope

- Changing `GithubAuthHint`'s copy or adding a link from the app to the new
  section. The hint is correct and lands on the right page; a docs link from a
  failed fetch is a separate (worthwhile) ticket.
- Documenting GitLab/Gitea/Forgejo auth — those are PAT-only today (010).
- Anything about the App's own provisioning, which
  `packages/oauth-worker/README.md` already covers.
