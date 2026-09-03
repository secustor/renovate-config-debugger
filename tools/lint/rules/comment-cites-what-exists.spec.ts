import { ruleTester } from "../rule-tester.ts";
import rule from "./comment-cites-what-exists.ts";

// Every citation below is resolved against the REAL tree — the rule's index is
// this repo — so each case names a file (or a symbol's home) that is genuinely
// there or genuinely not, and the case dies when the tree moves under it.
ruleTester.run("comment-cites-what-exists", rule, {
  valid: [
    // ---- arm A escapes -------------------------------------------------
    // Resolved by BASENAME: the suite moved next to its module (no `test/`
    // dir), and a colocation move is not a missing file.
    "// the library is tested in `test/error-translations.test.ts`\nexport const a = 1;",
    // a `packages/` path that is exactly where it says it is
    "/**\n * Renders alongside `packages/app/src/components/MessagesPanel.tsx`.\n */\nexport const b = 2;",
    // THE `\\b` REGRESSION: `js` matches the head of `package.json` and leaves
    // `on` behind, which manufactured a `packages/engine/package.js` report out
    // of two real comments (e2e/fixtures.ts, engine/src/extract.ts).
    "// matches the pinned engine dependency (packages/engine/package.json)\nexport const c = 3;",
    "/** repo-relative path, e.g. `packages/app/package.json` */\nexport const d = 4;",
    // globs are not citations — the vitest project conventions, written out
    // verbatim in five config and coverage docblocks
    "// `test/*.node.test.ts` → golden (untouched renovate modules)\nexport const e = 5;",
    "// `src/**/*.test.ts` → the colocated suites of modules that need no shims\nexport const f = 6;",
    "// runs the engine's own `*.shimmed.test.ts` files\nexport const g = 7;",
    // a suffix fragment is a naming convention, not a file
    "// a `.shimmed.test.tsx` (no `x`) would run in the unit project\nexport const h = 8;",
    // an extension the arm does not resolve at all
    "// see `renovate.json` and `mise.toml`\nexport const i = 9;",
    // ---- arm B escapes -------------------------------------------------
    // the symbol is where the comment says it is
    "// wired the way `useTabDigits` in `use-tab-digits.ts` is\nexport const j = 10;",
    // DELIBERATE RECALL LOSS: `activeHide` appears in `RuleEvidenceCard.tsx`
    // only inside a comment. Plain text, not scope analysis — a mention counts
    // as present, which is the precision half of the trade.
    "// as `activeHide` in `RuleEvidenceCard.tsx` explains\nexport const k = 11;",
    // ambiguous basename (`helpers.ts` is both the engine's and the e2e one):
    // the arm only ever checks against ONE file, so it declines
    "// the save/restore dance `stubFetch` in `test/helpers.ts` owns\nexport const l = 12;",
    // a target that does not exist is arm A's business or nobody's
    "// `nowhereSymbol` in `no-such-module.ts`\nexport const m = 13;",
    // ---- arm B, the possessive spelling: escapes ------------------------
    // the symbol is where the possessive says it is (trusted-endpoint.ts:60,
    // verbatim) — `onEndpointChange` really is in App.tsx, twice
    "/**\n * see App.tsx's `onEndpointChange` / `blockedByLayerErrors`).\n */\nexport const n = 14;",
    // TESTS ARE IN SCOPE ON PURPOSE, and this is why (share.test.ts:441,
    // verbatim): a test docblock's possessive citation is checked like any
    // other, and this one is true.
    "/**\n * pure decision App.tsx's `loadShareToken` applies: which endpoints the run\n */\nexport const o = 15;",
    // AMBIGUOUS BASENAME, checked before the symbol ever is (vite-env.d.ts:37,
    // verbatim): two vite.config.ts files exist, so the arm declines. It would
    // have been a true negative anyway — `define` is in the app's five times.
    "/**\n * Roadmap 088 — the build identity injected by vite.config.ts's `define`.\n */\nexport const p = 16;",
    // THE PRECISION DEVICE: no backtick, no citation. Without this requirement
    // the possessive matches fifteen lines of ordinary prose in scope.
    "// the sign-in chip lives in App.tsx's chrome, not in this hook\nexport const q = 17;",
    // ASCII apostrophe only — the curly variant has zero hits in scope, so it
    // buys nothing and costs a second spelling to keep true.
    "// App.tsx\u2019s `signInRef` is the same lie in the other quote glyph\nexport const r = 18;",
    // DELIBERATELY NOT SHIPPED (sweep finding 29, 75684991, verbatim): a dotted
    // member path would have caught this one too, but no dotted possessive
    // exists in the tree, so the widening has no measured precision.
    "// lazily below the fold, inside App.tsx's `React.lazy` boundary\nexport const s = 19;",
    // SAME RECALL LOSS AS `activeHide`, in the possessive spelling (sweep
    // finding 37, e0a388b5, verbatim — the sweep fixed it by HAND). App.tsx has
    // carried a `jumpDisplacedFocus` mention in a comment since ca5b8a59, and a
    // mention counts as present: plain text, not scope analysis.
    "// rule lives in App.tsx's `jumpDisplacedFocus`, which is module-private and has\nexport const t = 20;",
    // a possessive whose file is nowhere is arm A's business or nobody's
    "// no-such-module.ts's `nowhereSymbol`\nexport const u = 21;",
    // ---- arm B, the extensionless spelling: escapes --------------------
    // THE MODULE HALF IS NEVER A BARE LOWERCASE WORD. Allowing one takes the
    // raw match count from 39 to 226 — ordinary prose that resolves by accident
    // against `types/*.ts`.
    "// the link's `node` is the row the reader clicked\nexport const v = 22;",
    "// the engine's `digest` is what the header line prints\nexport const w = 23;",
    // SAME PRECISION DEVICE AS THE ARM ABOVE: no backtick, no citation.
    "// every page-level key is gated on App's keysLive while the sheet is up\nexport const x = 24;",
    // the symbol is where the extensionless possessive says it is — and this is
    // the trailing-apostrophe spelling, which the sweep's own fixes write
    "// use-keyboard-landings' `keysLive` is the gate every page key reads\nexport const y = 25;",
    // …and the same possessive spelled as lowercase-leading camelCase is NOT in
    // the module half at all — the header says so, so this pins it: only
    // CamelCase or kebab-with-a-hyphen is read, and a would-be lie in this
    // spelling is silent rather than reported.
    "// useKeyboardLandings' `nowhereSymbol` is not a spelling this arm reads\nexport const ae = 31;",
    // AMBIGUOUS, checked before the symbol ever is: `rule-provenance.ts` is both
    // the app hook and the CLI projection, so the arm declines.
    "// rule-provenance's `nowhereSymbol` decides the row\nexport const z = 26;",
    // a module name that resolves to no file at all
    "// NoSuchModule's `keysLive` is the gate\nexport const aa = 27;",
    // THE GATE, both live silences, verbatim. `packageRules` is prose naming a
    // UI row: 151 files mention it and none is its unique home, so the message
    // could only say "not here, and I cannot tell you where".
    "/**\n * the `packageRules` array — EffectiveConfig's `packageRules` row is the\n * same list.\n */\nexport const ab = 28;",
    // THE SAME PLAIN-TEXT RECALL LOSS AS `activeHide`, and it costs this arm
    // one of the two findings it was built from: sweep V finding 26
    // (`app/use-focus-landing.ts:55` verbatim, fixed BY HAND in 2613e96e) cited
    // `App` for a function roadmap 086 had moved into `use-keyboard-landings`,
    // but App.tsx destructures the moved binding out of the hook, and a mention
    // counts as present.
    "/**\n * Exported since the ninth 068 review for App's `gestureWantsResultsLanding`,\n * which asks the same question of the same DOM.\n */\nexport const ad = 30;",
    // AND THE RECALL COST OF THE GATE, stated rather than hidden (RepoLoadForm.tsx:22,
    // verbatim): a REAL drift the gate silences, because `inheritAutoEdit` is
    // bound only by destructuring in `app/use-inherited-config-layer.ts` and no
    // declaration site can be named.
    "/**\n * 2026-07-26 — see App's `inheritAutoEdit`) plus the exact repo and file the\n */\nexport const ac = 29;",
    // ---- structurally out of reach: only comments are read ---------------
    'const p = "packages/app/src/nope.tsx";',
    'const q = ["fixtures/does-not-exist.test.ts"];',
  ],
  invalid: [
    // ---- arm A, the two shipped defects (a721e15f) ----------------------
    // `diffKeys` sent the reader to a tripwire in a file that never existed.
    {
      code: '// That is pinned by `simulate-package-rules.test.ts` ("diffKeys / key-order sensitivity").\nexport const a = 1;',
      errors: [{ messageId: "missingFile" }],
    },
    // The `error-translations` header named an app path in the wrong layer —
    // and named it on the SECOND line of the JSDoc, which is what the leading
    // `*` strip is for.
    {
      code: "/**\n * Renders ALONGSIDE the original message (see\n * `packages/app/src/components/MessagesPanel.tsx` /\n * `packages/app/src/components/RuleSimulator.tsx`), never instead of it.\n */\nexport const b = 2;",
      errors: [{ messageId: "missingFile" }],
    },
    // ---- arm A, the live defect this rule was landed with ---------------
    // `MessagesPanel.shimmed.test.tsx` cited a `test/` dir and a `.node.` infix
    // the engine suite has not had since it was colocated.
    {
      code: "/**\n * The translation library itself is tested in the engine\n * (test/error-translations.node.test.ts) — what this covers is the card.\n */\nexport const c = 3;",
      errors: [{ messageId: "missingFile" }],
    },
    // two citations, two reports
    {
      code: "// see `no-such-suite.test.ts` and `packages/app/src/gone.tsx`\nexport const d = 4;",
      errors: [{ messageId: "missingFile" }, { messageId: "missingFile" }],
    },
    // ---- arm B, the three shipped defects (7619e7bb) --------------------
    // `activeHide` moved to `hover-card-hooks.ts` when the hover card was
    // hoisted out of the glossary — and the citation WRAPS, which is the whole
    // reason the comment is normalized into one line before it is read.
    {
      code: "/**\n * which is also how the glossary keeps a single hover card (`activeHide` in\n * `components/glossary.tsx`).\n */\nexport const e = 5;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // `focusKey` went away when the state slot was reshaped (5a8d0d2e).
    {
      code: "// Defer the scroll until the commit where the body exists (same\n// pending-target idiom as `focusKey` in use-thread-nav.ts).\nexport const f = 6;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // `makeTokenHandler` exists nowhere in the repo — the destination half of
    // the message has to survive having no destination.
    {
      code: "/** `makeTokenHandler` (App.tsx) already keeps a bad value out of\n *  sessionStorage, but this is the actual use-time boundary. */\nexport const g = 7;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // ---- arm B, the two live defects this rule was landed with ----------
    {
      code: "// `useTabDigits` (App.tsx) is wired to `resultsTabs.length`.\nexport const h = 8;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    {
      code: "// The latest-ref pattern (as with `selectPresetNodeRef` in App.tsx) keeps\n// both registrations one-shot.\nexport const i = 9;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // the `from` and `at` spellings of the same claim
    {
      code: "// `noSuchExport` from `use-tab-digits.ts`\nexport const j = 10;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    {
      code: "// `noSuchExport` at `packages/app/src/app/App.tsx`\nexport const k = 11;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // ---- arm B possessive, the two live defects it was widened for ------
    // Both halves of `use-share-link`'s sign-in citation named `signInRef`,
    // which the repo has never defined anywhere — and both sat untouched
    // through the sweep whose whole job was citations. Verbatim, :163 and :436.
    {
      code: "/**\n *  See App.tsx's `signInRef` for why the sign-in path needs one at all. */\nexport const l = 12;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    {
      code: "// and only when a run existed to encode (App.tsx's `signInRef`).\nexport const m = 13;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // the possessive of a symbol that DOES exist, in a file that is not its
    // home: the destination half of the message has a destination to name
    {
      code: "// App.tsx's `jsonLiteral` is the one spelling of the wire format\nexport const n = 14;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // both spellings in one comment, two reports
    {
      code: "// `noSuchExport` in App.tsx, and App.tsx's `alsoNoSuchExport`\nexport const o = 15;",
      errors: [{ messageId: "symbolNotInFile" }, { messageId: "symbolNotInFile" }],
    },
    // ---- arm B extensionless, the shipped defect (2613e96e) -------------
    // Sweep V finding 27(c), `lib/input-schemas.ts:329` verbatim — the kebab
    // half of the matcher, and the zero-mention branch of the gate: the real
    // function is `parseRepoReference` in `lib/repo-reference.ts`, so nothing in
    // the shipped tree defines what this cites.
    {
      code: "// Repo-load input (use-repo-load's `parseRepoRef` result, before request building)\nexport const q = 17;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // ---- arm B extensionless, the live defects it was landed with -------
    // `keysLive` is `use-keyboard-landings.ts`'s, and four comments in three
    // trees said it was App's (ShortcutSheet.tsx:25 verbatim).
    {
      code: "/**\n * read), the same way every other page-level key is gated on App's `keysLive`.\n */\nexport const r = 18;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // StageRail.tsx:197 verbatim — and it named the right file in the very next
    // clause, which is how a possessive drifts without anyone noticing.
    {
      code: "/** An uninterrupted walk is 1.28 s at this pace; App's `LANDING_WALK_CAP_MS`\n *  (use-landing-walk.ts) must stay comfortably above it. */\nexport const s = 19;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // THE TRAILING-APOSTROPHE POSSESSIVE, the spelling the sweep's own fixes
    // introduced, resolved through the same index.
    {
      code: "// use-keyboard-landings' `LANDING_WALK_CAP_MS` paces the walk\nexport const t = 20;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // `.mjs` is in the extension list too — the app's build scripts are cited
    // the same way the modules are.
    {
      code: "// build-manifest's `keysLive` decides what the manifest lists\nexport const u = 21;",
      errors: [{ messageId: "symbolNotInFile" }],
    },
    // the extensionless and the extension-carrying spelling of two different
    // claims in one comment, two reports from two arms
    {
      code: "// App's `keysLive`, and App.tsx's `alsoNoSuchExport`\nexport const v = 22;",
      errors: [{ messageId: "symbolNotInFile" }, { messageId: "symbolNotInFile" }],
    },
  ],
});
