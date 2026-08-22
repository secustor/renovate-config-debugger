import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Roadmap 058: `lib/headless.ts` is the seam `packages/cli` imports, and its
 * header promises "everything re-exported here is pure: no React, no DOM, no
 * browser globals" — a promise that until now existed only as that comment.
 * The CLI compiles the barrel's whole TRANSITIVE closure, so one import of a
 * `components/` module anywhere below it drags React into a Node bundle.
 *
 * This walks the closure with fs + path (no bundler needed: every specifier in
 * it is a static `./`, `../` or `@/` path) and enforces the two halves of the
 * rule — the closure lives in `lib/`/`data/`, and no file in it names a
 * browser global or imports React.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = resolve(SRC, "lib/headless.ts");

/** `import x from "y"` / `export * from "y"` — static forms only, which is all
 *  the closure uses. */
const SPECIFIER = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*["']([^"']+)["']/g;

/** Comments carry prose that legitimately says "document" (run-facts.ts,
 *  description-attribution.ts), so they are stripped before the ban applies. */
function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/[^\n]*/g, "");
}

function resolveSpecifier(specifier: string, fromFile: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? resolve(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : undefined;
  if (base === undefined) return undefined; // bare package — not app source
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      /* try the next extension */
    }
  }
  throw new Error(`unresolvable app import ${specifier} from ${fromFile}`);
}

function closureOf(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    const source = readFileSync(file, "utf8");
    seen.set(file, source);
    for (const [, specifier] of stripComments(source).matchAll(SPECIFIER)) {
      if (specifier === undefined) continue;
      const target = resolveSpecifier(specifier, file);
      if (target !== undefined && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

describe("the headless barrel's transitive closure", () => {
  const closure = closureOf(ENTRY);

  it("has more than the entry in it", () => {
    expect(closure.size).toBeGreaterThan(10);
  });

  it("lives entirely under lib/ or data/", () => {
    const strays = [...closure.keys()]
      .map((file) => relative(SRC, file))
      .filter((path) => !path.startsWith("lib/") && !path.startsWith("data/"));
    expect(strays).toEqual([]);
  });

  it("names no browser global and imports no React", () => {
    const impure =
      /\bdocument\b|\bwindow\b|\bnavigator\b|localStorage|sessionStorage|from ["']react["']/;
    const offenders = [...closure]
      .filter(([, source]) => impure.test(stripComments(source)))
      .map(([file]) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
