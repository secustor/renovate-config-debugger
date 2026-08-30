# 089 — Docker release tags: versioned, attested, `latest` follows releases

Milestone: M21 · Status: done.

## The ask

The images had no releases: every main push moved `latest`, no tag ever named
a version, and nothing signed what a puller got. Give the docker artifacts the
same release story the npm packages got in 067 — a version tag per release,
provenance a consumer can verify, and `latest` meaning "latest release", not
"latest merge".

## The mechanism

**CI builds and attests; the release promotes.** No image is rebuilt at
release time.

1. **ci.yml `docker`** (unchanged split, roadmap 043) builds each
   (target × platform) natively and pushes by digest, now with BuildKit
   provenance at `mode=max` — the in-registry SLSA attestation manifests ride
   along into the merge.
2. **ci.yml `docker-merge`** joins the digests into one manifest list tagged
   `main` + `sha-<short>` — `latest` no longer appears here — and signs the
   merged list's digest with `actions/attest` (`push-to-registry`), the same
   action and reasoning as 088's Pages attestation. Every later tag is a retag
   of this digest, so this one signature covers them all:
   `gh attestation verify oci://ghcr.io/secustor/renovate-config-debugger:latest
-R secustor/renovate-config-debugger`.
3. **release.yml**, after semantic-release publishes, runs
   `gh attestation verify` against this commit's `sha-` manifest lists and
   `docker buildx imagetools create -t <version> -t latest` them. A
   single-source `imagetools create` copies the list byte-identically, so the
   promoted tags resolve to the digest CI attested. The version crosses from
   semantic-release to the workflow via an exec-plugin `successCmd` writing
   `$GITHUB_OUTPUT`; `success` only runs on a real publish, so "nothing to
   release" cleanly skips the promotion.

## Rulings

- **Retag, not rebuild.** The release ships the digests CI already built and
  pushed for that exact commit — the docker version of release.yml's "the tree
  that gets published is this one". A rebuild would double the multi-arch
  matrix into release.yml and publish bytes nothing had exercised.
- **The wait is a preflight.** The retag's one dependency — CI's docker jobs
  having pushed this commit's images — is checked _before_ semantic-release
  runs (polling up to 15 minutes), in verify.ts's spirit: a release dispatched
  moments after a merge waits, and one whose CI failed dies with npm and the
  tags untouched, not half-shipped.
- **Verification gates the promotion.** `latest` moves only after
  `gh attestation verify` accepts the digest it will point at; a tampered or
  unattested image fails the release instead of shipping.
- **Version tags are npm's, bare** (`0.3.0`, docker convention, no `v`),
  equal across both images and the npm packages by 067's construction. No
  rolling major/minor tags while the scheme is 0.x with breaking-in-minor.
- **Main pushes keep an image**: the rolling `main` tag replaces `latest` for
  anyone deliberately tracking the edge; `sha-` stays the immutable handle the
  release promotes.
