# 067 — semantic-release: one version for every public package

Milestone: M16 · Status: done (2026-08-10)

## Summary

059 left the release as a manual ritual: bump `packages/cli/package.json` by
hand, add a compat row by hand, push a `cli-v<version>` tag, write a GitHub
release, and hope the three agree — the publish workflow checked only that the
tag matched the version. This item hands the arithmetic to semantic-release.
A `workflow_dispatch` run reads the conventional commits since the last `v*`
tag, decides the version, stamps it into **every package that is not
`private`**, publishes them to npm, and writes the GitHub release with the
generated notes.

The decision to release stays a decision. Which version, and what the notes
say, stops being one.

## User story

As the maintainer, I want to press one button and get a correct release — the
same version across the public packages, a changelog I did not write, a GitHub
release, and npm tarballs — so that shipping is not an eight-step checklist
where step four is the one that goes wrong.

## Scope

- `release.config.mjs` at the root, `.github/workflows/release.yml` on
  `workflow_dispatch` only (dry run by default).
- `tools/release/` — the version stamp, the publish loop and the preflight
  guards, all driven off `pnpm list` rather than a hardcoded package list.
- `packages/cli/scripts/stamp-compat.ts` — 059's compat row, written by the
  release instead of by hand, sharing one parser with `check-compat.ts`.
- `publish-cli.yml` retired; its gates moved into `release.yml`.
- npm trusted publishing (OIDC) instead of a publish token — the repository
  holds no npm credential at all.

## Decisions

- **One version for all public packages, not independent versioning.** The
  packages are cut from the same tree and embed the same Renovate; "which CLI
  matches which engine" should be answered by the numbers being equal, not by
  a matrix. The cost is publishing a package that did not change in a given
  release. At 0.x, against a repository this size, that is much cheaper than
  the alternative — and it is why the tag is `v<version>`, not 059's
  per-package `cli-v<version>`: there is one release, and it covers whatever
  is currently public.
- **"Public" is `private: false`, discovered at release time.** Today that is
  `packages/cli` alone. When 056 unprivates the engine it joins the release
  with no edit to any of this. A list maintained in the release tooling would
  be a second source of truth for something a manifest already states.
- **Breaking changes bump the MINOR.** 059 committed to a `0.x` scheme with
  breaking changes in the minor; semantic-release's default would take the
  first `feat!:` straight to `1.0.0` and imply a stability promise the CLI
  explicitly does not make. One `releaseRules` entry in `release.config.mjs`
  says so, and carries the note to delete it at 1.0.
- **A Renovate bump is a release, enforced in `renovate.json`.** 059 required
  it; nothing made it happen. `renovate` sits in `packages/engine`'s
  `dependencies` with `semanticCommitType: "fix"` pinned on its packageRule, so
  the bump PR lands as `fix(deps): …` and the next release picks it up as a
  patch. Every other dependency here is bundled at build time from a
  `devDependency` and lands as `chore(deps): …`, which releases nothing —
  lockfile maintenance should not cut a version.
- **The compat row is stamped, and still checked.** `stamp-compat.ts` writes
  the row from the same three facts `check-compat.ts` reads, during `prepare`
  and before `build`. The check is not redundant: the release stamps one row,
  the check catches every _other_ way the table can stop being true — a
  Renovate bump on main, a manual edit, a botched merge. Both now share
  `compat-table.ts` rather than parsing the README twice.
- **The release commit goes back to main.** The compat table is release
  history and has to accumulate; if the stamped row never returned, the next
  release would prepend onto a stale table and drop the previous row.
  `@semantic-release/git` commits `CHANGELOG.md`, the manifests and the CLI
  README as `chore(release): v<version> [skip ci]`.
- **`pnpm publish`, not `@semantic-release/npm`.** pnpm is the only publisher
  of the three that rewrites `workspace:*` to a real range while packing. The
  CLI inlines its workspace deps and has none left in the tarball, but the next
  public package need not, and a literal `workspace:*` in a published manifest
  is a broken install nobody notices until someone runs it. pnpm also speaks
  npm's OIDC exchange natively, which the next decision depends on.
- **No npm token exists, anywhere.** Publishing is authenticated with
  [npm trusted publishing](https://docs.npmjs.com/trusted-publishers): the
  registry is told once, on npmjs.com, which repository and which workflow file
  may publish a given package, and the job authenticates with an OIDC token
  GitHub mints for that single run. Nothing long-lived is stored, so there is
  no secret to leak, rotate, or scope-creep — the workflow's
  `permissions: id-token: write` line **is** the credential. Provenance comes
  free: trusted publishing attests it without `--provenance`, and this
  repository is public, which provenance requires.

  Two properties of that record are worth stating because neither is obvious:
  it names the workflow **file**, so renaming `release.yml` breaks publishing;
  and it is **per package**, so each new public package needs its own.

- **The bootstrap publish is manual, and that is npm's constraint, not ours.**
  A trusted publisher can only be configured for a package that already exists
  ([npm/cli#8544](https://github.com/npm/cli/issues/8544)), so the very first
  version of each package is published by hand from a maintainer's terminal
  under 2FA. Doing it that way rather than with a one-time CI token means a
  publish token never enters the repository's secrets at all — which is the
  whole point of the exercise.
- **Dry run is the default.** A published version is permanent; the obvious
  button press should be the safe one. Untick `dry-run` to actually release.

## As built (2026-08-10)

- `release.config.mjs` chains four things through `@semantic-release/exec`,
  and the order is the whole reason it is a chain: `prepare.ts` writes the
  version into the manifests, `stamp-compat.ts` writes the row _from_ that
  version, and only then does `build` run — because `check-compat.ts` runs
  inside the build and compares the two.
- `tools/release/verify.ts` fails the run before anything is computed when
  there is no `v*` tag (semantic-release would otherwise silently call the
  first release `1.0.0`) or when the job cannot mint an OIDC token on a
  non-dry run (which would otherwise die at the last step with the tree
  half-stamped). Both errors say what to do about it. It also warns, without
  failing, if an npm token is in the environment at all. pnpm prefers the OIDC
  token when the exchange works, but logs `Skipped OIDC: …` and falls back to
  any credentials it can find when it does not — so with no token present a
  broken trusted-publisher record fails the release loudly, and with one
  present it would publish quietly under the token and nobody would find out.
  What it cannot check is the record on npmjs.com — only the registry knows
  whether it lists this repository and this workflow, and it answers at publish
  time with a 404.
- `compat-table.ts` re-renders the whole table with the columns padded to
  their widest cell, so a two-digit minor produces a one-row diff instead of
  re-aligning every historical row.
- `release.yml` runs 059's gates — lint, format, typecheck, CLI tests, the
  build, the bundle-parity suite and a bin smoke test — on the exact tree
  being released, before semantic-release starts. Only the version string
  differs between that build and the one the release makes.

## Before the first run

Things this item cannot do for the repository. The first three are a one-time
bootstrap, in order, and they are ordered because npm will not let you do them
any other way — a trusted publisher cannot be configured for a package that
does not exist.

1. **Create the `@renovate-config-debugger` npm organization** (059's
   outstanding item — whichever of 056/059 lands first creates it).

2. **Publish `0.1.0` by hand, once**, from a maintainer's terminal, under 2FA.
   This is the only publish in the project's life that is not done by CI:

   ```bash
   pnpm login                                   # 2FA, interactive
   node tools/release/prepare.ts 0.1.0          # stamps versions + the LICENSE
   node packages/cli/scripts/stamp-compat.ts
   pnpm --filter @renovate-config-debugger/cli build
   pnpm --filter @renovate-config-debugger/cli publish --access public
   ```

   Deliberately not a one-time CI token: doing it locally means a publish token
   never enters the repository's secrets at all.

3. **Configure the trusted publisher**, now that the package exists — on
   `npmjs.com/package/@renovate-config-debugger/cli/access`, enable trusted
   publishing with GitHub Actions and enter, exactly and case-sensitively:

   | field         | value                      |
   | ------------- | -------------------------- |
   | organization  | `secustor`                 |
   | repository    | `renovate-config-debugger` |
   | workflow file | `release.yml`              |

   Records created after 2026-05-20 must also name at least one allowed action;
   `npm publish` is the one this workflow performs. After this, delete nothing
   and add no secret — the workflow needs no npm credential.

   Repeat steps 2 and 3 per package: the record is per package, and so is the
   bootstrap.

4. **A baseline tag.** With no `v*` tag, semantic-release starts at `1.0.0`.
   Tag the commit that published `0.1.0` above:

   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```

   `verify.ts` refuses to run until that exists, so this cannot be forgotten
   silently. The first automated release is then whatever the commits since
   that tag call for.

5. **Push access to main for the release commit.** If main is protected, the
   default `GITHUB_TOKEN` cannot push. The workflow mints an installation token
   from a dedicated GitHub App instead of holding a PAT — the token is
   short-lived (one hour), scoped to this repository, and survives account
   changes the way a personal token does not. One-time setup:

   1. Create a GitHub App (Settings → Developer settings → GitHub Apps; an
      org-less personal app is fine). Webhook off. Repository permissions:
      **Contents: read & write** (the push), **Issues: read & write** and
      **Pull requests: read & write** (`@semantic-release/github` comments on
      what a release ships).
   2. Install the app on `renovate-config-debugger` only.
   3. Store the App ID as a repository **variable** `RELEASE_APP_ID` and a
      generated private key as the **secret** `RELEASE_APP_PRIVATE_KEY`. The
      workflow feeds that variable to `create-github-app-token`'s `client-id`
      input (its `app-id` input is deprecated); both the numeric App ID and the
      app's Client ID are accepted as the JWT issuer, so either value works.
   4. Add the app to main's protection bypass list (branch protection: allow
      the app to push; ruleset: add it under "bypass list") — the token is
      only as strong as the app, and without the bypass the push still 403s.

   When `RELEASE_APP_ID` is unset the mint step is skipped and semantic-release
   falls back to the job's `GITHUB_TOKEN`, which works only while main is
   unprotected. This is the GitHub side and has nothing to do with publishing.

## Amendment (2026-08-17): releases commit nothing, the registry is the history

Two failures a week apart broke both halves of the original design:

- The fixed compat table in `packages/cli/README.md` failed every Renovate
  bump PR (#151): `check-compat.ts` compared its committed top row against the
  current tree on every build, and between releases the `renovate` pin
  legitimately drifts ahead of the last released row.
- The `chore(release):` commit-back died on main's ruleset ("changes must be
  made through a pull request", required `ci-result` check; run 32025694433) —
  even the release App's push is a rule violation without a standing bypass.

Both had the same root cause: release state living in the repository. It no
longer does. `@semantic-release/git` and `@semantic-release/changelog` are
gone; a release changes no tracked file. Versions are derived from tags, the
GitHub release notes are the changelog, and compatibility is stated where it
publishes:

- `stamp-compat.ts` writes a `renovateCompatibility` field into the CLI
  manifest — embedded versions keyed by full package name
  (`@renovate-config-debugger/engine`, `renovate`) — so the npm registry
  accumulates the release history as a side effect of publishing
  (`pnpm view @renovate-config-debugger/cli renovateCompatibility`).
- The compat table is rendered between the README's `<!-- compat-table -->` …
  `<!-- /compat-table -->` markers from the registry packument plus the
  release being cut, so the README that ships to npm carries the full table,
  it cannot disagree with what npm actually has, and the repository copy
  stays a placeholder. Versions published before the field existed (0.0.1)
  have no row.
- `check-compat.ts` still runs inside `build`, network-free: ordinarily the
  README must carry no rendered table and the manifest no compatibility field
  (a hand edit, or a merge resurrecting the fixed table); under
  `RCD_RELEASE=1` (set by `release.config.mjs` after the stamp) both must
  describe the exact build.

Considered and rejected: `peerDependencies` on `renovate` as the marker (npm
auto-installs non-optional peers, and an optional peer warns whenever the
inspected repo carries its own renovate at another version — the package
inlines renovate precisely so consumers never provide it); committing a
`compat.json` history back through a PR-with-automerge (machinery, and the
ruleset race stays); a ruleset bypass for the release App (a standing hole in
branch protection for one cosmetic commit).
