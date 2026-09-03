# Roadmap 043 — self-host distribution. Build context is the repo root.
#
#   docker build --target app         -t rcd-app .
#   docker build --target oauth-proxy -t rcd-oauth-proxy .
#
# The `app` image is deliberately built WITHOUT any VITE_* variables: a
# published image must be able to turn sign-in on at `docker run` time, and
# Vite inlines VITE_* at build time. Configuration is therefore runtime
# (/rcd-config.js, written by the entrypoint) — see docker/40-rcd-config.sh.

# --- build -------------------------------------------------------------------
# Pinned to the BUILD platform, not the target one: this stage emits static
# HTML/JS/CSS, which is byte-identical whatever architecture produced it. CI
# builds each architecture on a runner of that architecture and never hits
# this, but it keeps a local `docker build --platform linux/amd64,linux/arm64`
# from running pnpm install and the vite build a second time under QEMU.
#
# Based on the mise image rather than `node`, so node and pnpm both come from
# `mise.toml` — the same versions a contributor gets locally, stated once. mise
# verifies what it downloads (node against nodejs.org's SHASUMS256.txt, pnpm
# against its GitHub build attestation and checksum), which is also what clears
# the OpenSSF Scorecard Pinned-Dependencies finding the previous
# `npm install --global pnpm@x` tripped: that check only ever accepts `npm ci`,
# never an exact version. No `mise.lock` — mise.toml pins exact versions, so a
# lock file would resolve nothing the checksums don't already cover.
FROM --platform=$BUILDPLATFORM jdxcode/mise:2026.8.16@sha256:05fdec33a6b3f72198fd918927cfa2a345dc3df48175531c1bc3050eaa06f328 AS build

# CI is what `mise.toml`'s postinstall hook checks: without it the hook fires a
# full, unfrozen `pnpm install` here, before any manifest has been copied in.
ENV MISE_DATA_DIR=/opt/mise \
    MISE_TRUSTED_CONFIG_PATHS=/repo \
    CI=1 \
    PATH=/opt/mise/shims:$PATH
WORKDIR /repo

# Named explicitly: a bare `mise install` also picks up tools declared outside
# the repo config.
COPY mise.toml ./
RUN mise install node pnpm

# Manifests first: dependencies only re-resolve when one of these changes. The
# list is the app build's closure — don't add a package this stage never builds.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/app/package.json packages/app/
COPY packages/engine/package.json packages/engine/
# Patches are part of resolution, not of the source tree: pnpm hashes each file
# in `patchedDependencies` to check it against the lockfile, so they must be
# here rather than arriving with the `COPY . .` below.
COPY patches/ patches/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @renovate-config-debugger/app build

# --- oauth-proxy -------------------------------------------------------------
# The OAuth token exchange (roadmap 009) without Cloudflare. Only needed by a
# self-hoster who wants "Sign in with GitHub"; the app works without it.
FROM node:26.8.1-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS oauth-proxy
WORKDIR /app

# The Worker's own manifest, for its `"type": "module"` — nothing is installed
# here (the handler and the adapter have no dependencies), and the TypeScript
# source runs on Node's built-in type stripping, so the image needs no build.
COPY packages/oauth-worker/package.json ./package.json
COPY packages/oauth-worker/src ./src
COPY packages/oauth-worker/server.mjs ./server.mjs

ENV NODE_ENV=production
ENV PORT=8788
EXPOSE 8788
USER node

CMD ["node", "server.mjs"]

# --- app (default target) ----------------------------------------------------
# LAST stage on purpose: a bare `docker build .` must produce the app, because
# Docker builds the final stage when no --target is given.
FROM nginx:alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913 AS app

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-rcd-config.sh /docker-entrypoint.d/40-rcd-config.sh
# Explicit, because a checkout on a filesystem without an exec bit would
# otherwise have the nginx entrypoint silently skip the script.
RUN chmod +x /docker-entrypoint.d/40-rcd-config.sh

COPY --from=build /repo/packages/app/dist /usr/share/nginx/html

EXPOSE 80
