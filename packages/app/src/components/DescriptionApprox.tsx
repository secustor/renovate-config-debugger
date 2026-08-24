import { approximateTitle } from "@/lib/description-approx";

/**
 * Roadmap 069: the shared marks for the engine's *approximate* attribution —
 * one `≈`, one caveat paragraph, one wording (`description-approx.ts`).
 *
 * The engine self-checks its positional replay against Renovate's own resolved
 * array, and where the two disagree it degrades the subtree to its enclosing
 * node rather than guessing a leaf (069 PR 1). Every surface that renders an
 * attribution therefore has to render that caveat too — the Overview's "What
 * this config does" card here, the Effective config's per-string blame ledger a
 * layer up (PR 3), the preset tree's inline descriptions after it (PR 4).
 *
 * They must say the SAME thing: a reader who learns what `≈` means on one
 * surface must not meet a differently-worded hedge on the next, and a wording
 * that drifts in one copy is a wording that lies in the other. Hence one module
 * both surfaces import, and one `desc-approx-*` CSS family behind it.
 */

/**
 * The standalone `≈`, for a row that has no leaf label to prefix.
 *
 * Not an optional flourish: {@link DegradedCaveat} promises that every
 * untraceable sentence is marked, and a row whose attribution is the root node
 * or one of the tree-less layers has no label to carry the mark — without this
 * it would read as confidently attributed while being exactly the case the
 * caveat is about.
 */
export function ApproximateMark({ name }: { name?: string }) {
  return (
    <span className="desc-approx-mark" title={approximateTitle(name)}>
      <span aria-hidden="true">≈</span>
      <span className="visually-hidden">approximate attribution</span>
    </span>
  );
}

/** The paragraph a degraded run carries, wherever attributions are listed. */
export function DegradedCaveat() {
  return (
    <p className="desc-approx-caveat">
      Some sentences could not be traced to the exact preset that wrote them — those are marked with
      the enclosing preset and a <code>≈</code>. The wording and the order are still Renovate’s own.
    </p>
  );
}
