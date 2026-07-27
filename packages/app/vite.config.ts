import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { renovateShims } from "@renovate-config-visualizer/engine/vite-plugin";

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
  base: process.env.GITHUB_ACTIONS ? "/renovate-config-visualizer/" : "/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [react(), renovateShims(), codemirrorJsonSchemaShims()],
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
  },
});
