#!/bin/sh
# Roadmap 043 — writes /rcv-config.js at container start so ONE published image
# serves OAuth-off and OAuth-on (and analytics-off/on) deployments.
#
# The official nginx image runs every executable /docker-entrypoint.d/*.sh
# before nginx starts, so this needs no custom ENTRYPOINT. Sign-in needs BOTH
# ids; analytics needs its one id. With nothing set the file keeps its shipped
# stub: the app runs with the PAT fallback as its only GitHub auth and sends
# no analytics.
set -e

target=/usr/share/nginx/html/rcv-config.js
label="40-rcv-config.sh"

# Values are operator-supplied rather than attacker-supplied, but a stray
# backslash, quote or newline must not emit a broken file that white-screens
# the app: escape for a double-quoted JS string literal.
js_escape() {
    printf '%s' "$1" | tr -d '\n\r' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

oauth=false
if [ -n "$RCV_GITHUB_CLIENT_ID" ] && [ -n "$RCV_OAUTH_WORKER_URL" ]; then
    oauth=true
else
    echo "$label: RCV_GITHUB_CLIENT_ID / RCV_OAUTH_WORKER_URL not both set, sign-in stays off"
fi

analytics=false
if [ -n "$RCV_GA_MEASUREMENT_ID" ]; then
    analytics=true
fi

if ! $oauth && ! $analytics; then
    exit 0
fi

{
    echo "// Generated at container start from the RCV_* environment variables."
    if $oauth; then
        echo "globalThis.__RCV_OAUTH__ = {"
        echo "  clientId: \"$(js_escape "$RCV_GITHUB_CLIENT_ID")\","
        echo "  workerUrl: \"$(js_escape "$RCV_OAUTH_WORKER_URL")\","
        if [ -n "$RCV_GITHUB_APP_SLUG" ]; then
            echo "  appSlug: \"$(js_escape "$RCV_GITHUB_APP_SLUG")\","
        fi
        echo "};"
    fi
    if $analytics; then
        echo "globalThis.__RCV_ANALYTICS__ = {"
        echo "  measurementId: \"$(js_escape "$RCV_GA_MEASUREMENT_ID")\","
        echo "};"
    fi
} >"$target"

if $oauth; then
    echo "$label: wrote $target (sign-in enabled)"
fi
if $analytics; then
    echo "$label: wrote $target (analytics enabled)"
fi
