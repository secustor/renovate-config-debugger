import type { StageId, TraceResult } from "@renovate-config-visualizer/engine";
import { Explained, type GlossaryEntry } from "../glossary";

const STAGE_ORDER: StageId[] = [
  "global",
  "inherit",
  "parse",
  "migrate",
  "massage",
  "validate",
  "preset",
  "merge",
];

export const STAGE_LABELS: Record<StageId, string> = {
  global: "Global config",
  inherit: "Inherited config",
  parse: "Parse",
  migrate: "Migrate",
  massage: "Massage",
  validate: "Validate",
  preset: "Presets",
  merge: "Merge",
};

/** Plain-language card per stage — what Renovate does there, with docs. */
export const STAGE_EXPLAINERS: Record<StageId, GlossaryEntry> = {
  global: {
    name: "global config stage",
    plain:
      "Applies the bot-level settings a self-hosted administrator configured, including any globalExtends presets. Skipped unless you provide a global config under Advanced options.",
    url: "https://docs.renovatebot.com/self-hosted-configuration/",
  },
  inherit: {
    name: "inherited config stage",
    plain:
      "Applies org-level defaults shared across repositories (inheritConfig): validated, its presets resolved, and bot-only options stripped. Skipped unless you provide one under Advanced options.",
    url: "https://docs.renovatebot.com/self-hosted-configuration/#inheritconfig",
  },
  parse: {
    name: "parse stage",
    plain: "Reads your config file text and turns it into a configuration object.",
  },
  migrate: {
    name: "migrate stage",
    plain:
      "Rewrites deprecated options to their current names and shapes — the same rewriting Renovate applies (or proposes as a config-migration PR) on every real run.",
    url: "https://docs.renovatebot.com/config-migration/",
  },
  massage: {
    name: "massage stage",
    plain:
      "Normalizes allowed shorthand into the full form Renovate works with internally — for example a single string where a list is expected.",
  },
  validate: {
    name: "validate stage",
    plain:
      "Checks every option against Renovate's schema and reports unknown names, wrong types and misplaced options.",
    url: "https://docs.renovatebot.com/config-validation/",
  },
  preset: {
    name: "presets stage",
    plain:
      "Downloads everything listed in extends, expands presets referenced inside presets, and merges the result in order underneath your own settings.",
    url: "https://docs.renovatebot.com/config-presets/",
  },
  merge: {
    name: "merge stage",
    plain:
      "Combines Renovate's built-in defaults, the resolved presets and your config — in that order — into the effective config Renovate would act on.",
  },
};

interface Props {
  result: TraceResult;
  selected: StageId;
  onSelect: (stage: StageId) => void;
}

export function StageTimeline({ result, selected, onSelect }: Props) {
  return (
    <div className="stage-timeline">
      {STAGE_ORDER.map((stage) => (
        <Explained key={stage} entry={STAGE_EXPLAINERS[stage]}>
          {(handlers) => (
            <button
              type="button"
              className={`stage-chip${stage === selected ? " selected" : ""}`}
              onClick={() => onSelect(stage)}
              {...handlers}
            >
              <span className={`dot ${result.stageStatus[stage]}`} />
              {STAGE_LABELS[stage]}
            </button>
          )}
        </Explained>
      ))}
    </div>
  );
}
