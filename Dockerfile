# Roadmap 043 — self-host distribution. Build context is the repo root.
#
#   docker build --target app         -t rcv-app .
#   docker build --target oauth-proxy -t rcv-oauth-proxy .
#
# The `app` image is deliberately built WITHOUT any VITE_* variables: a
# published image must be able to turn sign-in on at `docker run` time, and
# Vite inlines VITE_* at build time. Configuration is therefore runtime
# (/rcv-config.js, written by the entrypoint) — see docker/40-rcv-config.sh.

# --- build -------------------------------------------------------------------
# Pinned to the BUILD platform, not the target one: this stage emits static
# HTML/JS/CSS, which is byte-identical whatever architecture produced it. CI
# builds each architecture on a runner of that architecture and never hits
# this, but it keeps a local `docker build --platform linux/amd64,linux/arm64`
# from running pnpm install and the vite build a second time under QEMU.
FROM --platform=$BUILDPLATFORM node:26.5.1-alpine@sha256:233761595746769ebfdb6090f44fc7cdf818ae0ce62d2b37e0367723b9823e36 AS build
WORKDIR /repo

# Matches the root package.json `packageManager` field — kept in step by
# Renovate via `customManagers:dockerfileVersions`, which needs the version in
# an ARG named *_VERSION preceded by the comment below. Installed via npm
# rather than corepack, which node:26 no longer bundles.
# renovate: datasource=npm depName=pnpm
ARG PNPM_VERSION=11.19.0
RUN npm install --global "pnpm@${PNPM_VERSION}"

# Manifests first: dependencies only re-resolve when one of these changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/app/package.json packages/app/
COPY packages/engine/package.json packages/engine/
COPY packages/oauth-worker/package.json packages/oauth-worker/
# Patches are part of resolution, not of the source tree: pnpm hashes each file
# in `patchedDependencies` to check it against the lockfile, so they must be
# here rather than arriving with the `COPY . .` below.
COPY patches/ patches/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @renovate-config-visualizer/app build

# --- oauth-proxy -------------------------------------------------------------
# The OAuth token exchange (roadmap 009) without Cloudflare. Only needed by a
# self-hoster who wants "Sign in with GitHub"; the app works without it.
FROM node:26.5.1-alpine@sha256:233761595746769ebfdb6090f44fc7cdf818ae0ce62d2b37e0367723b9823e36 AS oauth-proxy
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
FROM nginx:alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752 AS app

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-rcv-config.sh /docker-entrypoint.d/40-rcv-config.sh
# Explicit, because a checkout on a filesystem without an exec bit would
# otherwise have the nginx entrypoint silently skip the script.
RUN chmod +x /docker-entrypoint.d/40-rcv-config.sh

COPY --from=build /repo/packages/app/dist /usr/share/nginx/html

EXPOSE 80
