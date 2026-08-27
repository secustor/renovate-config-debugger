# 088 — Build provenance: "verify this build"

Milestone: M21 · Status: done.
Design: Claude Design project "Renovate Config Debugger", artboards
`Build Provenance.dc.html` (the popover), `Landing Transition.dc.html` (the
subtitle ⓘ and the landing build line) and
`Proposal F - Integrated Shell.dc.html` (the pane-foot stamp).

## The ask

The landing promises "nothing leaves your browser", and everything about the
app's trust story hangs on the visitor believing the served bundle really is a
build of the open-source code. Nothing on the page backed that promise: the
app displayed no version, no commit, and there was no way — for any deployment
— to check the served bytes against the repository. Give the promise a
receipt: which build this is, and a command that verifies it.

## The mechanism

Three layers, each independently checkable:

1. **The baked identity.** `vite.config.ts` defines `__BUILD_INFO__`
   (repo slug, commit, latest release tag, committer date) and emits the same
   object as `dist/build-info.json`. Only **commit-derived** facts, so
   rebuilding the same commit reproduces the bundle byte-for-byte — which is
   why the branch name and a wall-clock build time are deliberately absent
   ("built" is the committer date, and the design mock's `· main ·` segment
   was dropped). Read through `src/lib/build-info.ts`, which validates the
   injected value and exports `BUILD_INFO: null` where the identifier is
   absent (vitest applies no define) or the build had no git (the Docker
   image excludes `.git`) — every UI anchor then renders nothing, rather than
   an identity nothing can verify.
2. **The attested files.** `scripts/build-manifest.mjs` hashes every file
   in `dist/` into `build-manifest.json` (excluding itself, and
   `rcd-config.js`, which the Docker entrypoint may rewrite at container
   start), and writes the same digests — manifest included — to
   `build-checksums.txt` (next to `dist/`, gitignored: attestation input,
   not deployment payload). CI generates both before the Pages upload and,
   on main, signs the checksums with `actions/attest`
   (`subject-checksums`) — GitHub's statement that this workflow built
   these files from this commit. So EVERY served file is an attested
   subject: `gh attestation verify build-manifest.json -R
secustor/renovate-config-debugger` is the entry point, but the same
   command verifies any downloaded asset individually. The build job
   fetches the full history (`fetch-depth: 0`) so `git describe` can name
   the release tag.
3. **The rebuild proof.** `tools/verify-deployment.ts` (plain `node`, like
   every tools/ script) fetches the served manifest, re-fetches and re-hashes
   every file it lists (served ≡ manifest), and — when a local
   `packages/app/dist` exists — diffs the local build against the manifest:
   run from a checkout of the manifest's commit, that is the independent
   proof that needs no trust in GitHub's attestation service.

## The UI

One popover (`src/components/BuildInfo.tsx`), three anchors mirroring the
app's promise-stated-twice seam (075):

- the ⓘ after the landing subtitle ("About this build", panel opens below);
- the landing's closing line — `debugger v0.2.0 · d58538f · built … — verify
this build` (panel opens above);
- the pane-foot stamp `· v0.2.0 d58538f` at the strip's right edge, for the
  share-link reader who never saw the landing (panel opens above-right).

The panel: identity line (release tag, linked short commit, committer time in
UTC), two command chips — `gh attestation` and `rebuild & diff` — a
terminal-styled command block with the standard icon-only copy button, and a
one-line note saying what the shown command actually proves. The open/close
mechanics are the session menu's, extracted to
`hooks/use-anchored-popover.ts` (066's contract, parameterized by Escape
rank — this popover dismisses at `popover` rank, above the menu).

Deliberately **not called "provenance" anywhere user-facing**: that word
already means config-value provenance (which layer set an option) here. The
copy says "build" and "verify".

## Rulings

- **Branch dropped from the baked identity** (deviation from the artboard's
  `· main ·`): a verifier's rebuild is on a detached HEAD, so a baked branch
  name would break byte-reproducibility for the one chunk that carries the
  identity. The manifest still records the branch, informationally.
- **`node tools/verify-deployment.ts`**, not the artboard's `npx tsx`: tools/
  scripts run under Node's native type stripping everywhere else in this
  repo, and the verifier has a checkout (they need one to rebuild anyway).
  The popover shows it wrapped as `mise run verify-build <origin>`
  (mise.toml): install + build + diff in one command, with the toolchain
  pinned to what CI built with — which is what byte-reproducibility
  depends on.
- **Docker deployments show nothing** rather than something unverifiable: the
  build context excludes `.git`, `collectBuildIdentity()` returns a null
  commit, and every anchor hides. A self-host that wants the line can pass
  `GITHUB_SHA`/`GITHUB_REPOSITORY` as build env. Deferred: a build arg wired
  through the Dockerfile.
- **Attestation is main-only and gated on `DEPLOY_PAGES`** — the same switch
  that decides whether a public deployment exists to verify; fork PRs never
  hold the `id-token` permission the signature needs.
- **`actions/attest`, not `actions/attest-build-provenance`**: v4 of the
  latter is a wrapper that points new uses at the former, and only the
  former takes `subject-checksums` (all served files as subjects of one
  SLSA-provenance attestation — no predicate inputs means it emits build
  provenance). One invocation caps at 1024 subjects; the manifest script
  warns at 1000 (a build today has ~475).
