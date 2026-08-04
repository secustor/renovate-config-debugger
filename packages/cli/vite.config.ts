import { fileURLToPath } from "node:url";
import { renovateShims } from "@renovate-config-debugger/engine/vite-plugin";
import { defineConfig } from "vite";

/**
 * Roadmap 058/059: the CLI hosts the BROWSER module graph under Node — served
 * on demand by the dev runner (`vite dev`, `bin/rcv-dev.mjs`), and baked into
 * a Node ESM bundle for publishing (`vite build`, `bin/rcv.mjs`). ONE config,
 * so the two can only ever differ in the ways spelled out below.
 *
 * `renovateShims()` is the exact plugin the app's bundle and the engine's
 * "shimmed" test project use — which is the whole point: the preset tree and
 * the provenance events are reconstructed by the logger shim, so they exist
 * only when this plugin is in the graph. A plain Node import of the engine
 * (the golden-test regime) returns `presetTree: undefined`.
 *
 * The `@` alias resolves the app's own DOM-free derivations
 * (`@renovate-config-debugger/app/headless`), which import each other through
 * the app's `@/` paths.
 */
export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../app/src", import.meta.url)),
    },
  },
  plugins: [renovateShims()],
  ssr: {
    /**
     * Serve: inline `renovate` (otherwise Node loads `renovate/dist` natively
     * and the plugin never sees its imports — the same reason the engine's
     * vitest config sets `server.deps.inline`) and `fast-json-patch` (its CJS
     * exports are not statically analyzable). Deliberately NOT everything:
     * renovate's plain-CJS deps (`parse-link-header`) break the ESM module
     * runner when inlined, and Node's native CJS interop handles them fine.
     *
     * Build: everything, so the published package has NO runtime
     * dependencies — `pnpm dlx` fetches one tarball and runs. Rollup's CJS
     * handling has no trouble with the deps the module runner chokes on, so
     * the two lists differ for exactly that reason and no other.
     */
    noExternal: command === "build" ? true : [/renovate/, /fast-json-patch/],
  },
  build: {
    ssr: true,
    // Node 24 is this package's floor (`engines`), so nothing needs
    // downlevelling; the bundle stays readable ES2023.
    target: "node24",
    minify: false,
    // A debugger whose own stack traces are mangled is a bad joke.
    sourcemap: true,
    outDir: "dist",
    emptyOutDir: true,
    // Vite 8 runs on Rolldown; `rollupOptions` is the deprecated alias.
    rolldownOptions: {
      input: {
        // The CLI itself: what `bin/rcv.mjs` imports.
        main: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
        // The parity handle — see `src/engine-surface.ts`.
        "engine-surface": fileURLToPath(new URL("./src/engine-surface.ts", import.meta.url)),
      },
      output: { entryFileNames: "[name].js" },
    },
  },
  server: {
    // A CLI has no browser to talk to. `hmr: false` alone still starts the
    // dev WebSocket server (it binds port 24678 and fails loudly in a
    // sandbox); `ws: false` is what actually keeps this a process that opens
    // no sockets. `watch: null` keeps it from watching the repo it inspects.
    hmr: false,
    ws: false,
    watch: null,
  },
}));
