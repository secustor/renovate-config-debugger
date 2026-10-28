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
# The `-debian` tag, not the bare one: since 2026.9.11 the plain tag is
# distroless and has no /bin/sh, so every RUN below fails to start.
FROM --platform=$BUILDPLATFORM jdxcode/mise:2026.10.22-debian@sha256:d54a295f3df1d041e289e7643655ff771df15ce74eece5c62ef72b41c9d9a132 AS build

# CI is what `mise.toml`'s postinstall hook checks: without it the hook fires a
# full, unfrozen `pnpm install` here, before any manifest has been copied in.
ENV MISE_DATA_DIR=/opt/mise \
    MISE_TRUSTED_CONFIG_PATHS=/repo \
    CI=1 \
    PATH=/opt/mise/shims:$PATH
WORKDIR /repo

# Node's official binaries link libatomic, which this image no longer ships.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# Named explicitly: a bare `mise install` also picks up tools declared outside
# the repo config.
COPY mise.toml ./
RUN mise install node pnpm

# Manifests first: dependencies only re-resolve when one of these changes. Every
# workspace package is listed, not just the app build's closure: a frozen
# install refuses a lockfile importer whose manifest is missing.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/app/package.json packages/app/
COPY packages/cli/package.json packages/cli/
COPY packages/engine/package.json packages/engine/
COPY packages/oauth-worker/package.json packages/oauth-worker/
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
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS oauth-proxy
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
FROM nginx:alpine@sha256:a3554c0d0b48177b1413c26e01f695334428020d9df01243fbae3e11cfd17417 AS app

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-rcd-config.sh /docker-entrypoint.d/40-rcd-config.sh
# Explicit, because a checkout on a filesystem without an exec bit would
# otherwise have the nginx entrypoint silently skip the script.
RUN chmod +x /docker-entrypoint.d/40-rcd-config.sh

COPY --from=build /repo/packages/app/dist /usr/share/nginx/html

EXPOSE 80
