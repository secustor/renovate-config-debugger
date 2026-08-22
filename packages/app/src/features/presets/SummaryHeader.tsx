import type { TreeSummary } from "@/lib/preset-tree-stats";
import { Explained } from "@/components/glossary";
import { GLOSSARY } from "@/data/glossary-data";
import { nf, pluralWord } from "@/lib/format";

/**
 * Roadmap 016: the counter strip gets the same hover-card treatment the stage
 * pills already have (persona study finding 6) instead of a plain `title`
 * tooltip, plus grammatically-correct singular/plural labels (was always "N
 * duplicates" etc. even at N=1).
 */
export function SummaryHeader({ summary }: { summary: TreeSummary }) {
  const bits: { key: keyof typeof GLOSSARY; label: string; value: number }[] = [
    { key: "statPresets", label: pluralWord(summary.resolved, "preset"), value: summary.resolved },
    { key: "statFetched", label: "fetched", value: summary.fetched },
    { key: "statInternal", label: "internal", value: summary.internal },
    {
      key: "statOptionsSet",
      label: `option${summary.options === 1 ? "" : "s"} set`,
      value: summary.options,
    },
    { key: "statRules", label: pluralWord(summary.rules, "rule"), value: summary.rules },
    { key: "statDepth", label: "depth", value: summary.maxDepth },
    {
      key: "statDuplicates",
      label: `repeat occurrence${summary.duplicates === 1 ? "" : "s"}`,
      value: summary.duplicates,
    },
    { key: "statErrors", label: pluralWord(summary.errors, "error"), value: summary.errors },
  ];
  return (
    <div className="preset-summary">
      {bits.map((b) => (
        <Explained key={b.key} entry={GLOSSARY[b.key]}>
          {(handlers) => (
            <span className="preset-summary-stat explained" tabIndex={0} {...handlers}>
              <strong>{nf.format(b.value)}</strong> {b.label}
            </span>
          )}
        </Explained>
      ))}
    </div>
  );
}
