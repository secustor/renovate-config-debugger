import type { PresetNode } from "@renovate-config-debugger/engine";
import type { TreeStats } from "@/lib/preset-tree-stats";
import { Term } from "@/components/glossary";
import { PresetName } from "@/components/PresetName";
import { nf } from "@/lib/format";

/**
 * Roadmap 016: honest origin framing for the headline preset count (persona
 * study finding 6 — "Resolved 1076 preset(s)" reads as "did I break
 * something?" with no origin attached). Purely a derivation of the already-
 * computed per-node stats, never a re-walk; never claims precision it doesn't
 * have (a dominant contributor is only named when it is a clear majority).
 */
export function OriginFraming({ root, stats }: { root: PresetNode; stats: TreeStats }) {
  const roots = root.children;
  const total = stats.summary.resolved;
  if (roots.length === 0 || total <= 1) {
    return null;
  }
  const contributions = roots
    .map((child) => {
      const st = stats.statsById.get(child.id);
      const selfResolved = child.state === "resolved" ? 1 : 0;
      return { nodeId: child.id, name: child.name, count: (st?.descResolved ?? 0) + selfResolved };
    })
    .toSorted((a, b) => b.count - a.count);
  const top = contributions[0];

  const [onlyRoot] = roots;
  if (roots.length === 1 && onlyRoot) {
    return (
      <p className="origin-framing">
        Your <Term id="extends">extends</Term> entry{" "}
        <PresetName name={onlyRoot.name} nodeId={onlyRoot.id} /> expands to {nf.format(total)}{" "}
        preset{total === 1 ? "" : "s"}.
      </p>
    );
  }

  // Only named when it is a clear majority — narrowed to the contribution
  // itself (not a boolean) so the JSX below reads it without an assertion.
  const majority = top && top.count > 1 && top.count / total > 0.5 ? top : null;
  return (
    <p className="origin-framing">
      Your {nf.format(roots.length)} <Term id="extends">extends</Term> entries expand to{" "}
      {nf.format(total)} preset{total === 1 ? "" : "s"}
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
