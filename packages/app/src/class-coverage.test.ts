import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Class names and CSS rules must account for each other, in both directions:
 * a className app source writes has to be styled or selected, and a class
 * selector a stylesheet declares has to be written or selected. Commit e01d366
 * removed ~fifteen classNames that named a thing and did nothing; this guard is
 * what keeps that class of dead code from coming back on either side.
 *
 * A TEST rather than a lint rule because the rule is cross-file AND
 * cross-language: a `className` in a `.tsx` file is justified by a selector in
 * a `.css` file or by a locator in an `e2e/*.spec.ts`. oxlint sees one JS file
 * at a time and stylelint sees CSS only, so neither can ever hold both halves.
 * This repo's established home for a cross-file invariant is a
 * filesystem-reading guard test — `src/vitest-projects.test.ts`,
 * `engine/test/project-coverage.node.test.ts` — and tests gate exactly like
 * lint here (the Stop hook runs them, CI runs them).
 *
 * Two granularities are deliberate, because the honest alternative is a real
 * AST/CSSOM pass for very little more signal:
 *
 * - Matching is by TOKEN TEXT, not by site. A token an e2e spec locates
 *   anywhere passes everywhere it is written — so the tree row's live
 *   `.badge.src` also justifies the table row's `src`. Site-level matching
 *   would need to know which element each selector can reach.
 * - A template chunk that ends mid-token (`` `src-${host}` ``) is kept as a
 *   PREFIX and satisfied by any class that starts with it, rather than by
 *   enumerating what the interpolation can produce.
 *
 * Extraction is conservative on the writing side: a construct that cannot be
 * read with confidence contributes nothing, so the guard under-reports rather
 * than inventing a token to fail on.
 */

const srcDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(srcDir, "..");

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).map((name) => join(dir, name));
}

const srcTree = filesUnder(srcDir);
const isTest = (path: string) => /\.test\.tsx?$/.test(path);

/** App source: everything that can write a class into the DOM. */
const sourceFiles = srcTree.filter((path) => /\.tsx?$/.test(path) && !isTest(path));
/** Both stylesheet halves: the token block + base elements, and the cascade. */
const styleFiles = [
  join(srcDir, "index.css"),
  ...filesUnder(join(srcDir, "styles")).filter((path) => path.endsWith(".css")),
];
/** Anything that can SELECT a class: the app's own tests and the e2e suite. */
const testFiles = [
  ...srcTree.filter(isTest),
  ...filesUnder(join(appDir, "e2e")).filter((path) => path.endsWith(".ts")),
];

const show = (path: string) => relative(appDir, path);

/* ------------------------------------------------------------------ *
 * Documented exceptions. Every entry states a TRUE reason: this list is
 * not a way to make the guard pass, it is a way to record a class that
 * genuinely satisfies neither half.
 * ------------------------------------------------------------------ */

/** Written by app source, styled by nothing, selected by no test. Empty at
 *  head — e01d366 removed the last of them — and it should stay that way:
 *  prefer deleting the className. */
const WRITTEN_EXCEPTIONS = new Map<string, string>();

/** Styled by the app, written by something that is not app source. */
const STYLED_EXCEPTIONS = new Map<string, string>([
  [
    "diff-gutter",
    "react-diff-view renders the gutter cell; the app only themes what the library writes",
  ],
  [
    "cm6-json-schema-hover--code-wrapper",
    "codemirror-json-schema's own hover markup, styled to match the app's cards",
  ],
]);

/* ------------------------------------------------------------------ *
 * Literal readers. Enough of a scanner to know a class string from a
 * comparison, and a template's static text from its interpolations.
 * ------------------------------------------------------------------ */

interface StringLiteral {
  value: string;
  end: number;
}

function readString(source: string, start: number): StringLiteral | null {
  const quote = source[start];
  let value = "";
  let i = start + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === "\\") {
      value += source[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (char === "\n") return null;
    if (char === quote) return { value, end: i + 1 };
    value += char;
    i++;
  }
  return null;
}

/** One run of static text in a template, plus the interpolations (if any)
 *  glued to its left and right edges. */
interface TemplateChunk {
  text: string;
  before: string | null;
  after: string | null;
}

interface TemplateLiteral {
  chunks: TemplateChunk[];
  expressions: string[];
  end: number;
}

function readTemplate(source: string, start: number): TemplateLiteral | null {
  const chunks: TemplateChunk[] = [];
  const expressions: string[] = [];
  let text = "";
  let before: string | null = null;
  let i = start + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === "\\") {
      text += source[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (char === "`") {
      chunks.push({ text, before, after: null });
      return { chunks, expressions, end: i + 1 };
    }
    if (char === "$" && source[i + 1] === "{") {
      const braced = readBraced(source, i + 1);
      chunks.push({ text, before, after: braced.text });
      expressions.push(braced.text);
      text = "";
      before = braced.text;
      i = braced.end;
      continue;
    }
    text += char;
    i++;
  }
  return null;
}

/** `source[start]` is `{`; returns what it encloses and the index after it. */
function readBraced(source: string, start: number): { text: string; end: number } {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const char = source[i];
    if (char === '"' || char === "'") {
      const literal = readString(source, i);
      i = literal ? literal.end : i + 1;
      continue;
    }
    if (char === "`") {
      const template = readTemplate(source, i);
      i = template ? template.end : i + 1;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return { text: source.slice(start + 1, i), end: i + 1 };
    }
    i++;
  }
  return { text: source.slice(start + 1), end: source.length };
}

/* ------------------------------------------------------------------ *
 * Harvesting class tokens out of an expression that yields a class string.
 * ------------------------------------------------------------------ */

interface ClassTokens {
  /** Whole class names. */
  tokens: Set<string>;
  /** Class names an interpolation completes: `src-` from `` `src-${host}` ``. */
  prefixes: Set<string>;
}

const emptyTokens = (): ClassTokens => ({ tokens: new Set(), prefixes: new Set() });

/** `x === "a"` is a comparison, not a class. */
const COMPARISON = /[=!<>]=*\s*$/;

/** Is this string literal a VALUE of the expression rather than something it
 *  tests or passes on? Call arguments are excluded too: `startsWith("sim-")`
 *  reads a class, it does not write one. */
function isClassValue(expression: string, at: number): boolean {
  const before = expression.slice(0, at);
  const previous = before.trimEnd().slice(-1);
  return !COMPARISON.test(before) && previous !== "(" && previous !== ",";
}

/** Can this interpolation continue the token on the given side, or does every
 *  value it can take start (or end) on a token boundary? `${x ? " active" : ""}`
 *  cannot glue — so the chunk before it holds a whole class, not a prefix.
 *  An interpolation with no string literals in it is unknowable, so it glues. */
function glues(expression: string, side: "left" | "right"): boolean {
  const values: string[] = [];
  let i = 0;
  while (i < expression.length) {
    const char = expression[i];
    if (char === '"' || char === "'") {
      const literal = readString(expression, i);
      if (!literal) {
        i++;
        continue;
      }
      if (isClassValue(expression, i)) values.push(literal.value);
      i = literal.end;
      continue;
    }
    if (char === "`") {
      const template = readTemplate(expression, i);
      i = template ? template.end : i + 1;
      continue;
    }
    i++;
  }
  if (values.length === 0) return true;
  return values.some((value) => value !== "" && !(side === "left" ? /^\s/ : /\s$/).test(value));
}

function harvestTemplate(template: TemplateLiteral, into: ClassTokens): void {
  for (const chunk of template.chunks) {
    const parts = chunk.text.split(/\s+/);
    for (const [index, token] of parts.entries()) {
      if (!token) continue;
      // the tail of a token an interpolation began — unknowable, so skipped
      if (index === 0 && chunk.before !== null && glues(chunk.before, "right")) continue;
      if (index === parts.length - 1 && chunk.after !== null && glues(chunk.after, "left")) {
        into.prefixes.add(token);
        continue;
      }
      into.tokens.add(token);
    }
  }
}

function harvest(expression: string, into: ClassTokens): void {
  let i = 0;
  while (i < expression.length) {
    const char = expression[i];
    if (char === '"' || char === "'") {
      const literal = readString(expression, i);
      if (!literal) {
        i++;
        continue;
      }
      if (isClassValue(expression, i)) {
        for (const token of literal.value.split(/\s+/)) if (token) into.tokens.add(token);
      }
      i = literal.end;
      continue;
    }
    if (char === "`") {
      const template = readTemplate(expression, i);
      if (!template) {
        i++;
        continue;
      }
      harvestTemplate(template, into);
      for (const expr of template.expressions) harvest(expr, into);
      i = template.end;
      continue;
    }
    i++;
  }
}

/* ------------------------------------------------------------------ *
 * What app source WRITES: the confident half.
 * ------------------------------------------------------------------ */

/** `className="…"`, `className={…}` and `className: …` (the badge descriptors
 *  in `features/presets/tree-shared.ts` name the prop in an object). */
const CLASS_NAME_SITE = /\bclassName\s*[=:]\s*/g;
/** Imperative DOM building: `platform/editor-schema.ts` builds hover cards. */
const CLASS_NAME_ASSIGNMENT = /\.className\s*=\s*/g;
/** `lib/motion.ts` flashes an element by class. */
const CLASS_LIST_CALL = /classList\.(?:add|remove|toggle|replace)\(([^)]*)\)/g;

/** Reads the class value that starts at `at` — a string, a template, or a
 *  braced expression — and nothing beyond it. Returns where it ended. */
function harvestValueAt(source: string, at: number, into: ClassTokens): number {
  const char = source[at];
  if (char === '"' || char === "'") {
    const literal = readString(source, at);
    if (!literal) return at + 1;
    for (const token of literal.value.split(/\s+/)) if (token) into.tokens.add(token);
    return literal.end;
  }
  if (char === "`") {
    const template = readTemplate(source, at);
    if (!template) return at + 1;
    harvestTemplate(template, into);
    for (const expression of template.expressions) harvest(expression, into);
    return template.end;
  }
  if (char === "{") {
    const braced = readBraced(source, at);
    harvest(braced.text, into);
    return braced.end;
  }
  // an identifier, a call, a conditional without literals — nothing to read
  return at + 1;
}

function writtenBy(source: string): ClassTokens {
  const found = emptyTokens();
  const site = new RegExp(CLASS_NAME_SITE.source, "g");
  let match = site.exec(source);
  while (match) {
    site.lastIndex = harvestValueAt(source, match.index + match[0].length, found);
    match = site.exec(source);
  }
  for (const assignment of source.matchAll(CLASS_NAME_ASSIGNMENT)) {
    harvestValueAt(source, assignment.index + assignment[0].length, found);
  }
  for (const call of source.matchAll(CLASS_LIST_CALL)) {
    harvest(call[1] ?? "", found);
  }
  return found;
}

function record(index: Map<string, Set<string>>, key: string, file: string): void {
  const files = index.get(key) ?? new Set<string>();
  files.add(file);
  index.set(key, files);
}

const writtenTokens = new Map<string, Set<string>>();
const writtenPrefixes = new Map<string, Set<string>>();

for (const file of sourceFiles) {
  const found = writtenBy(readFileSync(file, "utf8"));
  for (const token of found.tokens) record(writtenTokens, token, file);
  for (const prefix of found.prefixes) record(writtenPrefixes, prefix, file);
}

/* ------------------------------------------------------------------ *
 * What app source MENTIONS: the wider half, for the inverse direction.
 *
 * A class is often assembled far from the JSX that wears it — `layerClass()`
 * returns `` `prov-${kind}` ``, `LedgerMosaic.tileClass()` returns
 * `` `ledger-tile-${kind} s${strength}` ``. Following those through the call
 * graph needs a real AST; asking instead "does any class-shaped literal in app
 * source spell this class" is looser, but it errs toward keeping a live rule,
 * which is the right way for THIS direction to be wrong.
 * ------------------------------------------------------------------ */

/** kebab-case, the only shape this codebase's classes take. */
const CLASS_SHAPE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PREFIX_SHAPE = /^[a-z][a-z0-9-]*$/;

const mentionedTokens = new Set<string>();
const mentionedPrefixes = new Set<string>();

function mentionsIn(source: string): void {
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i);
      i = newline === -1 ? source.length : newline;
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    if (char === '"' || char === "'") {
      const literal = readString(source, i);
      if (!literal) {
        i++;
        continue;
      }
      for (const token of literal.value.split(/\s+/)) {
        if (CLASS_SHAPE.test(token)) mentionedTokens.add(token);
      }
      i = literal.end;
      continue;
    }
    if (char === "`") {
      const template = readTemplate(source, i);
      if (!template) {
        i++;
        continue;
      }
      const found = emptyTokens();
      harvestTemplate(template, found);
      for (const token of found.tokens) if (CLASS_SHAPE.test(token)) mentionedTokens.add(token);
      for (const prefix of found.prefixes) {
        if (PREFIX_SHAPE.test(prefix)) mentionedPrefixes.add(prefix);
      }
      i = template.end;
      continue;
    }
    i++;
  }
}

for (const file of sourceFiles) mentionsIn(readFileSync(file, "utf8"));
for (const token of writtenTokens.keys()) mentionedTokens.add(token);
for (const prefix of writtenPrefixes.keys()) mentionedPrefixes.add(prefix);

/* ------------------------------------------------------------------ *
 * What the stylesheets STYLE.
 * ------------------------------------------------------------------ */

/** Comments first: `02-controls.css` explains classes it deliberately does not
 *  have a rule for, and commentary must never count as a rule. */
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const ATTRIBUTE_SELECTOR = /\[[^\]]*\]/g;
const CLASS_SELECTOR = /\.(-?[A-Za-z_][\w-]*)/g;

const styledIn = new Map<string, Set<string>>();

for (const file of styleFiles) {
  const css = readFileSync(file, "utf8").replace(CSS_COMMENT, " ");
  let depth = 0;
  let preludeStart = 0;
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === "{") {
      const prelude = css.slice(preludeStart, i);
      // an at-rule prelude (`@media (…)`) holds conditions, not selectors; the
      // rules nested inside it are reached by the next `{` all the same
      if (!prelude.trimStart().startsWith("@")) {
        for (const match of prelude.replace(ATTRIBUTE_SELECTOR, " ").matchAll(CLASS_SELECTOR)) {
          const token = match[1];
          if (token) record(styledIn, token, file);
        }
      }
      depth++;
      preludeStart = i + 1;
    } else if (char === "}") {
      depth--;
      preludeStart = i + 1;
    } else if (char === ";" && depth > 0) {
      preludeStart = i + 1;
    }
  }
}

const styledTokens = [...styledIn.keys()];

/* ------------------------------------------------------------------ *
 * What the tests SELECT.
 * ------------------------------------------------------------------ */

const testSource = testFiles.map((file) => readFileSync(file, "utf8")).join("\n");

/** A test justifies a class by locating it (`.sim-write-row`) or by naming it
 *  exactly (`toContain("dropped")`). Prose that merely uses the word does not
 *  count — `dropped` and `rules` read like English, and half the e2e comments
 *  say them. */
function selectedByTest(token: string, kind: "token" | "prefix"): boolean {
  const tail = kind === "prefix" ? "[A-Za-z0-9_-]*" : "(?![A-Za-z0-9_-])";
  return (
    new RegExp(`\\.${token}${tail}`).test(testSource) ||
    new RegExp(`["'\`]${token}${tail}["'\`]`).test(testSource)
  );
}

/* ------------------------------------------------------------------ *
 * The two directions.
 * ------------------------------------------------------------------ */

/** A prefix of one or two characters — `s` from `` ` s${tileStrength(f)}` `` —
 *  would otherwise justify a whole stylesheet, so it only justifies the
 *  enumeration shape it comes from: the prefix plus digits (`.s1`, `.s2`). */
function prefixCovers(prefix: string, token: string): boolean {
  if (!token.startsWith(prefix)) return false;
  return prefix.length >= 3 || /^\d+$/.test(token.slice(prefix.length));
}

const WRITTEN_FIX =
  "A className app source writes must be styled, selected by a test, or allowlisted.\n" +
  "For each token below, either:\n" +
  "  1. style it — add a rule for it in src/index.css or src/styles/*.css;\n" +
  "  2. select it from a test — an e2e locator (e2e/**/*.ts) or a src test\n" +
  "     (src/**/*.test.ts, *.test.tsx, *.shimmed.test.tsx);\n" +
  "  3. allowlist it in WRITTEN_EXCEPTIONS in src/class-coverage.test.ts, with a reason;\n" +
  "or — usually the right answer — delete the className, as commit e01d366 did.";

const STYLED_FIX =
  "A class selector a stylesheet declares must be written, selected, or allowlisted.\n" +
  "For each selector below, either:\n" +
  "  1. write it — have app source put the class on an element;\n" +
  "  2. select it from a test (e2e/**/*.ts or src/**/*.test.ts(x));\n" +
  "  3. allowlist it in STYLED_EXCEPTIONS in src/class-coverage.test.ts, with a reason —\n" +
  "     that is where a class a third-party library writes belongs;\n" +
  "or — usually the right answer — delete the rule: nothing can wear it.";

describe("every written class is styled or selected", () => {
  it("the extractor still finds the classNames app source writes", () => {
    // a silent zero here would make the whole direction pass vacuously
    expect(writtenTokens.size).toBeGreaterThan(400);
    expect(writtenPrefixes.size).toBeGreaterThan(5);
  });

  it("no className is written that nothing styles and no test selects", () => {
    const orphans: string[] = [];
    for (const [token, files] of writtenTokens) {
      if (styledIn.has(token)) continue;
      if (selectedByTest(token, "token")) continue;
      if (WRITTEN_EXCEPTIONS.has(token)) continue;
      orphans.push(`\`${token}\` written by ${[...files].map(show).join(", ")}`);
    }
    for (const [prefix, files] of writtenPrefixes) {
      if (styledTokens.some((token) => token.startsWith(prefix))) continue;
      if (selectedByTest(prefix, "prefix")) continue;
      if (WRITTEN_EXCEPTIONS.has(prefix)) continue;
      orphans.push(`\`${prefix}…\` (dynamic) written by ${[...files].map(show).join(", ")}`);
    }
    expect(orphans, WRITTEN_FIX).toEqual([]);
  });

  it("every written exception is still written", () => {
    const stale = [...WRITTEN_EXCEPTIONS.keys()].filter(
      (token) => !writtenTokens.has(token) && !writtenPrefixes.has(token),
    );
    expect(stale, "an exception for a className nobody writes any more — drop it").toEqual([]);
  });
});

describe("every styled class is written or selected", () => {
  it("the extractor still finds the app's class selectors", () => {
    expect(styledIn.size).toBeGreaterThan(500);
  });

  it("no class selector is styled that app source never writes", () => {
    const orphans: string[] = [];
    for (const [token, files] of styledIn) {
      if (mentionedTokens.has(token)) continue;
      if ([...mentionedPrefixes].some((prefix) => prefixCovers(prefix, token))) continue;
      if (selectedByTest(token, "token")) continue;
      if (STYLED_EXCEPTIONS.has(token)) continue;
      orphans.push(`\`.${token}\` styled in ${[...files].map(show).join(", ")}`);
    }
    expect(orphans, STYLED_FIX).toEqual([]);
  });

  it("every styled exception is still styled", () => {
    const stale = [...STYLED_EXCEPTIONS.keys()].filter((token) => !styledIn.has(token));
    expect(stale, "an exception for a rule that no longer exists — drop it").toEqual([]);
  });
});
