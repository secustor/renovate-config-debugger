import { type Context, defineRule, type ESTree } from "@oxlint/plugins";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../repo-root.ts";

/**
 * Arm (b), and the one arm-(b) rule that names a destination rather than a ban:
 * a comment cites a file or a symbol, and the citation is checked against the
 * tree.
 *
 * Six of the 2026-09 sweep's twenty-three findings were this one class, in two
 * shapes. `diffKeys`' docblock sent the reader to a tripwire in a
 * `simulate-package-rules` test file that has never existed; the
 * `error-translations` header named a `RuleSimulator` renderer under
 * `components/`, an app path in the wrong layer (both a721e15f). The symbol
 * half is the same defect from the other end: `activeHide` cited in the
 * glossary (it moved to `hover-card-hooks.ts`), `focusKey` cited in
 * `use-thread-nav` (the state slot was reshaped away), `makeTokenHandler` cited
 * in `App` (nowhere in the repo) — 7619e7bb. Three more the sweep itself missed
 * were fixed with this rule, which is the point: a filename in a docblock reads
 * as authoritative and nobody opens it, so the class is invisible in review.
 * The spec carries each of those citations verbatim; this header spells them
 * around the shapes on purpose, so the file does not report itself.
 *
 * TWO ARMS IN ONE FILE, deliberately. Both need the same repo file index, the
 * same `getAllComments()` pass and the same comment normalization, and they
 * resolve one citation from opposite ends — does the FILE exist, does the
 * SYMBOL live in the file the comment names. Two rule files would walk the
 * filesystem twice.
 *
 * WHY THE SHAPES ARE THIS NARROW. A first cut that resolved every path-shaped
 * backticked token measured 4.5% precision and was rejected. This one resolves
 * only tokens that carry their own proof of being a filename — a `.test.` /
 * `.spec.` infix, or a literal `packages/` prefix — resolves the test arm by
 * BASENAME so a colocation move is not reported as a missing file, and skips
 * any token written as a glob (a `*` in it or before it) or as a suffix
 * fragment (a `.` before it), which is what the vitest project globs are. Arm B
 * requires its target to exist and be UNIQUE before it checks anything: what it
 * checks is the SYMBOL, against a file the comment itself names, which is a
 * claim the comment makes rather than a path guess. The target is searched as
 * PLAIN TEXT, not by scope analysis — a symbol merely mentioned in a comment
 * inside the target counts as present, which trades recall for precision.
 *
 * ARM B READS THREE SPELLINGS of one claim. The first puts the backticked
 * symbol ahead of the file. The second is POSSESSIVE — a bare filename, an
 * apostrophe `s`, then the backticked member (`Thing.tsx`'s `member`) — and it
 * was added because the sweep hunting exactly this class walked past two of
 * them: both halves of `use-share-link`'s sign-in citation named a `signInRef`
 * that has never existed anywhere in the repo. Two of the sweep's own hand
 * fixes are where the spelling comes from (finding 37, e0a388b5, whose fix
 * REWROTE a possessive citation into the shape this rule could already see;
 * finding 29, 75684991).
 *
 * The backtick around the symbol is the possessive arm's entire precision
 * device: without it the possessive matches fifteen lines of ordinary prose in
 * scope, with it five — two lies, three correct silences, no false positive.
 * The ASCII apostrophe alone is enough; the curly variant has zero hits. And
 * the symbol stays a single identifier: widening it to a dotted member path
 * would have caught finding 29 as well, but no dotted possessive citation
 * exists in the tree, so that widening has no measured precision to stand on.
 *
 * THE THIRD SPELLING IS THE SAME POSSESSIVE WITH THE EXTENSION LEFT OFF —
 * `App`'s `keysLive`, `use-repo-load`'s `parseRepoRef` — and it exists because
 * sweep V found two of them by hand that the extension-carrying arm above could
 * not see (finding 26, `use-focus-landing.ts`, citing `App` for a binding
 * roadmap 086 had moved; finding 27(c), `input-schemas.ts`, citing a
 * `parseRepoRef` that matches nothing in the repo — both fixed in 2613e96e, and
 * both fixed by REWRITING the citation into the extension-carrying shape). That
 * is the class surviving its second sweep in a row: the shipped possessive arm
 * exists because `App.tsx`'s `signInRef` was walked past, and these are the
 * identical claim with three characters missing. This arm catches 27(c); 26
 * still falls to the plain-text trade, because App.tsx destructures the moved
 * binding out of the hook and a mention counts as present. Widening to the
 * declaration would report every re-export in the tree.
 *
 * THREE PRECISION DEVICES, ALL MEASURED. (i) The module half is CamelCase or
 * kebab-WITH-a-hyphen, never a bare lowercase word: allowing lowercase words
 * takes the raw match count from 39 to 226 — `link`'s `node`, `engine`'s
 * `digest` — which resolve accidentally against `types/*.ts`. (ii) The backtick
 * around the symbol stays, the same device the arm above calls its whole
 * precision device. (iii) The name resolves through `<name>.ts` / `.tsx` /
 * `.mjs` and must hit exactly ONE file, the same unique-target rule the arm
 * above applies. Disjoint from that arm by construction: `App.tsx`'s `x` cannot
 * match, since the lookbehind rejects the preceding `.` and `tsx` is neither
 * CamelCase nor hyphenated.
 *
 * AND ONE GATE THIS ARM CARRIES ALONE: it reports only when the message can
 * name something definite — a unique `definitionSite`, or a symbol no source
 * file mentions at all. An extensionless name is a weaker claim than a path, so
 * a report that can only say "not here, and I cannot tell you where" is not
 * worth its false-positive risk. Measured over `packages/**`: 39 raw matches,
 * 21 resolve to a unique file, 14 correctly silent because the symbol IS in the
 * cited file, 5 reports, all true. THE RECALL COST IS TWO, both stated: the
 * gate silences `EffectiveConfig`'s `packageRules` (`hooks/rule-provenance.ts`
 * — prose naming a UI row, 151 files mention the symbol) and, deliberately,
 * `App`'s `inheritAutoEdit` (`RepoLoadForm.tsx`), a REAL drift whose symbol is
 * bound only by destructuring, so no declaration site can be named. The count
 * is taken over `packages/**` only, for the same reason the SCOPE note below
 * gives: a census entry in a `tools/**` header is not the tree still using the
 * symbol, and counting one would silence the arm on the very citations the
 * headers are a record of.
 *
 * Comments are the only thing read, so string literals and JSX are structurally
 * out of reach in both directions.
 *
 * SCOPE IS PART OF THE PRECISION, and the override comment has to say so. All
 * of `packages/**` is in — src, every test tree, e2e and scripts alike, since
 * an enumeration of trees is what let two test suites drift out of scope.
 * `tools/**` is deliberately out: a rule header here keeps a past-tense census
 * of WHAT WAS IN THE TREE, naming symbols and files the sweep deleted on
 * purpose (`prefer-is-helpers`' is the standing example). That is the one
 * legitimate way to name a symbol that is not there — it was the arm's single
 * false positive on the whole tree — and the scope removes it structurally
 * rather than by heuristic.
 */

const SKIPPED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  "test-results",
  ".claude",
]);

/** A file whose extension proves it is a test, with any directory prefix — resolved by basename. */
const TEST_FILE_CITATION = /(?:[\w.@/-]+\/)?[\w-][\w.-]*\.(?:test|spec)\.(?:tsx|jsx|mjs|ts|js)\b/g;

/**
 * A repo-relative path under `packages/`. The extension alternation is spelled
 * LONGEST-FIRST and terminated with `\b`: `js` alone matches the head of
 * `package.json` and leaves `on` behind, which manufactured two false positives.
 */
const PACKAGE_PATH_CITATION = /packages\/[\w.@/-]+\.(?:json|yaml|tsx|jsx|mjs|yml|css|ts|js|md)\b/g;

/** `` `symbol` `` immediately followed by the file it is claimed to live in. */
const SYMBOL_HOME_CITATION =
  /`([A-Za-z_$][\w$]*)`\s*(?:\(|\bin\s+|\bfrom\s+|\bat\s+)`?([\w.@/-]+\.tsx?)`?\)?/g;

/** The same claim possessed: the file, then the backticked symbol it owns. */
const POSSESSIVE_HOME_CITATION = /([\w.@/-]+\.tsx?)'s\s+`([A-Za-z_$][\w$]*)`/g;

/**
 * The possessive with the extension left off. The module half is CamelCase or
 * kebab-with-a-hyphen — a bare lowercase word matches ordinary prose — and
 * `'s?` also reads the trailing-apostrophe possessive the sweep's own fixes
 * write (`use-keyboard-landings' `member``: a lowercase-leading camelCase name
 * is NOT in the module half, so `useKeyboardLandings' `member`` is silent).
 */
const MODULE_HOME_CITATION =
  /(?<![\w./-])((?:[A-Z][A-Za-z0-9]*)|(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)+))'s?\s+`([A-Za-z_$][\w$]*)`/g;

/** The extensions an extensionless module name is tried with. */
const MODULE_EXTENSIONS = [".ts", ".tsx", ".mjs"];

/** Files a symbol could be DEFINED in — the destination search reads only these. */
const SOURCE_FILE = /\.(?:tsx|jsx|mjs|ts|js)$/;

interface FileIndex {
  readonly byBasename: ReadonlyMap<string, readonly string[]>;
  readonly paths: ReadonlySet<string>;
}

function indexRepo(root: string): FileIndex {
  const byBasename = new Map<string, string[]>();
  const paths = new Set<string>();
  const pending = [""];
  for (let rel = pending.pop(); rel !== undefined; rel = pending.pop()) {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      const child = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) {
          pending.push(child);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      paths.add(child);
      const bucket = byBasename.get(entry.name);
      if (bucket === undefined) {
        byBasename.set(entry.name, [child]);
      } else {
        bucket.push(child);
      }
    }
  }
  return { byBasename, paths };
}

// Built once per lint process, on the first comment the rule actually looks at:
// importing the plugin should not walk the tree in a run that never enables it.
// The root walk itself is `../repo-root.ts`, shared with the one other rule
// that reads the tree.
let index: FileIndex | undefined;
let root = "";
function fileIndex(): FileIndex {
  if (index === undefined) {
    root = repoRoot();
    index = indexRepo(root);
  }
  return index;
}

const fileText = new Map<string, string>();
function textOf(relPath: string): string {
  const cached = fileText.get(relPath);
  if (cached !== undefined) {
    return cached;
  }
  let text = "";
  try {
    text = readFileSync(join(root, relPath), "utf8");
  } catch {
    text = "";
  }
  fileText.set(relPath, text);
  return text;
}

/** The single file that DEFINES `symbol`, when there is exactly one — the destination the message names. */
const destinations = new Map<string, string | null>();
function definitionSite(symbol: string): string | null {
  const cached = destinations.get(symbol);
  if (cached !== undefined) {
    return cached;
  }
  const declared = new RegExp(
    `\\b(?:function|const|let|var|class|type|interface|enum)\\s+${symbol.replaceAll("$", "\\$")}\\b`,
  );
  const hits: string[] = [];
  for (const path of fileIndex().paths) {
    if (SOURCE_FILE.test(path) && declared.test(textOf(path))) {
      hits.push(path);
    }
  }
  const only = hits.length === 1 ? (hits[0] ?? null) : null;
  destinations.set(symbol, only);
  return only;
}

/**
 * How many SHIPPED source files mention `symbol` at all — the gate on the
 * extensionless arm reads this. Counted over the rule's own scope and not the
 * whole index for the reason the scope note below gives: `tools/**` keeps a
 * past-tense census of symbols the tree no longer has, and a census entry is
 * not the tree still using the symbol.
 */
const mentions = new Map<string, number>();
function mentionCount(symbol: string): number {
  const cached = mentions.get(symbol);
  if (cached !== undefined) {
    return cached;
  }
  const used = new RegExp(`\\b${symbol.replaceAll("$", "\\$")}\\b`);
  let count = 0;
  for (const path of fileIndex().paths) {
    if (path.startsWith("packages/") && SOURCE_FILE.test(path) && used.test(textOf(path))) {
      count += 1;
    }
  }
  mentions.set(symbol, count);
  return count;
}

/** A wrapped JSDoc citation is one token: strip the leading `*` of each line and join with a space. */
function normalize(comment: ESTree.Comment): string {
  return comment.value
    .split("\n")
    .map((line) => line.replace(/^\s*\*/, "").trim())
    .join(" ");
}

/** Globs (`**\/*.test.ts`) and suffix fragments (`.shimmed.test.tsx`) are not citations of a file. */
function isFragment(text: string, match: RegExpExecArray): boolean {
  const before = match.index === 0 ? "" : text.charAt(match.index - 1);
  return match[0].includes("*") || before === "*" || before === ".";
}

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function onlyFile(candidates: readonly string[]): string | undefined {
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** A citation that carries its own extension resolves by basename, so a colocation move is not a miss. */
function citedFile(cited: string): string | undefined {
  return onlyFile(fileIndex().byBasename.get(basenameOf(cited)) ?? []);
}

/** An extensionless name is tried as each module extension, and must still land on exactly one file. */
function citedModule(name: string): string | undefined {
  return onlyFile(
    MODULE_EXTENSIONS.flatMap((extension) => fileIndex().byBasename.get(name + extension) ?? []),
  );
}

export default defineRule({
  meta: {
    type: "suggestion",
    messages: {
      missingFile:
        "`{{citation}}` does not exist in this repo. A filename in a comment reads as authoritative and nobody opens it — cite the file that is there, or drop the pointer.",
      symbolNotInFile:
        "`{{symbol}}` is not in `{{file}}` — {{destination}}. A comment that names where a symbol lives is a claim the reader will not check, so it has to name the file that defines it.",
    },
  },
  createOnce(context) {
    return {
      // `context.sourceCode` is unreachable from `createOnce` (oxlint 1.80.0
      // throws), so the whole rule hangs off the `Program` visitor.
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = normalize(comment);
          reportMissingFiles(context, comment, text);
          reportMisplacedSymbols(context, comment, text);
        }
      },
    };
  },
});

function reportMissingFiles(context: Context, comment: ESTree.Comment, text: string): void {
  const seen = new Set<string>();
  const resolvers = [
    {
      pattern: TEST_FILE_CITATION,
      exists: (token: string) => fileIndex().byBasename.has(basenameOf(token)),
    },
    { pattern: PACKAGE_PATH_CITATION, exists: (token: string) => fileIndex().paths.has(token) },
  ];
  for (const { pattern, exists } of resolvers) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      const token = match[0];
      if (isFragment(text, match) || seen.has(token) || exists(token)) {
        continue;
      }
      seen.add(token);
      context.report({
        loc: comment.loc,
        messageId: "missingFile",
        data: { citation: token },
      });
    }
  }
}

function reportMisplacedSymbols(context: Context, comment: ESTree.Comment, text: string): void {
  // One body, three spellings: they differ only in which end of the claim they
  // capture, how the cited half resolves to a file, and whether the message has
  // to be able to name a destination.
  const spellings = [
    {
      pattern: SYMBOL_HOME_CITATION,
      symbolGroup: 1,
      fileGroup: 2,
      resolve: citedFile,
      gated: false,
    },
    {
      pattern: POSSESSIVE_HOME_CITATION,
      symbolGroup: 2,
      fileGroup: 1,
      resolve: citedFile,
      gated: false,
    },
    {
      pattern: MODULE_HOME_CITATION,
      symbolGroup: 2,
      fileGroup: 1,
      resolve: citedModule,
      gated: true,
    },
  ];
  for (const { pattern, symbolGroup, fileGroup, resolve, gated } of spellings) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      reportIfMisplaced(context, comment, match[symbolGroup], match[fileGroup], resolve, gated);
    }
  }
}

function reportIfMisplaced(
  context: Context,
  comment: ESTree.Comment,
  symbol: string | undefined,
  cited: string | undefined,
  resolve: (cited: string) => string | undefined,
  gated: boolean,
): void {
  if (symbol === undefined || cited === undefined) {
    return;
  }
  // A missing or ambiguous target is arm A's business or nobody's: this arm
  // only ever checks a symbol against the ONE file the comment names.
  const target = resolve(cited);
  if (target === undefined) {
    return;
  }
  if (new RegExp(`\\b${symbol.replaceAll("$", "\\$")}\\b`).test(textOf(target))) {
    return;
  }
  const home = definitionSite(symbol);
  // The extensionless spelling reports only when the message can name something
  // definite: a unique home, or a symbol the tree never mentions.
  if (gated && home === null && mentionCount(symbol) !== 0) {
    return;
  }
  context.report({
    loc: comment.loc,
    messageId: "symbolNotInFile",
    data: {
      symbol,
      file: cited,
      destination: home === null ? "nothing in the tree defines it" : `it is in \`${home}\``,
    },
  });
}
