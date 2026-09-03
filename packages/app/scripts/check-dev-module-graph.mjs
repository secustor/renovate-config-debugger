/**
 * Guards the dev server's module graph against Node-only leaks.
 *
 * The test matrix covers two module regimes: Node (vitest golden/shimmed,
 * where CJS default-imports interop fine) and the production build (rolldown
 * converts CJS to ESM). `vite dev` is a third regime with weaker interop:
 * renovate is excluded from prebundling, so its transitive deps are served
 * raw from @fs — a CJS package reached by an ESM default import there throws
 * "doesn't provide an export named: 'default'" at runtime only. That is
 * invisible to every other check, so this script boots the dev server
 * programmatically, crawls every literal import from the app entry (through
 * the dynamic engine import), and fails on specifiers that only work in Node:
 * `got` and its CJS cache chain (must stay cut by the merge-confidence shim)
 * and un-aliased `node:` builtins. A crawl that never reaches `renovate/dist`
 * proves nothing, so that is asserted rather than assumed.
 */
import { createServer } from "vite";

const BANNED = [
  {
    pattern: /\/got@|\/got\//,
    why: "got (Node HTTP) — the merge-confidence shim must keep it out",
  },
  {
    pattern: /http-cache-semantics/,
    why: "CJS dep of got's cache chain; no default export in dev",
  },
  { pattern: /cacheable-request|cacheable-lookup/, why: "got cache chain" },
  { pattern: /^node:|\/@id\/node:/, why: "Node builtin reaching the browser graph" },
];

const server = await createServer({
  logLevel: "error",
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
});

const importRe =
  /from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;
const ENTRY = "/src/main.tsx";
const queue = [ENTRY];
const seen = new Set(queue);
const violations = [];

while (queue.length > 0) {
  const url = queue.shift();
  // Prebundled chunks are already ESM-converted; crawling into them is noise.
  if (url.includes("/.vite/") || url.endsWith(".css")) {
    continue;
  }
  let result;
  try {
    result = await server.transformRequest(url);
  } catch (error) {
    // The entry is the whole crawl: losing it silently would report "clean"
    // having looked at nothing.
    if (url === ENTRY) {
      console.error(`Dev module graph check FAILED — could not transform ${ENTRY}:`);
      console.error(error);
      await server.close();
      process.exit(1);
    }
    continue; // assets / virtual modules the transform pipeline rejects
  }
  if (!result?.code) {
    if (url === ENTRY) {
      console.error(`Dev module graph check FAILED — ${ENTRY} transformed to no code.`);
      await server.close();
      process.exit(1);
    }
    continue;
  }
  for (const match of result.code.matchAll(importRe)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (!spec || spec.startsWith("data:")) {
      continue;
    }
    for (const { pattern, why } of BANNED) {
      if (pattern.test(spec)) {
        violations.push(`${spec}\n    imported by ${url}\n    (${why})`);
      }
    }
    if (spec.startsWith("/") && !seen.has(spec)) {
      seen.add(spec);
      queue.push(spec);
    }
  }
}

await server.close();

if (violations.length > 0) {
  console.error(`Dev module graph check FAILED — ${violations.length} banned import(s):\n`);
  for (const v of violations) {
    console.error(`  ${v}\n`);
  }
  process.exit(1);
}

// Reachability, not a size floor: the BANNED list only says anything if the
// crawl entered the subtree it polices — which a change to the `loadEngine()`
// seam can silently drop while the app's own modules still crawl.
const renovateCount = [...seen].filter((u) => u.includes("/renovate/dist/")).length;
if (renovateCount === 0) {
  console.error(
    `Dev module graph check FAILED — crawl never reached renovate/dist (${seen.size} modules crawled), so the guard verified nothing.`,
  );
  process.exit(1);
}
console.log(
  `Dev module graph clean: ${seen.size} modules crawled (${renovateCount} under renovate/dist), no Node-only imports.`,
);
