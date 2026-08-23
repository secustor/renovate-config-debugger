import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { renovateShims } from "@renovate-config-debugger/engine/vite-plugin";

/**
 * Bundle review finding — cuts two dependencies out of the lazy schema chunk
 * that codemirror-json-schema pulls in unconditionally but this app can never
 * reach:
 *
 * - `dist/utils/markdown.js` runs a top-level async IIFE that builds a shiki
 *   highlighter (highlighter core + the javascript grammar + both vitesse
 *   themes, ~330 kB raw) purely to colour fenced code blocks inside schema
 *   hover/completion tooltips. It is statically imported by features/hover.js,
 *   features/completion.js AND features/validation.js, so every ConfigEditor
 *   mount paid for it. The shim renders the same markdown with markdown-it
 *   alone; accepted visible delta is that tooltip code fences lose their
 *   syntax colours (markdown structure is unchanged).
 * - `dist/parsers/index.js` is a barrel that statically imports the YAML
 *   parser, dragging the `yaml` package into the schema graph even though
 *   `getDefaultParser(MODES.YAML)` is only reachable via the library's
 *   `/yaml` entry point, which this app never imports (it uses `jsonSchema`
 *   and, lazily, `json5Schema`). The shim throws if ever called.
 *
 * Mechanism copied from `renovateShims()` in
 * packages/engine/src/shims/vite-plugin-renovate-shims.ts: a resolveId hook,
 * not `resolve.alias`, because the library's dist modules import each other
 * through RELATIVE, extensionless specifiers (`../utils/markdown`) that
 * aliases never see. Matching is on a path SUFFIX so it survives pnpm's
 * `.pnpm/<pkg>@<version>_<hash>/node_modules/...` real paths.
 */
const posix = (file: string) => file.replaceAll("\\", "/");

function codemirrorJsonSchemaShims(): Plugin {
  const require = createRequire(import.meta.url);
  // Any file inside the library serves as the importer for resolving its own
  // (nested, pnpm-private) dependencies through Vite's resolver, which picks
  // markdown-it's ESM entry — Node's require conditions would pick the CJS one.
  const libraryEntry = require.resolve("codemirror-json-schema");
  const shimDir = fileURLToPath(new URL("./src/platform/shims", import.meta.url));

  const shims = new Map(
    Object.entries({
      "/codemirror-json-schema/dist/utils/markdown.js": "codemirror-json-schema-markdown.ts",
      "/codemirror-json-schema/dist/parsers/yaml-parser.js":
        "codemirror-json-schema-yaml-parser.ts",
    }).map(([suffix, shim]) => [suffix, path.join(shimDir, shim)]),
  );

  const shimDirPosix = `${posix(shimDir)}/`;

  return {
    name: "codemirror-json-schema-shims",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) {
        return null;
      }
      // The shims live in this package, where the library's private deps are
      // not resolvable by name; hand the specifier back to Vite as if the
      // library itself had asked for it.
      if (source === "markdown-it" && posix(importer).startsWith(shimDirPosix)) {
        return this.resolve(source, libraryEntry, { skipSelf: true });
      }
      if (!source.startsWith(".")) {
        return null;
      }
      const resolved = posix(path.resolve(path.dirname(importer), source));
      for (const candidate of [resolved, `${resolved}.js`]) {
        for (const [suffix, shim] of shims) {
          if (candidate.endsWith(suffix)) {
            return shim;
          }
        }
      }
      return null;
    },
  };
}

/**
 * Dev-only signed-in state, without a GitHub App or Worker: when the
 * gitignored `packages/app/.env` sets `RCD_DEV_FAKE_OAUTH_TOKEN` (any GitHub
 * token — a classic PAT works), `pnpm dev` boots the app already signed in.
 * The seeding has to run before ANY module code (App.tsx reads the OAuth
 * config at module scope), so it goes in as an inline `head-prepend` script,
 * not an app import: it plants a fake `__RCD_OAUTH__` (which outranks the
 * `VITE_*` vars, so a configured real deployment is overridden while the
 * fake is on) and seeds the `rcd.oauth.*` sessionStorage keys — mirrors of
 * `K` in src/platform/oauth.ts, which deliberately does not export them.
 * `getValidToken()` then returns the token verbatim, so GitHub fetches (and
 * the roadmap-085 repo picker) hit the real API with it.
 *
 * `RCD_DEV_AUTH_SCHEME` picks WHICH of the app's auth shapes the token is
 * seeded as:
 *
 * - `oauth` (default) — the roadmap-009 body protocol: session-scoped access
 *   token, signed-in session menu, repo picker.
 * - `cookie` — the roadmap-065 cookie mode: same session, plus the
 *   `rcd.oauth.cookieSession` localStorage marker, so the cookie-mode UI and
 *   boot paths run. The refresh round-trip itself still needs a real Worker;
 *   without one the session honestly expires with the 8 h token.
 * - `pat` — no OAuth at all: the token lands in `rcd.githubToken`, the
 *   "Platform context & per-host tokens" fallback of an OAuth-off deployment.
 *
 * Why the token cannot leak into a bundle: `apply: "serve"` keeps the plugin
 * out of every build, and the non-`VITE_` prefix keeps the var out of
 * `import.meta.env`. Seeding skips when a token already exists (never
 * clobbers a session); "Sign out" clears the keys, so the next reload seeds
 * again. The one dead end is the sign-in button itself — GitHub 404s the
 * fake client id. This fakes the signed-in STATE, not the flow; the flow
 * needs the real setup in packages/oauth-worker/README.md.
 */
// JSON.stringify plus a `<` escape keeps a value inert inside an inline
// <script> — no `</script>` breakout from a hand-typed .env value.
const js = (value: string) => JSON.stringify(value).replaceAll("<", "\\u003c");

function devFakeOAuth(env: Record<string, string>): Plugin | null {
  const token = env.RCD_DEV_FAKE_OAUTH_TOKEN?.trim();
  if (!token) {
    return null;
  }
  const scheme = env.RCD_DEV_AUTH_SCHEME?.trim() || "oauth";
  if (scheme !== "oauth" && scheme !== "cookie" && scheme !== "pat") {
    throw new Error(`RCD_DEV_AUTH_SCHEME must be "oauth", "cookie" or "pat", got "${scheme}"`);
  }
  const login = env.RCD_DEV_FAKE_OAUTH_LOGIN?.trim() || "octocat";
  const avatarUrl = `https://github.com/${encodeURIComponent(login)}.png`;
  const seed =
    scheme === "pat"
      ? [
          `    if (sessionStorage.getItem("rcd.githubToken")) return;`,
          `    sessionStorage.setItem("rcd.githubToken", ${js(token)});`,
        ]
      : [
          // Cookie mode's whole JS footprint is this marker (the refresh
          // token would live in an HttpOnly cookie, invisible here anyway);
          // the 6-month horizon mirrors GitHub's refresh-token lifetime.
          // BEFORE the already-seeded guard, so switching the scheme to
          // "cookie" takes effect in a tab that seeded under "oauth".
          ...(scheme === "cookie"
            ? [
                `    localStorage.setItem("rcd.oauth.cookieSession", String(Date.now() + 180 * 24 * 60 * 60 * 1000));`,
              ]
            : []),
          `    if (sessionStorage.getItem("rcd.oauth.token")) return;`,
          `    sessionStorage.setItem("rcd.oauth.token", ${js(token)});`,
          // GitHub App user tokens live 8 h; anything > the 60 s refresh
          // skew works, since with no refresh token expiry means sign-out.
          `    sessionStorage.setItem("rcd.oauth.tokenExpiresAt", String(Date.now() + 8 * 60 * 60 * 1000));`,
          `    sessionStorage.setItem("rcd.oauth.user", JSON.stringify({ login: ${js(login)}, avatarUrl: ${js(avatarUrl)} }));`,
        ];
  return {
    name: "dev-fake-oauth",
    apply: "serve",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          injectTo: "head-prepend",
          children: [
            "(() => {",
            // The Worker port from oauth-worker/server.mjs, in case one is
            // actually running there; signOut's fire-and-forget POST /logout
            // swallows the connection error when nothing is. The `pat`
            // scheme leaves OAuth unconfigured — that IS the scheme.
            ...(scheme === "pat"
              ? []
              : [
                  `  globalThis.__RCD_OAUTH__ = { clientId: "dev-fake", workerUrl: "http://localhost:8788" };`,
                ]),
            "  try {",
            ...seed,
            "  } catch {",
            "    // storage-disabled browser: boots signed out, like everywhere else",
            "  }",
            "})();",
          ].join("\n"),
        },
      ];
    },
  };
}

export default defineConfig(({ mode, command }) => ({
  // Served from the domain root everywhere: renovate.secustor.dev in
  // production (custom domains host at "/", and a repo-prefixed base 404s
  // every asset there), localhost + the self-host images elsewhere.
  base: "/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    renovateShims(),
    codemirrorJsonSchemaShims(),
    // Guarded here, not just by the plugin's own `apply: "serve"`: the
    // factory VALIDATES the dev-only vars and throws on a bad value, and the
    // config callback runs for `vite build` too — a typo'd .env entry must
    // fail the dev server it configures, never a production build.
    ...(command === "serve"
      ? [devFakeOAuth(loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "RCD_DEV_"))]
      : []),
  ],
  /**
   * Roadmap 077 review — the dev-only failure reported as "the Share button
   * is not working": most of this app's module graph enters lazily (the
   * editor chunk, the results chunk on the first run, `zod/mini` on the first
   * share encode), so on a cold `.vite` cache the optimizer used to discover
   * each batch mid-session — and every "optimized dependencies changed.
   * reloading" threw the page (and the run, and the click that triggered it)
   * away. The first Share click literally reloaded the app back to the
   * landing. This is the steady-state list out of
   * `node_modules/.vite/deps/_metadata.json`, pre-bundled at server start so
   * dev discovers nothing mid-click. Production builds are untouched.
   */
  optimizeDeps: {
    include: [
      // First paint + the CodeMirror editor chunk.
      "react-dom/client",
      "@uiw/react-codemirror",
      "@codemirror/lang-json",
      "@codemirror/language",
      "@lezer/highlight",
      "codemirror-json-schema",
      "codemirror-json-schema/json5",
      "codemirror-json5",
      // The lazy results chunk (diff views), loaded with the first run.
      "diff",
      "react-diff-view",
      // The engine is a LINKED workspace package, so its own deps surface as
      // top-level ids the app's root can't resolve — the `>` chain resolves
      // them through the engine.
      "@renovate-config-debugger/engine > fast-json-patch",
      // The share codec (roadmap 030's validation), loaded on encode/decode.
      "zod/mini",
      // The shimmed engine graph's CJS deps — the engine chunk is the biggest
      // lazy import of all, and these reloaded dev right as the first result
      // was about to land.
      "@renovate-config-debugger/engine > renovate > @breejs/later",
      "@renovate-config-debugger/engine > renovate > croner",
      "@renovate-config-debugger/engine > renovate > cronstrue",
      "@renovate-config-debugger/engine > renovate > handlebars",
      "@renovate-config-debugger/engine > renovate > json-dup-key-validator",
      "@renovate-config-debugger/engine > renovate > json5",
      "@renovate-config-debugger/engine > renovate > jsonata",
      "@renovate-config-debugger/engine > renovate > luxon",
      "@renovate-config-debugger/engine > renovate > ms",
      "@renovate-config-debugger/engine > renovate > parse-link-header",
      "@renovate-config-debugger/engine > renovate > safe-stable-stringify",
      "@renovate-config-debugger/engine > renovate > semver",
      "@renovate-config-debugger/engine > renovate > semver-stable",
      "@renovate-config-debugger/engine > renovate > semver-utils",
      "@renovate-config-debugger/engine > renovate > yaml",
    ],
    // `path` is not a package here — the shim plugin aliases it to `pathe`
    // (pure ESM), and the aliased id can neither be pre-included ("Cannot
    // optimize dependency: path") nor left to discovery (a mid-run reload).
    // Excluded, Vite serves the ESM directly and never optimizes it.
    exclude: ["path"],
  },
  build: {
    /**
     * Roadmap 037: `light-dark()` MUST reach the browser intact. At Vite's
     * default CSS target ("baseline-widely-available", ~30 months behind) the
     * CSS pipeline downlevels every `light-dark()` into a
     * `--lightningcss-light` / `--lightningcss-dark` custom-property pair
     * switched by `@media (prefers-color-scheme: dark)` — a polyfill only the
     * OS can drive. The whole app then silently ignores `color-scheme`, so the
     * theme switcher changed nothing in a production build while working
     * perfectly in dev. Pinned to the browsers that ship `light-dark()`
     * natively (Chrome 123 / Firefox 120 / Safari 17.5 — Baseline 2024-05),
     * which is also where the app's container queries and `color-mix()`
     * already put the floor.
     */
    cssTarget: ["chrome123", "firefox120", "safari17.5"],
    /**
     * PageSpeed best-practices: production stack traces stay readable and
     * Lighthouse stops flagging the large chunks as unmapped. `.map` files
     * are fetched only when devtools asks for them, so shipping them costs
     * page weight nothing.
     */
    sourcemap: true,
  },
}));
