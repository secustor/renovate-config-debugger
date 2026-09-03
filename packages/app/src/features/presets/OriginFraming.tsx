import type { PresetNode } from "@renovate-config-debugger/engine";
import type { TreeStats } from "@/lib/preset-tree-stats";
import { Term } from "@/components/glossary";
import { PresetName } from "@/components/PresetName";
import { nf, plural } from "@/lib/format";

/**
 * Roadmap 016: honest origin framing for the headline preset count (persona
 * study finding 6 — "Resolved 1076 preset(s)" reads as "did I break
 * something?" with no origin attached). Purely a derivation of the already-
 * computed per-node stats, never a re-walk; never claims precision it doesn't
 * have (a dominant contributor is only named when it is a clear majority).
 *
 * The share is `uniquePresets`, deduplicated per name exactly as
 * `summary.resolved` is, so the contributions sum to the headline total —
 * `descResolved` counts occurrences and would let a repeated subtree print a
 * "majority" larger than the whole.
 */
export function OriginFraming({ root, stats }: { root: PresetNode; stats: TreeStats }) {
  const roots = root.children;
  const total = stats.summary.resolved;
  if (roots.length === 0 || total <= 1) {
    return null;
  }
  const contributions = roots
    .map((child) => ({
      nodeId: child.id,
      name: child.name,
      count: stats.statsById.get(child.id)?.uniquePresets ?? 0,
    }))
    .toSorted((a, b) => b.count - a.count);
  const top = contributions[0];

  const [onlyRoot] = roots;
  if (roots.length === 1 && onlyRoot) {
    return (
      <p className="origin-framing">
        Your <Term id="extends">extends</Term> entry{" "}
        <PresetName name={onlyRoot.name} nodeId={onlyRoot.id} /> expands to{" "}
        {plural(total, "preset")}.
      </p>
    );
  }

  // Only named when it is a clear majority — narrowed to the contribution
  // itself (not a boolean) so the JSX below reads it without an assertion.
  const majority = top && top.count > 1 && top.count / total > 0.5 ? top : null;
  return (
    <p className="origin-framing">
      Your {nf.format(roots.length)} <Term id="extends">extends</Term> entries expand to{" "}
      {plural(total, "preset")}
      {majority ? (
        <>
          , mostly via <PresetName name={majority.name} nodeId={majority.nodeId} /> (
          {nf.format(majority.count)})
        </>
      ) : null}
      .
    </p>
  );
}
