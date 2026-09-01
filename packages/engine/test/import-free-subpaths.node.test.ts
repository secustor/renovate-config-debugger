import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `contracts.ts`, `is.ts` and `json.ts` each carry a "WHY THIS MODULE HAS NO
 * IMPORTS" banner, and `.oxlintrc.json`'s engine-root ban sends the app to
 * `/is` and `/json` from its ENTRY chunk on the strength of it. Until now the
 * banner WAS the mechanism: one `import { deepEqual } from "./lib"` would weld
 * whatever that file reaches onto the entry chunk, silently — the dev-graph
 * check crawls through the dynamic seam by design and the entry-size report
 * has no threshold.
 *
 * The guarded set is discovered from the banner, not hand-listed, so a fourth
 * banner file is covered on arrival; the identity assertion is the floor that
 * stops a broken scan from passing having found nothing.
 *
 * `import type` is allowed: it is erased before a bundler sees it, which is
 * why the engine-root ban itself carries `allowTypeImports`. An all-type
 * import cannot hide as the inline form here — `typescript/no-import-type-
 * side-effects` requires it be written `import type`.
 */

const BANNER = "WHY THIS MODULE HAS NO IMPORTS";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** `import x from "y"` / `export … from "y"`, minus the type-only forms.
 *  `[^;]*?` keeps a match inside one statement, and tolerates the newlines a
 *  multi-line specifier list brings (the failure a walker in
 *  `app/src/lib/headless.test.ts` records). */
const FROM_IMPORT = /(?:^|\n)\s*(?:import|export)\b(?!\s*type\b)[^;]*?from\s*["'][^"']+["']/g;
/** `import "y"` — no bindings, pure side effect. */
const SIDE_EFFECT_IMPORT = /(?:^|\n)\s*import\s*["'][^"']+["']/g;
/** `import(…)` / `require(…)` — a runtime pull, whatever the bundler does with it. */
const CALLED_IMPORT = /\b(?:import|require)\s*\(/g;

/** The banners themselves say "static import path", so the source is stripped
 *  of comments before any of the patterns above apply. */
function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/[^\n]*/g, "");
}

function bannerFiles(): string[] {
  return readdirSync(SRC, { encoding: "utf8" })
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .filter((name) => readFileSync(join(SRC, name), "utf8").includes(BANNER))
    .toSorted();
}

describe("the import-free engine subpaths", () => {
  const files = bannerFiles();

  it("are the three the app's entry chunk reaches", () => {
    expect(files).toEqual(["contracts.ts", "is.ts", "json.ts"]);
  });

  it.each(files)("%s pulls in no module at runtime", (name) => {
    const source = stripComments(readFileSync(join(SRC, name), "utf8"));
    const offenders = [FROM_IMPORT, SIDE_EFFECT_IMPORT, CALLED_IMPORT].flatMap((pattern) =>
      [...source.matchAll(pattern)].map(([match]) => match.trim()),
    );
    expect(offenders).toEqual([]);
  });
});
