/**
 * Roadmap 031: prints the gzip size of the critical-path entry set — the
 * entry <script> plus every modulepreload'ed chunk and the entry stylesheet,
 * exactly what the browser fetches before first paint — straight from the
 * dist/ the build just produced, so a regression is visible in the CI log
 * next to the build it measures. Read-only; exits non-zero only when dist/
 * is missing (run the build first).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

let html;
try {
  html = readFileSync(join(dist, "index.html"), "utf8");
} catch {
  console.error("report-entry-size: dist/index.html not found — run the build first.");
  process.exit(1);
}

// The entry script, its modulepreload graph, and the entry stylesheet — the
// base path (GitHub Pages) is stripped so only the asset file name remains.
const refs = [
  ...html.matchAll(/<script[^>]*src="[^"]*\/(assets\/[^"]+)"/g),
  ...html.matchAll(/<link rel="modulepreload"[^>]*href="[^"]*\/(assets\/[^"]+)"/g),
  ...html.matchAll(/<link rel="stylesheet"[^>]*href="[^"]*\/(assets\/[^"]+)"/g),
].map((m) => m[1]);

let totalRaw = 0;
let totalGz = 0;
const kb = (n) => `${(n / 1024).toFixed(2)} kB`;
console.log("Critical-path entry set (fetched before first paint):");
for (const ref of refs) {
  const bytes = readFileSync(join(dist, ref));
  const gz = gzipSync(bytes, { level: 9 }).length;
  totalRaw += bytes.length;
  totalGz += gz;
  console.log(`  ${ref.padEnd(44)} ${kb(bytes.length).padStart(12)} │ gzip: ${kb(gz)}`);
}
console.log(`  ${"TOTAL".padEnd(44)} ${kb(totalRaw).padStart(12)} │ gzip: ${kb(totalGz)}`);
