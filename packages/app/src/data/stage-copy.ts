import type { StageId } from "@renovate-config-debugger/engine";
import type { GlossaryEntry } from "./glossary-data";

/**
 * Stage names + plain-language explainers. Data, not markup — kept out of
 * `StageRail.tsx` because a component module that also exports constants
 * breaks Fast Refresh (react/only-export-components), and App.tsx reads both
 * of these for the selected-stage detail panel.
 */

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

/**
 * Roadmap 075 (iteration 4): the rail gives every stage the same narrow
 * column, so its nodes wear the short form of the same names — the full label
 * stays the accessible name and the stage card's heading, so nothing a screen
 * reader hears gets shorter.
 */
export const STAGE_SHORT_LABELS: Record<StageId, string> = {
  global: "Global",
  inherit: "Inherited",
  parse: "Parse",
  migrate: "Migrate",
  massage: "Massage",
  validate: "Validate",
  preset: "Presets",
  merge: "Merge",
};

/**
 * Plain-language card per stage — what Renovate does there, with docs, plus
 * (024) the rule for what its dot means: amber only where a stage can
 * meaningfully do nothing (migrate/massage/validate); the always-transform
 * stages (parse, global, inherit, presets, merge) stay green whenever they
 * succeed, since flagging their normal job as "amber" would just be
 * permanently lit and uninformative.
 */
export const STAGE_EXPLAINERS: Record<StageId, GlossaryEntry> = {
  global: {
    name: "global config stage",
    plain:
      "Applies the bot-level settings a self-hosted administrator configured, including any globalExtends presets. Skipped unless you provide a global config on this stage's card in the Pipeline tab. Assembling this layer is what the stage always does, so its dot stays green whenever it succeeds and only turns red on an outright failure.",
    url: "https://docs.renovatebot.com/self-hosted-configuration/",
  },
  inherit: {
    name: "inherited config stage",
    plain:
      "Applies org-level defaults shared across repositories (inheritConfig): validated, its presets resolved, and bot-only options stripped. Skipped unless you provide one on this stage's card in the Pipeline tab. Like the global layer, assembling it is this stage's normal job — its dot stays green whenever it succeeds.",
    url: "https://docs.renovatebot.com/self-hosted-configuration/#inheritconfig",
  },
  parse: {
    name: "parse stage",
    plain:
      "Reads your config file text and turns it into a configuration object. Its dot is green when parsing succeeds and red when the file can't be read — there's no partial outcome to flag amber here.",
  },
  migrate: {
    name: "migrate stage",
    plain:
      "Rewrites deprecated options to their current names and shapes — the same rewriting Renovate applies (or proposes as a config-migration PR) on every real run. Its dot turns amber when this run actually rewrote at least one option, with a count of how many; it stays green when nothing needed rewriting.",
    url: "https://docs.renovatebot.com/config-migration/",
  },
  massage: {
    name: "massage stage",
    plain:
      "Normalizes allowed shorthand into the full form Renovate works with internally — for example a single string where a list is expected. Its dot turns amber when massaging actually changed the config this run, green when it left it untouched.",
  },
  validate: {
    name: "validate stage",
    plain:
      "Checks every option against Renovate's schema and reports unknown names, wrong types and misplaced options. Its dot turns amber when this run has warnings (shown as a count), and red when it has errors — a config can have both, in which case red wins.",
    url: "https://docs.renovatebot.com/config-validation/",
  },
  preset: {
    name: "presets stage",
    plain:
      "Downloads everything listed in extends, expands presets referenced inside presets, and merges the result in order underneath your own settings. Resolving extends is what this stage always does, so its dot stays green whenever resolution succeeds — it turns red only if a preset fails to resolve, never amber for a normal preset chain.",
    url: "https://docs.renovatebot.com/config-presets/",
  },
  merge: {
    name: "merge stage",
    plain:
      "Combines Renovate's built-in defaults, the resolved presets and your config — in that order — into the effective config Renovate would act on. Merging layers is this stage's entire job, so its dot stays green whenever it completes — there's no routine-vs-noteworthy merge outcome to flag amber.",
  },
};
