# Giving the GitHub App access to your repositories

Signing in is not the same as granting access. A GitHub App user token only
reaches the intersection of what **you** can see and the repositories the App
was **installed on**. Public repositories are readable by any signed-in user
regardless of installation; a private config or preset repo keeps returning
"not found" until the App is installed on it.

The public deployment at <https://renovate.secustor.dev/> uses **[Renovate
Config Debugger](https://github.com/apps/renovate-config-debugger)**, owned by
[@secustor](https://github.com/secustor). Its only permission is Repository →
**Contents: read-only**, which is why the consent screen truthfully reads "read
the contents of the repositories you select". Self-hosted deployments install
the operator's own App instead — the links below are then examples, not
addresses (see
[`packages/oauth-worker/README.md`](../packages/oauth-worker/README.md#provisioning)).

## Install it on your own repositories

1. Open the [installation
   page](https://github.com/apps/renovate-config-debugger/installations/new).
2. Pick your personal account.
3. Choose **Only select repositories** and select the repos holding your
   Renovate config or shared presets. **All repositories** works too, and still
   grants nothing but Contents: read-only.
4. Install.

## Install it on an organization

Same flow, but pick the organization in step 2. What the last button says
depends on your role:

- **Owner** — _Install_, and you are done.
- **Member or outside collaborator** — _Install and request_ / _Request_.
  GitHub emails the organization's owners, who can trim your repository
  selection before approving. See [requesting a GitHub App from your
  organization
  owner](https://docs.github.com/en/apps/using-github-apps/requesting-a-github-app-from-your-organization-owner).

Owners reviewing such a request can inspect the permissions and repository
access first: [reviewing GitHub Apps installed in your
organization](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/reviewing-github-apps-installed-in-your-organization).

Full step-by-step from GitHub: [installing a GitHub App from a third
party](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party).

## Add a repository later

The repository selection is editable at any time, and the app's "Manage
repository access" link (shown next to a fetch that fails while you are signed
in) lands there:

Settings → Applications → [Installed GitHub
Apps](https://github.com/settings/installations) → Renovate Config Debugger →
**Repository access**.

## Take the access away

Two different actions, often confused:

- **Revoke the authorization** — Settings → Applications → [Authorized GitHub
  Apps](https://github.com/settings/applications) → _Revoke_. Personal, and it
  drops the App's grant on your account.
- **Uninstall** — from the installation page above. Removes the App's access to
  that account's repositories entirely. Organization owners cannot revoke a
  member's authorization; uninstalling is their lever.

Details: [reviewing and revoking authorization of GitHub
Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-revoking-authorization-of-github-apps).

Tokens are short-lived either way: 8 hours, with a 6-month refresh token, and
they live in `sessionStorage`/memory only, so closing the tab already clears the
copy in your browser.

## When the App isn't an option

Use a personal access token under _Platform context & per-host tokens_ in
advanced settings instead. It stays the honest fallback for:

- **GitHub Enterprise Server** — the App exists on github.com only.
- **Organizations that will not approve third-party App installations.**
- **A deployment with sign-in turned off**, or an outage of its token-exchange
  proxy.

The token is kept in `sessionStorage` and never enters a URL or a share link.
