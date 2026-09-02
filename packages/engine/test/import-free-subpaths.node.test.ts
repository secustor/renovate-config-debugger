import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The engine subpaths the app imports STATICALLY, and the two different
 * properties that make each one safe to put on a static chunk.
 *
 * 1. Import-free by banner — `contracts.ts`, `is.ts`, `json.ts` and
 *    `text-scan.ts` each carry a "WHY THIS MODULE HAS NO IMPORTS" banner, and
 *    `.oxlintrc.json`'s engine-root ban sends the app to `/is` and `/json`
 *    from its ENTRY chunk on the strength of it. Until now the banner WAS the
 *    mechanism: one `import { deepEqual } from "./lib"` would weld whatever
 *    that file reaches onto the entry chunk, silently — the dev-graph check
 *    crawls through the dynamic seam by design and the entry-size report has
 *    no threshold. The guarded set is discovered from the banner, not
 *    hand-listed, so a further banner file in `src/` is covered on arrival;
 *    the identity assertion is the floor that stops a broken scan from passing
 *    having found nothing.
 * 2. Renovate-free by CLOSURE — `simulate-missing-inputs.ts` has imports and
 *    no banner, so the first property cannot cover it, yet the app reaches it
 *    statically (`ResultsColumn -> TestsPanel -> rule-filters -> rule-verdict`).
 *    Its edge to `simulate-package-rules` is `import type` today and one
 *    keyword from re-welding the whole Renovate graph, so the second describe
 *    walks the VALUE-import closure rather than the direct imports: that also
 *    covers `text.ts`, which is import-free but carries no banner.
 *
 * `import type` is allowed in both: it is erased before a bundler sees it,
 * which is why the engine-root ban itself carries `allowTypeImports`. An
 * all-type import cannot hide as the inline form here —
 * `typescript/no-import-type-side-effects` requires it be written `import
 * type`.
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

/** Recursive: a banner file anywhere under `src/` is guarded, not just the root. */
function bannerFiles(): string[] {
  return readdirSync(SRC, { encoding: "utf8", recursive: true })
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .filter((name) => readFileSync(join(SRC, name), "utf8").includes(BANNER))
    .toSorted();
}

describe("the import-free engine subpaths", () => {
  const files = bannerFiles();

  it("are the four the app's entry chunk reaches", () => {
    expect(files).toEqual(["contracts.ts", "is.ts", "json.ts", "text-scan.ts"]);
  });

  it.each(files)("%s pulls in no module at runtime", (name) => {
    const source = stripComments(readFileSync(join(SRC, name), "utf8"));
    const offenders = [FROM_IMPORT, SIDE_EFFECT_IMPORT, CALLED_IMPORT].flatMap((pattern) =>
      [...source.matchAll(pattern)].map(([match]) => match.trim()),
    );
    expect(offenders).toEqual([]);
  });
});

/** The statically-imported subpath whose guarantee is closure-shaped. Its
 *  runtime graph is what a static app chunk pays for on every load. */
const RENOVATE_FREE_ENTRY = "simulate-missing-inputs.ts";

/** Specifiers of the value imports in one already-comment-stripped source. */
function valueImports(source: string): string[] {
  const specifiers: string[] = [];
  for (const pattern of [FROM_IMPORT, SIDE_EFFECT_IMPORT]) {
    for (const [match] of source.matchAll(pattern)) {
      const found = /["']([^"']+)["']\s*$/.exec(match.trim());
      if (found?.[1] !== undefined) {
        specifiers.push(found[1]);
      }
    }
  }
  return specifiers;
}

interface Closure {
  /** `src/`-relative names, sorted — every module the entry pulls at runtime. */
  visited: string[];
  /** Non-relative specifiers anywhere in the closure. Any of them is an
   *  offender: the guaranteed property is "reaches nothing but engine prose",
   *  not merely "does not name renovate". */
  bare: string[];
  /** `import(`/`require(` anywhere in the closure — no specifier to follow. */
  called: string[];
}

function valueClosure(entry: string): Closure {
  const visited = new Set<string>();
  const bare: string[] = [];
  const called: string[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const name = queue.pop();
    if (name === undefined || visited.has(name)) {
      continue;
    }
    visited.add(name);
    const source = stripComments(readFileSync(join(SRC, name), "utf8"));
    called.push(...[...source.matchAll(CALLED_IMPORT)].map(([match]) => `${name}: ${match}`));
    for (const specifier of valueImports(source)) {
      if (specifier.startsWith(".")) {
        queue.push(`${join(dirname(name), specifier)}.ts`);
      } else {
        bare.push(`${name}: ${specifier}`);
      }
    }
  }
  return { visited: [...visited].toSorted(), bare, called };
}

describe("the Renovate-free engine subpath /simulate-missing-inputs", () => {
  const closure = valueClosure(RENOVATE_FREE_ENTRY);

  it("value-imports nothing outside the engine's own relative graph", () => {
    expect(closure.bare).toEqual([]);
  });

  it("pulls in no module at runtime anywhere in its closure", () => {
    expect(closure.called).toEqual([]);
  });

  it("is exactly the three prose/JSON modules the app's results chunk pays for", () => {
    expect(closure.visited).toEqual(["json.ts", "simulate-missing-inputs.ts", "text.ts"]);
  });
});
