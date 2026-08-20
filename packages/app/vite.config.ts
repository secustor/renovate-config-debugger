import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
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

export default defineConfig({
  // Served from the domain root everywhere: renovate.secustor.dev in
  // production (custom domains host at "/", and a repo-prefixed base 404s
  // every asset there), localhost + the self-host images elsewhere.
  base: "/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [react(), renovateShims(), codemirrorJsonSchemaShims()],
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
});
