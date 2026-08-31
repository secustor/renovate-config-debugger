/**
 * Roadmap 090 — the Pipeline tab's PHASES: the four steps production Renovate
 * walks for a repository, of which this app runs two.
 *
 * The tab has always shown one of them — the config pipeline (008's stages,
 * global → merge) — under a name that promised all four. 087 taught the
 * browser engine to extract a loaded repository's dependencies, which is
 * Renovate's own second phase, so it becomes the second segment rather than a
 * second tab: the picker is what teaches the ORDER, and a disabled segment
 * teaches it as honestly as a live one.
 *
 * `lookup` and `update` are rendered and disabled on purpose. Both need live
 * datasource network calls, which the engine deliberately severs (078's "not
 * in scope"), so nothing here may pretend otherwise — they carry a muted "not
 * available yet" and a title saying the same thing.
 */

export const PIPELINE_PHASES = [
  {
    id: "config",
    label: "Config",
    title: "Resolve the configuration — the stages this app runs from your file",
    available: true,
  },
  {
    id: "extract",
    label: "Extract",
    title: "Find the dependencies in the repository's package files",
    available: true,
  },
  {
    id: "lookup",
    label: "Lookup",
    title: "Not available today",
    available: false,
  },
  {
    id: "update",
    label: "Update",
    title: "Not available today",
    available: false,
  },
] as const;

/** The phase ids, derived from the descriptors — one list, not two. */
export type PipelinePhase = (typeof PIPELINE_PHASES)[number]["id"];

export interface PipelinePhaseDescriptor {
  id: PipelinePhase;
  label: string;
  /** What the phase does, for the segment's `title`. */
  title: string;
  /** Whether this app can run it at all. */
  available: boolean;
}

/** What an unavailable segment says instead of a count. Stated once so the
 *  picker and its test cannot disagree about the promise being made. */
export const PHASE_UNAVAILABLE_NOTE = "not available yet";
