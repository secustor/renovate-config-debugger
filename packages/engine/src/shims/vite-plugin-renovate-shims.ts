import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/**
 * Redirects the Node-only choke points inside renovate/dist to browser-safe
 * shims. A resolveId hook (not resolve.alias) is required because the dist
 * modules import each other via RELATIVE specifiers (`./github/index.js`),
 * which aliases never see — only importer-relative resolution catches them.
 *
 * Used identically by the app's Vite build and the engine's "shimmed" Vitest
 * project, so browser bundle and Node tests share one mechanism.
 */
export function renovateShims(): Plugin {
  const require = createRequire(import.meta.url);
  // require.resolve yields the real path (pnpm store), matching the importer
  // paths Vite reports, since Vite resolves symlinks by default.
  const renovateRoot = path.dirname(require.resolve("renovate/package.json"));
  const renovateDist = path.join(renovateRoot, "dist");
  const shimDir = fileURLToPath(new URL(".", import.meta.url));
  // The shims sit next to this file in both trees this plugin ever runs from:
  // as `.ts` inside the workspace (app build, vitest "shimmed" project) and as
  // compiled `.js` inside the published package (roadmap 056). This module's
  // own extension is which of the two it is, so the map below stays
  // extensionless and the emitted build needs no path rewriting.
  const shimExt = path.extname(fileURLToPath(import.meta.url));

  const shimMap = new Map<string, string>(
    Object.entries({
      "_virtual/_rolldown/runtime.js": "rolldown-runtime",
      "instrumentation/index.js": "instrumentation",
      "logger/index.js": "logger",
      "config/migration.js": "migration",
      "expose.js": "expose",
      "config/presets/github/index.js": "presets/github",
      "config/presets/npm/index.js": "presets/npm",
      "config/presets/gitlab/index.js": "presets/gitlab",
      "config/presets/http/index.js": "presets/http",
      "config/presets/local/index.js": "presets/local",
      "config/presets/gitea/index.js": "presets/gitea",
      "config/presets/forgejo/index.js": "presets/forgejo",
      "modules/datasource/index.js": "datasource-index",
      "util/cache/package/index.js": "package-cache",
      "util/hash.js": "hash",
      "util/merge-confidence/index.js": "merge-confidence",
      // conda's version parser is a ~3.9 MB inlined WASM blob (rattler) —
      // over half the bundle for one niche scheme; see shims/versioning-conda.ts
      "modules/versioning/conda/index.js": "versioning-conda",
    }).map(([dist, shim]) => [
      path.join(renovateDist, dist),
      path.join(shimDir, `${shim}${shimExt}`),
    ]),
  );

  function lookup(resolved: string): string | undefined {
    for (const candidate of [resolved, `${resolved}.js`, path.join(resolved, "index.js")]) {
      const shim = shimMap.get(candidate);
      if (shim) {
        return shim;
      }
    }
    return undefined;
  }

  return {
    name: "renovate-shims",
    enforce: "pre",
    config() {
      return {
        // lib/util/env spreads process.env; give it an empty object.
        define: { "process.env": "{}" },
        // esbuild prebundling would bypass this plugin's resolveId entirely,
        // but renovate's transitive deps that reach the dev server as CJS/UMD
        // (pure-CJS packages, ESM wrappers around CJS like
        // safe-stable-stringify, and packages whose browser field/condition
        // points at a UMD build like json5) still need prebundling for ESM
        // interop. The chain prefix makes them resolvable from the app root
        // despite pnpm's strict node_modules layout.
        optimizeDeps: {
          exclude: ["renovate"],
          include: [
            "@breejs/later",
            "croner",
            "cronstrue",
            "handlebars",
            "json-dup-key-validator",
            "json5",
            "jsonata",
            "luxon",
            "ms",
            "parse-link-header",
            "safe-stable-stringify",
            "semver",
            "semver-stable",
            "semver-utils",
            "yaml",
          ].map((dep) => `@renovate-config-debugger/engine > renovate > ${dep}`),
        },
        resolve: {
          alias: [
            // upath (config/parse.js) wraps node:path; pathe is the pure-JS
            // drop-in that works in the browser.
            { find: /^(node:)?path$/, replacement: "pathe" },
          ],
        },
      };
    },
    resolveId(source, importer) {
      if (source.startsWith(".")) {
        if (!importer?.includes(renovateDist)) {
          return null;
        }
        return lookup(path.resolve(path.dirname(importer), source)) ?? null;
      }
      if (source.startsWith("renovate/dist/")) {
        return lookup(path.join(renovateRoot, source.slice("renovate/".length))) ?? null;
      }
      return null;
    },
  };
}
