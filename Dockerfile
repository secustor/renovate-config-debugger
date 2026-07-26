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
FROM node:26.5.0-alpine AS build
WORKDIR /repo

# Matches the root package.json `packageManager` field. Installed via npm
# rather than corepack, which node:26 no longer bundles.
RUN npm install --global pnpm@11.16.0

# Manifests first: dependencies only re-resolve when one of these changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/app/package.json packages/app/
COPY packages/engine/package.json packages/engine/
COPY packages/oauth-worker/package.json packages/oauth-worker/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @renovate-config-visualizer/app build

# --- oauth-proxy -------------------------------------------------------------
# The OAuth token exchange (roadmap 009) without Cloudflare. Only needed by a
# self-hoster who wants "Sign in with GitHub"; the app works without it.
FROM node:26.5.0-alpine AS oauth-proxy
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
FROM nginx:alpine AS app

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-rcv-config.sh /docker-entrypoint.d/40-rcv-config.sh
# Explicit, because a checkout on a filesystem without an exec bit would
# otherwise have the nginx entrypoint silently skip the script.
RUN chmod +x /docker-entrypoint.d/40-rcv-config.sh

COPY --from=build /repo/packages/app/dist /usr/share/nginx/html

EXPOSE 80
