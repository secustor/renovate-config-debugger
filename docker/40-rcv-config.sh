#!/bin/sh
# Roadmap 043 — writes /rcv-config.js at container start so ONE published image
# serves both an OAuth-off and an OAuth-on deployment.
#
# The official nginx image runs every executable /docker-entrypoint.d/*.sh
# before nginx starts, so this needs no custom ENTRYPOINT. Sign-in needs BOTH
# ids; with either missing the file keeps its shipped stub and the app runs with
# the PAT fallback as its only GitHub auth.
set -e

target=/usr/share/nginx/html/rcv-config.js
label="40-rcv-config.sh"

if [ -z "$RCV_GITHUB_CLIENT_ID" ] || [ -z "$RCV_OAUTH_WORKER_URL" ]; then
    echo "$label: RCV_GITHUB_CLIENT_ID / RCV_OAUTH_WORKER_URL not both set, sign-in stays off"
    exit 0
fi

# Values are operator-supplied rather than attacker-supplied, but a stray
# backslash, quote or newline must not emit a broken file that white-screens
# the app: escape for a double-quoted JS string literal.
js_escape() {
    printf '%s' "$1" | tr -d '\n\r' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

client_id=$(js_escape "$RCV_GITHUB_CLIENT_ID")
worker_url=$(js_escape "$RCV_OAUTH_WORKER_URL")

{
    echo "// Generated at container start from the RCV_* environment variables."
    echo "globalThis.__RCV_OAUTH__ = {"
    echo "  clientId: \"$client_id\","
    echo "  workerUrl: \"$worker_url\","
    if [ -n "$RCV_GITHUB_APP_SLUG" ]; then
        echo "  appSlug: \"$(js_escape "$RCV_GITHUB_APP_SLUG")\","
    fi
    echo "};"
} >"$target"

echo "$label: wrote $target (sign-in enabled)"
