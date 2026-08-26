import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The layer boundary is four-plus hand-copied `no-restricted-imports` pattern
 * banks in `.oxlintrc.json`, and it has to be: oxlint overrides REPLACE a
 * rule's options rather than merging them, so an override that listed only its
 * own patterns silently switches every OTHER boundary off for every file it
 * matches. The config's comments say so. Until this test, nothing checked it —
 * and it had already gone wrong twice (structure review, findings 4 and 5):
 * the two single-import-site exemptions had quietly lost the shared → feature
 * ban, and no bank carried the engine-root ban at all.
 *
 * The check models REPLACE directly rather than reading the banks one by one:
 * for every real source file under `packages/app/src`, work out which override
 * ACTUALLY applies (the last one that matches and sets the rule) and assert
 * that bank bans exactly what that file should be banned from. A new override
 * that forgets a group therefore fails here even though the config is valid
 * JSON, lint is green, and no import violates anything yet — which is the whole
 * failure mode, since a missing ban has zero hits by definition.
 *
 * Same family as `vitest-projects.test.ts` and `class-coverage.test.ts`: an
 * invariant the tooling expresses but cannot enforce on itself.
 */
const srcDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(srcDir, "..", "..", "..");

/** The boundaries, keyed by a stable marker in the group's own pattern list. */
const BOUNDARIES = {
  RENOVATE_DIST: "renovate/dist",
  ENGINE_ROOT: "@renovate-config-debugger/engine",
  ZOD: "zod",
  SCHEMA_STACK: "codemirror-json-schema",
  FEATURES: "@/features",
  APP_SHELL: "@/app",
} as const;

type Boundary = keyof typeof BOUNDARIES;

/**
 * `.oxlintrc.json` is JSONC. The file uses `//` line comments only — the `/*`
 * sequences in it are all inside strings, being glob patterns like
 * `renovate/dist/**` — so the stripper below only has to know about `//`, and
 * only outside a string. Tracking the string state is what keeps a pattern such
 * as `"**\/features/**"` from being mistaken for a comment.
 */
function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        i++;
      }
      out += "\n";
      continue;
    }
    out += ch;
  }
  return out;
}

/** The glob shapes oxlint's `files`/`excludeFiles` actually use here: `**`
 *  crossing separators, `*` not crossing one, everything else literal. */
function globToRegExp(glob: string): RegExp {
  const GLOBSTAR_SLASH = "\u0000gss\u0000";
  const GLOBSTAR = "\u0000gs\u0000";
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, String.raw`\$&`)
    .replaceAll("/**/", GLOBSTAR_SLASH)
    .split("**")
    .map((part) => part.replaceAll("*", "[^/]*"))
    .join(GLOBSTAR)
    .replaceAll(GLOBSTAR, ".*")
    .replaceAll(GLOBSTAR_SLASH, "/(?:.*/)?");
  return new RegExp(`^${body}$`);
}

interface Override {
  files?: string[];
  excludeFiles?: string[];
  rules?: Record<string, unknown>;
}

const config = JSON.parse(
  stripJsonComments(readFileSync(join(repoRoot, ".oxlintrc.json"), "utf8")),
) as { rules?: Record<string, unknown>; overrides?: Override[] };

const overrides = config.overrides ?? [];

function matches(override: Override, file: string): boolean {
  const included = (override.files ?? []).some((glob) => globToRegExp(glob).test(file));
  if (!included) {
    return false;
  }
  return !(override.excludeFiles ?? []).some((glob) => globToRegExp(glob).test(file));
}

/** The groups a bank bans, as boundary names. `"off"` is an empty bank. */
function boundariesOf(value: unknown): Set<Boundary> {
  const found = new Set<Boundary>();
  if (!Array.isArray(value)) {
    return found;
  }
  const options = value[1] as { patterns?: { group?: string[] }[] } | undefined;
  for (const pattern of options?.patterns ?? []) {
    for (const [name, marker] of Object.entries(BOUNDARIES)) {
      if ((pattern.group ?? []).includes(marker)) {
        found.add(name as Boundary);
      }
    }
  }
  return found;
}

/** The LAST override that matches and sets the rule — REPLACE, not merge. */
function effectiveBank(file: string): { override: Override; value: unknown } | undefined {
  let winner: { override: Override; value: unknown } | undefined;
  for (const override of overrides) {
    const value = override.rules?.["no-restricted-imports"];
    if (value !== undefined && matches(override, file)) {
      winner = { override, value };
    }
  }
  return winner;
}

const APP_SRC = "packages/app/src";

const sourceFiles = readdirSync(srcDir, { recursive: true, encoding: "utf8" })
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => `${APP_SRC}/${name.split("\\").join("/")}`);

/** The one file allowed to reach the engine root at runtime (`loadEngine()`). */
const ENGINE_CHUNK = `${APP_SRC}/platform/engine-chunk.ts`;
const ZOD_SITE = `${APP_SRC}/lib/input-schemas-zod.ts`;
const SCHEMA_SITE = `${APP_SRC}/platform/editor-schema.ts`;

function isShell(file: string): boolean {
  return file.startsWith(`${APP_SRC}/app/`) || file === `${APP_SRC}/main.tsx`;
}

/** Shimmed component tests drive the real pipeline off the root barrel; that is
 *  the whole point of the `shimmed` project, and there is no narrower subpath
 *  that could serve them. The shell's own shimmed test is not exempt — it does
 *  not value-import the engine. */
function isEngineDrivingTest(file: string): boolean {
  return file.endsWith(".shimmed.test.tsx") && !isShell(file);
}

function expectedBoundaries(file: string): Set<Boundary> {
  const expected = new Set<Boundary>(["RENOVATE_DIST", "ENGINE_ROOT", "ZOD", "SCHEMA_STACK"]);
  // The shell composes features and is the top of the flow, so neither
  // downward ban applies to it; every other layer carries both.
  if (!isShell(file)) {
    expected.add("FEATURES");
    expected.add("APP_SHELL");
  }
  if (file === ENGINE_CHUNK || isEngineDrivingTest(file)) {
    expected.delete("ENGINE_ROOT");
  }
  if (file === ZOD_SITE) {
    expected.delete("ZOD");
  }
  if (file === SCHEMA_SITE) {
    expected.delete("SCHEMA_STACK");
  }
  return expected;
}

describe("oxlint import boundaries", () => {
  it("finds the source tree and the config", () => {
    expect(sourceFiles.length).toBeGreaterThan(100);
    expect(overrides.length).toBeGreaterThan(5);
    // The three exemption sites still exist under the names the config pins.
    expect(sourceFiles).toContain(ENGINE_CHUNK);
    expect(sourceFiles).toContain(ZOD_SITE);
    expect(sourceFiles).toContain(SCHEMA_SITE);
  });

  it("every app source file's EFFECTIVE bank bans exactly what it should", () => {
    const wrong: string[] = [];
    for (const file of sourceFiles) {
      const bank = effectiveBank(file);
      if (!bank) {
        wrong.push(`${file}: no override sets no-restricted-imports`);
        continue;
      }
      const actual = boundariesOf(bank.value);
      const expected = expectedBoundaries(file);
      const missing = [...expected].filter((b) => !actual.has(b));
      const extra = [...actual].filter((b) => !expected.has(b));
      if (missing.length || extra.length) {
        wrong.push(
          `${file}: missing [${missing.join(", ")}] unexpected [${extra.join(", ")}] ` +
            `(matched override files=${JSON.stringify(bank.override.files)})`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it("the engine-root ban always allows TYPE imports", () => {
    // ~150 app files name the engine's types. Without `allowTypeImports` the
    // ban would be unshippable, so a copy that omits it would be reverted
    // rather than fixed — pin it instead.
    const offenders: string[] = [];
    for (const [index, override] of overrides.entries()) {
      const value = override.rules?.["no-restricted-imports"];
      if (!Array.isArray(value)) {
        continue;
      }
      const options = value[1] as
        | { patterns?: { group?: string[]; allowTypeImports?: boolean }[] }
        | undefined;
      for (const pattern of options?.patterns ?? []) {
        const bansRoot = (pattern.group ?? []).includes(BOUNDARIES.ENGINE_ROOT);
        if (bansRoot && pattern.allowTypeImports !== true) {
          offenders.push(`override #${index} (files=${JSON.stringify(override.files)})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the relative-escape rule covers all of app/src and nothing overrides it", () => {
    // Finding 6: the specifier bans cannot name `../presets/rows` — three
    // segments, no `features` segment. This rule closes that class at every
    // depth, and being a distinct rule key it cannot be dropped by REPLACE.
    // Assert both halves: that it is declared, and that nothing turns it off.
    const declaring = overrides.filter(
      (override) => override.rules?.["import/no-relative-parent-imports"] === "error",
    );
    expect(declaring.length).toBeGreaterThan(0);
    for (const file of sourceFiles) {
      expect(declaring.some((override) => matches(override, file))).toBe(true);
    }
    const disabling = overrides.filter((override) => {
      const value = override.rules?.["import/no-relative-parent-imports"];
      return value !== undefined && value !== "error";
    });
    expect(disabling).toEqual([]);
  });
});

describe("the glob matcher this test relies on", () => {
  // The assertions above are only as good as this, so it gets its own cover.
  it("makes `**` cross separators and `*` not", () => {
    expect(globToRegExp("packages/app/src/**").test("packages/app/src/a/b.ts")).toBe(true);
    expect(globToRegExp("packages/app/src/features/**").test("packages/app/src/lib/a.ts")).toBe(
      false,
    );
    expect(globToRegExp("packages/*/vite.config.ts").test("packages/app/vite.config.ts")).toBe(
      true,
    );
    expect(globToRegExp("packages/*/vite.config.ts").test("packages/a/b/vite.config.ts")).toBe(
      false,
    );
  });

  it("lets `/**/` match zero directories", () => {
    const glob = globToRegExp("packages/app/src/**/*.shimmed.test.tsx");
    expect(glob.test("packages/app/src/features/presets/X.shimmed.test.tsx")).toBe(true);
    expect(glob.test("packages/app/src/X.shimmed.test.tsx")).toBe(true);
    expect(glob.test("packages/app/src/features/presets/X.test.tsx")).toBe(false);
  });

  it("strips comments without eating globs that look like them", () => {
    // `"renovate/dist/**"` and `"**/features/**"` both contain sequences a
    // naive stripper would treat as comment punctuation.
    const source = [
      "{",
      "  // a leading comment",
      '  "a": "renovate/dist/**",',
      '  "b": "**/features/**", // a trailing one',
      '  "c": "http://example.test"',
      "}",
    ].join("\n");
    const parsed = JSON.parse(stripJsonComments(source)) as Record<string, string>;
    expect(parsed.a).toBe("renovate/dist/**");
    expect(parsed.b).toBe("**/features/**");
    expect(parsed.c).toBe("http://example.test");
  });
});
