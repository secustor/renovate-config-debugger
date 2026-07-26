# Vite project structure & component decomposition — research report (2026-07-26)

Commissioned to guide the app package's folder layout and the decomposition of
oversized components (`RuleSimulator.tsx` at ~2,800 lines, `PresetTree.tsx` at
~1,300). Multi-source, adversarially verified (25 claims checked with 3-vote
verification; 20 confirmed, 5 refuted — refuted ones listed at the end so we
don't relearn them).

## 1. Folder architecture — hybrid feature-based wins

**The converged 2024–2026 recommendation** (bulletproof-react, Feature-Sliced
Design, React Handbook, Wieruch — independently) is a hybrid: keep generic,
reusable code in shared type-based root folders (`components/`, `hooks/`,
`lib/`, `stores/`, `types/`, `utils/`) **plus** a `features/` directory where
each feature colocates its own `api/components/hooks/stores/types` — including
only the subfolders it actually needs. Pure type-based organization is not what
current guides prescribe for larger apps — but the stronger claim that
type-based "only works for very small projects" was **refuted** (0-3): it
remains legitimate at small-to-medium scale.
Sources: https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md ·
https://reacthandbook.dev/project-standards ·
https://www.robinwieruch.de/react-folder-structure/

**Feature-Sliced Design** is the formalized version: layers (architectural
tiers) → slices (feature boundaries) → segments, with a strict import rule —
a module may only import from layers strictly below it. Verified against the
primary source, but whether the full FSD layer hierarchy pays off for a
small-to-medium single-app codebase survived only as an open question; the
simpler bulletproof-react `features/` + shared layout is the safer default at
this scale.
Source: https://feature-sliced.design/ (docs/reference/layers)

**Structure should evolve in stages**, not be adopted maximally upfront:
single file → multiple files → component folders → technical folders →
feature folders → domain grouping → monorepo with multiple apps sharing
packages (medium confidence — single source, Wieruch, updated 2026-05).
Monorepo is the *final* stage of the same progression, which this repo already
occupies (pnpm workspace, `engine`/`app`/`worker`).

**Known weakness of type-subfolders *inside* features** (medium confidence,
2-1 vote): when a component and its hook are tightly coupled, sorting them
into `components/` and `hooks/` splits what belongs together — colocating the
pair side by side beats strict type-sorting within a feature.
Source: https://sandroroth.com/blog/project-structure/

## 2. Shared vs feature-local — the promotion rule

- **Start feature-local; promote on the second consumer.** Verbatim (Wieruch):
  if exactly one feature uses a util, it lives inside that feature; once two
  or more need it, it moves up to the shared layer.
- **No cross-feature imports.** bulletproof-react: "compose different features
  at the application level" instead. FSD's layer rule independently
  corroborates the unidirectional `app → features → shared` flow.
- **Enforceable mechanically** with ESLint `import/no-restricted-paths`
  (bulletproof-react ships concrete configs).

Sources: bulletproof-react project-structure docs ·
https://www.robinwieruch.de/react-folder-structure/ ·
https://feature-sliced.design/docs/guides/issues/cross-imports

## 3. Decomposing large components

**Custom-hook extraction is the officially sanctioned first move**
(react.dev): wrap Effects and stateful logic in custom hooks so the component
expresses *intent* rather than implementation. Reuse is **not** a
prerequisite — a single-use hook extracted for clarity is legitimate. The
concrete, checkable signal: a long run of `useState`/`useEffect` calls at the
top of the component.
Sources: https://react.dev/learn/reusing-logic-with-custom-hooks ·
https://codescene.com/blog/refactoring-components-in-react-with-custom-hooks

**Two hard constraints** (primary source, react.dev, verbatim):

1. "Custom Hooks let you share stateful logic but **not state itself**. Each
   call to a Hook is completely independent." State shared between
   subcomponents split out of a large component must still be lifted up and
   passed down (or moved to context / an external store) — hooks alone can't
   carry it.
2. Anti-criterion: "You don't need to extract a custom Hook for every little
   duplicated bit of code. Some duplication is fine." Generic lifecycle
   wrappers (`useMount`, `useEffectOnce`) are explicitly marked *avoid*;
   prefer concrete hooks named after use cases.

**No numeric threshold survived verification.** The ">5 lines of logic before
`return` is a code smell" heuristic was refuted 0-3. Judge by cohesion (a
nameable concept), not line counts.

**Evidence gap:** container/presenter and compound-component patterns produced
no surviving claims — hook extraction is over-represented among techniques by
evidence availability, not necessarily merit.

## 4. Barrel files with Vite — avoid inside the app

**Official Vite guidance** ("Avoid Barrel Files", vite.dev/guide/performance):
importing a single API from a barrel forces Vite to fetch and transform
*every* re-exported file (any may contain the API or side effects), slowing
dev-server page loads. Recommended alternative: import directly from the
source module. bulletproof-react independently drops barrels (tree-shaking +
performance). Corroborating measurement: a 4K-LOC app transformed 11,798
modules with barrel imports vs 1,188 without (blog.vramana.com).
Sources: https://vite.dev/guide/performance ·
https://github.com/vitejs/vite/issues/16100

**Notably refuted (0-3):** "barrels are fine as a deliberate public API for a
feature." Within app source, direct imports win outright.

**Scope caveats:** the documented cost is the dev-server crawl; build-time
tree-shaking is Rollup's domain. Rolldown-based Vite may reduce (not yet
eliminate) the cost. The corpus contained nothing on pnpm-workspace package
boundaries, where `package.json` `exports` effectively *are* barrels — an
engine-style curated entry point is a package API surface, a different animal
from intra-app convenience barrels, and this research does not condemn it.

## 5. Open questions the research could not settle

- Criteria for cutting pnpm-workspace package boundaries (engine vs app), and
  how workspace `exports` interact with the no-barrel guidance.
- When container/presenter or compound components beat hook extraction.
- Preferred state-sharing mechanism after a split (lifted props vs context vs
  external store) — hooks alone cannot share state.
- Whether full FSD pays off below large-team scale.

## 6. Refuted claims (do not cite)

| Claim | Vote |
| --- | --- |
| Barrels are good practice as a deliberate feature public API | 0-3 |
| Type-based layout only works for very small projects | 0-3 |
| FSD's full hierarchy scales better than alternatives (as stated) | 0-3 |
| >5 lines of pre-`return` logic = code smell → extract hook | 0-3 |
| CodeScene's measurable-maintainability framing of hook extraction | 1-2 |

## Application to this repo (assessment, 2026-07-26)

Current state: `packages/app/src` is type-based (`components/` ×38 files flat,
`hooks/`, `lib/`, `data/`, `platform/`); `packages/engine` is domain-organized
with one curated `index.ts` consumed as the package's public API (fine — that
is a package boundary, not an intra-app barrel; the app's own folders have no
barrels, which matches guidance). The monorepo split already matches the
end-stage of the evolutionary model.

What the findings imply, in order of leverage:

1. **`RuleSimulator.tsx` (~2,800 lines) → a feature folder**, e.g.
   `src/features/simulator/` holding `RuleSimulator.tsx` plus colocated
   extractions: custom hooks for the nameable stateful concerns (form state +
   derivation, simulation execution, drawer/step/share-link state) and
   feature-local subcomponents already living inside the file
   (`SimVerdictBlock`, `MergeStop`, the form grid). Shared state stays lifted
   in the top component — hooks don't carry it. Colocate each hook next to
   the component that uses it rather than a `hooks/` subfolder (§1 weakness).
2. **`PresetTree.tsx` (~1,300 lines)** — same treatment when next touched.
3. **Shared layer stays where it is**: `SequenceTimeline`, `SummaryDrawer`,
   `StepThrough`, `JsonDiff`, `CopyButton`, `ProvenanceChip`, glossary — all
   have ≥2 consumers, exactly what `components/` is for. Everything
   single-consumer follows the promotion rule (feature-local until a second
   consumer appears).
4. **No new barrels** inside `packages/app/src`; keep importing shared modules
   directly. The engine's `index.ts` stays.
5. Optional enforcement once a `features/` layer exists: oxlint/ESLint
   import-restriction for `app → features → shared`.

Migration honors the evolutionary principle: introduce `features/` only as
files are touched (simulator first), not as a big-bang reshuffle.
