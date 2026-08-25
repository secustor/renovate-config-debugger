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

  const shimMap = new Map<string, string>(
    Object.entries({
      "_virtual/_rolldown/runtime.js": "rolldown-runtime.ts",
      "instrumentation/index.js": "instrumentation.ts",
      "logger/index.js": "logger.ts",
      "config/migration.js": "migration.ts",
      "expose.js": "expose.ts",
      "config/presets/github/index.js": "presets/github.ts",
      "config/presets/npm/index.js": "presets/npm.ts",
      "config/presets/gitlab/index.js": "presets/gitlab.ts",
      "config/presets/http/index.js": "presets/http.ts",
      "config/presets/local/index.js": "presets/local.ts",
      "config/presets/gitea/index.js": "presets/gitea.ts",
      "config/presets/forgejo/index.js": "presets/forgejo.ts",
      "modules/datasource/index.js": "datasource-index.ts",
      "util/cache/package/index.js": "package-cache.ts",
      "util/hash.js": "hash.ts",
      "util/merge-confidence/index.js": "merge-confidence.ts",
      // conda's version parser is a ~3.9 MB inlined WASM blob (rattler) —
      // over half the bundle for one niche scheme; see shims/versioning-conda.ts
      "modules/versioning/conda/index.js": "versioning-conda.ts",
      // ---- the manager-extraction graph (roadmap 078) ----------------------
      // The single fs choke point every extract file reads through:
      "util/fs/index.js": "fs.ts",
      // The got-backed http stack, reached at module scope via the datasource
      // classes managers import for their `.id`:
      "util/http/got.js": "http.ts",
      "util/http/http.js": "http.ts",
      "util/http/index.js": "http.ts",
      "util/http/gitlab.js": "http.ts",
      "util/http/keep-alive.js": "http.ts",
      // Heavy lookup-only leaves (@aws-sdk, google-auth-library, simple-git):
      "modules/datasource/docker/ecr.js": "extract-leaves.ts",
      "modules/datasource/maven/util.js": "extract-leaves.ts",
      "modules/datasource/util.js": "extract-leaves.ts",
      "util/git/index.js": "extract-leaves.ts",
      // @yarnpkg/core; the two live entry points return "no yarn context":
      "modules/manager/npm/extract/yarn.js": "npm-yarn.ts",
      // global-agent (Node http/https proxy agents), reached at module scope
      // via util/http/host-rules.js:
      "proxy.js": "proxy.ts",
    }).map(([dist, shim]) => [path.join(renovateDist, dist), path.join(shimDir, shim)]),
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
        // lib/util/env spreads process.env; give it an empty object. The
        // platform triple: @pnpm/constants (npm extraction, roadmap 087)
        // interpolates `process.platform`/`arch`/`version` at module scope
        // into a cache label that never leaves the page — any plausible
        // values keep it loadable in a browser.
        define: {
          "process.env": "{}",
          global: "globalThis",
          "process.platform": '"linux"',
          "process.arch": '"x64"',
          "process.version": '"v22.0.0"',
          "process.versions": '{ "node": "22.0.0" }',
        },
        // esbuild prebundling would bypass this plugin's resolveId entirely,
        // but renovate's transitive deps that reach the dev server as CJS/UMD
        // (pure-CJS packages, ESM wrappers around CJS like
        // safe-stable-stringify, and packages whose browser field/condition
        // points at a UMD build like json5) still need prebundling for ESM
        // interop. The chain prefix makes them resolvable from the app root
        // despite pnpm's strict node_modules layout.
        optimizeDeps: {
          exclude: ["renovate"],
          // The prebundler is a separate rolldown pass; it inherits `define`
          // but NOT the pathe alias below — without this resolveId hook it
          // externalizes `path` into a throwing facade, which find-packages
          // (npm extraction, roadmap 087) touches at module scope. graceful-fs
          // is worse: it PATCHES fs at require time, probing it with a Symbol
          // key that Vite's browser-external fs facade throws on — see
          // graceful-fs-stub.cjs.
          rolldownOptions: {
            plugins: [
              {
                name: "renovate-shims:prebundle-node-aliases",
                resolveId(source: string) {
                  if (/^(node:)?path$/.test(source)) {
                    return require.resolve("pathe");
                  }
                  if (source === "graceful-fs") {
                    return path.join(shimDir, "graceful-fs-stub.cjs");
                  }
                  if (/^(node:)?util$/.test(source)) {
                    return path.join(shimDir, "node-util-stub.cjs");
                  }
                  if (/^(node:)?os$/.test(source)) {
                    return path.join(shimDir, "node-os-stub.cjs");
                  }
                  return null;
                },
              },
            ],
          },
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
            // Pure-CJS deps of the lazy manager-extraction graphs (roadmap
            // 087). Only prebundling gives them ESM interop in dev: renovate
            // itself is excluded, so Vite never discovers them on its own and
            // serves them raw — `import ini from "ini"` then finds no default
            // export and every `extractDeps` call fails. The build pipeline
            // converts CJS anyway; this list is for the dev server.
            "@pnpm/parse-overrides",
            "@qnighy/marshal",
            "adm-zip",
            "deepmerge",
            "execa",
            "find-packages",
            "git-url-parse",
            "github-url-from-git",
            "ini",
            "moo",
            "node-html-parser",
            "validate-npm-package-name",
            "xmldoc",
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
      // The same three Node stand-ins the prebundle hook above installs,
      // answered for the MAIN pipeline too: `vite build` never runs the
      // prebundler, so without this the production bundle resolves
      // graceful-fs/node:util/node:os to Vite's browser-external `{}` module
      // and the npm-extraction chunk throws at module init (graceful-fs's
      // polyfills read the bare `process.cwd`, fast-glob calls `os.cpus()`)
      // — the exact crashes the stubs exist to prevent in dev. Scoped by
      // importer to third-party code, matching the prebundle's blast radius:
      // first-party sources and the Node regimes' externalized deps keep the
      // real modules.
      if (importer !== undefined && importer.includes("node_modules")) {
        if (source === "graceful-fs") {
          return path.join(shimDir, "graceful-fs-stub.cjs");
        }
        if (/^(node:)?util$/.test(source)) {
          return path.join(shimDir, "node-util-stub.cjs");
        }
        if (/^(node:)?os$/.test(source)) {
          return path.join(shimDir, "node-os-stub.cjs");
        }
      }
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
