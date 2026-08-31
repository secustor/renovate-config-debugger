# 091 — Starter pins, derived from the config's own rules

Milestone: M21 · Status: done · Design: Claude Design project "Renovate Config
Debugger", artboard `Landing Transition.dc.html`, Turn 5 / beat 5a
("Settled") · Revisits one [075](075-v2-integrated-shell.md) non-goal.

## The ask

The landing transition's last beat: the run settles, the shell docks, "the
Tests pane slides in with two starter pins derived from the config's own
rules". The pane's promise — _these are the updates I care about, tell me when
an edit changes what happens to them_ — reads as an instruction manual when
the list under it is empty, and the empty state answers "what is a pin"
without answering "now what". A starter answers it by example, in the reader's
own vocabulary: for
`packageRules: [{matchManagers:["npm"], matchUpdateTypes:["minor"], groupName:"npm minor"}, {matchUpdateTypes:["patch"], automerge:true}]`
the two cards that land say _grouped: npm minor_ and _automerge ✓_ — the
reader's own rules, firing, with nothing typed.

## 075's non-goal, revisited

[075](075-v2-integrated-shell.md) listed **"No seeded pins"** as an explicit
non-goal, and the owner has now adopted the design's beat. The reversal has to
answer 075's two reasons, and does:

- _"A pin the user did not ask for is a test they did not write."_ True, so it
  never claims to be one: the row wears a muted `starter` chip whose title is
  "Derived from your packageRules — swap in a real one". It is an offer with a
  verdict attached, not a test attributed to the reader.
- _"Every run would then re-check a descriptor they never chose."_ Only while
  they keep it. The × that removes a pin removes a starter (no special
  dismissal was built, deliberately), and removal is permanent for the
  session — the latch below is what makes deleting a starter stick.

The rest of 075's ruling stands: no expectation model (a starter records a
descriptor, not an assertion), and the ghost row is still the offer for
everything else. Neither [080](080-tests-succeed-the-simulator.md) nor
[082](082-final-tab-specs-deltas.md) ruled on seeded pins — 080 closed the
descriptor-LESS door into the detail view (a starter arrives with a
descriptor, so it is on the right side of that test) and 082's pin rulings are
about the Add-a-test card, not the list.

## Derivation (`features/simulator/starter-pins.ts`)

Input: the entries of the run's **resolved** `packageRules` that the REPO
config contributed — `computeRuleProvenance` (013) filtered to
`layer.kind === "repo"`. Resolved, because that is the array the simulator
evaluates against; filtered, because a starter derived from
`config:best-practices` would demonstrate a decision the reader never made.

One rule → one descriptor, under one law: **never guess.** A descriptor is
synthesized only when every matcher on the rule can be satisfied exactly; a
starter that does not fire the rule it came from teaches something false.

- **Satisfiable matchers** — `matchManagers`, `matchDatasources`,
  `matchPackageNames`, `matchDepNames`, `matchDepTypes`, `matchUpdateTypes`.
  Any other `match*` key on the rule (`matchCurrentVersion`,
  `matchSourceUrls`, `matchFileNames`, `matchRepositories`, …) disqualifies
  it. The allowlist is the honesty guarantee; it grows only when a matcher
  gains a form field that can satisfy it.
- **Values must be literal** — `react` yes; `@types/**`, `/^react/` and
  `!npm` no. A pattern describes a set and a starter has to be a member of it,
  which only a literal guarantees.
- **The ecosystem comes from the app's own quick-fills** (`QUICK_FILLS`), not
  a second sample table that could drift from them: `matchManagers: ["npm"]`
  becomes lodash in `package.json`, `dockerfile` becomes `node`, and so on. A
  rule naming only a datasource is paired with the manager of the quick-fill
  that carries it; one that cannot be paired (`matchDatasources: ["crate"]`)
  is skipped rather than pinned as a manager-less descriptor. A rule naming a
  manager we hold no sample for keeps the manager and takes a neutral
  `example-package 1.2.3`. A rule naming no ecosystem at all takes npm — the
  first quick-fill, the one the reader has already seen.
- **The version move implies the update type.** `matchUpdateTypes` picks the
  first of major/minor/patch it names; the sample's own pair is reused when it
  is already that kind (`4.17.20 → 4.17.21` IS a patch), otherwise the pair is
  synthesized by moving that segment and resetting what is below it
  (`4.17.20 → 4.18.0`). A version that cannot express the move is a skip, not
  an invention: `20-alpine` has no minor, so
  `{matchManagers:["dockerfile"], matchUpdateTypes:["minor"]}` yields nothing.
  An update type no version pair implies (`lockFileMaintenance`, `pin`,
  `digest`, …) is a skip for the same reason.
- **A rule with no matchers is skipped** — it fires on every update, so
  whatever else lands already exercises it, and a descriptor for it would be
  arbitrary.
- **Two, from distinct rules, deduplicated** — rules are walked in merge
  order, identical descriptors (two rules that describe the same update)
  collapse, and the first two survivors win. Zero is a normal outcome: no own
  rules, or none satisfiable, means no starters and the existing empty state
  stays exactly as it was.

## Seeding, and the latch (`app/use-starter-pins.ts` + `use-pinned-run.ts`)

The shell computes, the feature draws: the derivation is the simulator
slice's, the decision to seed is the app layer's, next to the run-settle
handling it belongs with.

Seeding is attempted **once**, on the first run that settles with a
`finalConfig` and resolved rule provenance (`undefined` is "still computing"
and waits; `null` is "unavailable" and counts as an attempt that derived
nothing). It happens only into a list **nothing has touched** — the latch
(`pinsTouchedRef`, inside `usePinnedRun`) trips on:

- a pin added, by any channel;
- a pin removed — this is the one that makes deletion stick: the list is empty
  again but it is not untouched, and re-seeding would undo the gesture;
- a share link that **installed** pins;
- the seeding itself, whether or not it derived anything.

Consequences, stated: editing the config and re-running never re-seeds; a
reader who keeps the starters has them re-evaluated on every run like any pin
(they go through `addPin`'s own list, so `usePinnedTests` cannot tell them
apart, which is the point); and a link that carried no pins does NOT trip the
latch — that is someone else's config on this reader's screen, which is
precisely the case the starters were written for.

## The share-link ruling: starters are left behind

`pinsAsShareFields` filters `starter` pins out of the payload. They are not
the sharer's tests — they are what this app made up from the config the link
already carries — so the opener's own first run derives them again, from the
same rules, marked as starters there too. Sharing them would hand someone
else's reader two authored-looking pins nobody wrote, and would then need a
rule for what the flag means on arrival. The alternative (share them as plain
pins) loses the chip and gains the exact confusion 075 objected to, one
session removed. The `starter` flag therefore never enters the codec: nothing
in `share.ts` changes, and a link built from a starters-only session simply
carries no `pins` — which the opener's own seeding fills in.

## Deltas

- `types/simulator.ts` — `PinnedTest.starter?: boolean` (optional: absent on
  every pin a reader or a link made).
- `features/simulator/starter-pins.ts` — the derivation, pure and DOM-free.
- `app/use-starter-pins.ts` — when to seed; consumes `useRuleProvenance`,
  which App already mounts for the message cross-links, so no second replay.
- `app/use-pinned-run.ts` — `seedStarterPins`, the latch, and the share
  filter.
- `PinHeadRow`/`PinCard` — the `starter` chip, on the pin row's head beside
  the name. `.pin-starter` is muted and outlined (tokens only): a starter is a
  suggestion the app made, so it must never read as a status the run reported
  — the dot beside it is the only thing on that row that does.
- `PinsView` / `EmptyTestsCard` doc comments: "no pin is ever created for the
  reader" was 075's rule and is now qualified rather than deleted.

## Verification

- `features/simulator/starter-pins.test.ts` — the design's two rules produce
  the design's two pins; the rule's own package/depType/datasource are
  carried; the neutral fallback; the skip list (unsatisfiable matcher,
  glob/regex/negated value, unpairable datasource, non-version update type,
  matcher-less rule, non-object); `nextVersion`'s moves and its refusals; and
  `deriveStarterPins`' two-max, distinct-rules, dedupe and empty cases.
- `app/use-pinned-run.test.tsx` — the latch ledger: seeds once into an
  untouched list with `starter: true`; no seeding after an add or a remove;
  an empty derivation still trips it; a link with pins stands the seeding
  down and a link without pins does not; starters are absent from
  `pinsAsShareFields`.
- `app/use-starter-pins.test.tsx` — the trigger's own two decisions: a
  preset's rule is not derived from (provenance filter), nothing is attempted
  while provenance is `undefined`, and an unavailable (`null`) provenance
  still counts as the one attempt.
- `features/simulator/PinHeadRow.test.tsx` — the chip and its title on a
  starter, nothing on a pin the reader made.
- The existing `TestsPanel.shimmed.test.tsx` is untouched: it drives the panel
  with App's pins as props, and seeding is above it.
- e2e `21-pinned-tests.spec.ts` gains the whole loop in a real browser: the
  starter appears for `PACKAGE_RULES_CONFIG`, wears the chip, carries the
  run's own verdict (`automerge ✓`), survives a re-run, and does NOT come back
  after the × plus another run. Three specs whose subject is the empty list or
  their own pin's count clear it first through a new
  `clearStarterPins(page)` helper (04-simulator, 11-tabbed-shell's tab-alias
  case, 21's first case) — the helper waits for the starter before removing
  it, so a `toHaveCount(0)` cannot pass ahead of the seeding. Full suite green
  (129).
