# Giving the GitHub App access to your repositories

Signing in and granting access are two separate steps. A GitHub App user token
only reaches the intersection of what you can see and the repositories the App
was installed on. Public repositories are readable by any signed-in user, but a
private config or preset repo keeps coming back as "not found" until the App is
installed on it.

The public deployment at <https://renovate.secustor.dev/> uses [Renovate Config
Debugger](https://github.com/apps/renovate-config-debugger), owned by
[@secustor](https://github.com/secustor). Its only permission is Repository,
Contents: read-only, which is why the consent screen truthfully reads "read the
contents of the repositories you select". Self-hosted deployments install the
operator's own App instead, so the links below are examples rather than
addresses (see
[`packages/oauth-worker/README.md`](../packages/oauth-worker/README.md#provisioning)).

## Why the two steps are separate

You decide what the debugger can read, repository by repository.

Signing in only establishes who you are. The installation is what says which
repositories the App may read, and you choose them from a list. Nothing you own
becomes readable as a side effect of signing in, and you can change the
selection later, or remove it entirely, without signing out.

The alternative is worse, which is why the app is a GitHub App and not a classic
OAuth App. An OAuth App's only route to private repository content is the `repo`
scope: read **and write** access to every repository you can touch, all or
nothing, with no per-repository choice. Here the grant is read-only and scoped
to the repositories you name. The price of that control is the extra step, and in an
organization, possibly an owner's approval.

## Install it on your own repositories

1. Open the [installation
   page](https://github.com/apps/renovate-config-debugger/installations/new).
2. Pick your personal account.
3. Choose **Only select repositories** and pick the repos holding your Renovate
   config or your shared presets. **All repositories** also works, and still
   grants nothing beyond Contents: read-only.
4. Install.

## Install it on an organization

The same flow, except you pick the organization in step 2. What the final button
says depends on your role. An owner gets **Install** and is done. A member or
outside collaborator gets **Install and request**, which mails the
organization's owners; they can trim your repository selection before approving.
GitHub documents that path under [requesting a GitHub App from your organization
owner](https://docs.github.com/en/apps/using-github-apps/requesting-a-github-app-from-your-organization-owner).

An owner handling such a request can inspect the permissions and repository
access first: [reviewing GitHub Apps installed in your
organization](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/reviewing-github-apps-installed-in-your-organization).

The full step-by-step from GitHub: [installing a GitHub App from a third
party](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party).

## Add a repository later

The repository selection stays editable. Go to Settings, then Applications, then
[Installed GitHub Apps](https://github.com/settings/installations), pick
Renovate Config Debugger and edit **Repository access**. This is also where the
app's own "Manage repository access" link lands, the one shown next to a fetch
that fails while you are signed in.

## Take the access away

Revoking and uninstalling are different, and the difference matters if you
administer an organization.

Revoking the authorization is personal: under Settings, Applications,
[Authorized GitHub Apps](https://github.com/settings/applications), _Revoke_
drops the App's grant on your account. Uninstalling happens from the
installation page above and removes the App's access to that account's
repositories outright. Organization owners cannot revoke a member's
authorization, so uninstalling is the lever they have. GitHub covers both under
[reviewing and revoking authorization of GitHub
Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-revoking-authorization-of-github-apps).

Access tokens are short-lived either way: they last 8 hours and live in
`sessionStorage` and memory only, so closing the tab clears the copy in your
browser. On this deployment the 6-month refresh token is an `HttpOnly` cookie
scoped to the token-exchange proxy, so the session resumes on your next visit
until you use **Sign out** — or revoke or uninstall as above. The full storage
table is in [Auth-Flow.md](Auth-Flow.md).

## When the App isn't an option

Use a personal access token under _Advanced — hosts & credentials_ instead.
That remains the fallback for GitHub Enterprise Server, where the App does not
exist because it lives on github.com only. It is also the answer for
organizations that will not approve third-party App installations, for
deployments with sign-in turned off, and for an outage of the token-exchange
proxy.

The token is kept in `sessionStorage`, and it never enters a URL or a share
link.
