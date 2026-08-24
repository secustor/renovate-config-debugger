import type { TreeSummary } from "@/lib/preset-tree-stats";
import { ExplainedText } from "@/components/glossary";
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
      label: `${pluralWord(summary.options, "option")} set`,
      value: summary.options,
    },
    { key: "statRules", label: pluralWord(summary.rules, "rule"), value: summary.rules },
    { key: "statDepth", label: "depth", value: summary.maxDepth },
    {
      key: "statDuplicates",
      label: pluralWord(summary.duplicates, "repeat occurrence"),
      value: summary.duplicates,
    },
    { key: "statErrors", label: pluralWord(summary.errors, "error"), value: summary.errors },
  ];
  return (
    <div className="preset-summary">
      {bits.map((b) => (
        <ExplainedText
          key={b.key}
          entry={GLOSSARY[b.key]}
          className="preset-summary-stat explained"
        >
          <strong>{nf.format(b.value)}</strong> {b.label}
        </ExplainedText>
      ))}
    </div>
  );
}
