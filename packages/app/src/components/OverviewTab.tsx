import type { ReactNode } from "react";
import type { ResultsTabId } from "../results-tabs";

const nf = new Intl.NumberFormat();

/** The numbers the Overview reports — the same ones the tab badges show. */
export interface RunStats {
  rewrites: number;
  presets: number;
  /** null while the effective-config view is still computing provenance. */
  effective: number | null;
  errors: number;
  warnings: number;
}

interface StatItem {
  key: string;
  tab: ResultsTabId;
  text: string;
  tone?: "error" | "warn";
}

function plural(n: number, word: string): string {
  return `${nf.format(n)} ${word}${n === 1 ? "" : "s"}`;
}

function problemsStat(stats: RunStats): StatItem {
  if (stats.errors > 0 && stats.warnings > 0) {
    return {
      key: "problems",
      tab: "problems",
      text: `${plural(stats.errors, "error")}, ${plural(stats.warnings, "warning")}`,
      tone: "error",
    };
  }
  if (stats.errors > 0) {
    return {
      key: "problems",
      tab: "problems",
      text: plural(stats.errors, "error"),
      tone: "error",
    };
  }
  if (stats.warnings > 0) {
    return {
      key: "problems",
      tab: "problems",
      text: plural(stats.warnings, "warning"),
      tone: "warn",
    };
  }
  return { key: "problems", tab: "problems", text: "no problems", tone: undefined };
}

/**
 * Roadmap 028: the placeholder run summary — a plain stat line whose numbers
 * are exactly the tab badges', each one a link into the tab that explains it.
 * Roadmap 029 replaces THIS component with the plain-English digest; nothing
 * else in the Overview tab needs to change when it does.
 */
export function RunStatLine({
  stats,
  onOpen,
}: {
  stats: RunStats;
  onOpen: (tab: ResultsTabId) => void;
}) {
  const items: StatItem[] = [
    {
      key: "rewrites",
      tab: "rewrites",
      text: stats.rewrites === 0 ? "no rewrites" : plural(stats.rewrites, "rewrite"),
    },
    { key: "presets", tab: "presets", text: `${plural(stats.presets, "preset")} resolved` },
    {
      key: "effective",
      tab: "effective",
      // Provenance is computed asynchronously; never guess a number that is
      // not known yet.
      text:
        stats.effective === null
          ? "counting effective options…"
          : `${plural(stats.effective, "effective option")}`,
    },
    problemsStat(stats),
  ];
  return (
    <p className="run-stat-line">
      {items.map((item, i) => (
        <span key={item.key}>
          {i > 0 ? <span className="run-stat-sep"> · </span> : null}
          <button
            type="button"
            className={`run-stat${item.tone ? ` ${item.tone}` : ""}`}
            onClick={() => onOpen(item.tab)}
          >
            {item.text}
          </button>
        </span>
      ))}
    </p>
  );
}

/** The three question pills that route to the instrument answering them. */
function QuestionPills({
  onWhereFrom,
  onDependency,
  onStages,
}: {
  onWhereFrom: () => void;
  onDependency: () => void;
  onStages: () => void;
}) {
  return (
    <div className="q-row">
      <p className="q-label">Dig in with a question:</p>
      <div className="q-links">
        <button type="button" className="q-link" onClick={onWhereFrom}>
          Where did a setting come from?
        </button>
        <button type="button" className="q-link" onClick={onDependency}>
          What happens to one of my dependencies?
        </button>
        <button type="button" className="q-link" onClick={onStages}>
          What did each stage change?
        </button>
      </div>
    </div>
  );
}

export function OverviewTab({
  stats,
  banner,
  onOpen,
  onWhereFrom,
}: {
  stats: RunStats;
  /** The 023 hypothetical-run banner, when validation reported errors. */
  banner?: ReactNode;
  onOpen: (tab: ResultsTabId) => void;
  /** Opens Effective config AND focuses its filter input. */
  onWhereFrom: () => void;
}) {
  return (
    <div className="overview-tab">
      {banner}
      <RunStatLine stats={stats} onOpen={onOpen} />
      <QuestionPills
        onWhereFrom={onWhereFrom}
        onDependency={() => onOpen("simulator")}
        onStages={() => onOpen("pipeline")}
      />
    </div>
  );
}
