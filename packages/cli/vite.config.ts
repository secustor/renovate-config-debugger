import { fileURLToPath } from "node:url";
import { renovateShims } from "@renovate-config-debugger/engine/vite-plugin";
import { defineConfig } from "vite";

/**
 * Roadmap 058: the CLI hosts the BROWSER module graph under Node.
 *
 * `renovateShims()` is the exact plugin the app's bundle and the engine's
 * "shimmed" test project use — which is the whole point: the preset tree and
 * the provenance events are reconstructed by the logger shim, so they exist
 * only when this plugin is in the graph. A plain Node import of the engine
 * (the golden-test regime) returns `presetTree: undefined`.
 *
 * `ssr.noExternal` inlines `renovate` (otherwise Node loads `renovate/dist`
 * natively and the plugin never sees its imports — the same reason the
 * engine's vitest config sets `server.deps.inline`) and `fast-json-patch`
 * (its CJS exports are not statically analyzable). Deliberately NOT
 * everything: renovate's plain-CJS deps (`parse-link-header`) break the ESM
 * runner when inlined, and Node's native CJS interop handles them fine.
 *
 * The `@` alias resolves the app's own DOM-free derivations
 * (`@renovate-config-debugger/app/headless`), which import each other through
 * the app's `@/` paths.
 */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../app/src", import.meta.url)),
    },
  },
  plugins: [renovateShims()],
  ssr: {
    noExternal: [/renovate/, /fast-json-patch/],
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
});
