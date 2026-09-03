import { SegmentedControl, type SegmentedOption } from "@/components/SegmentedControl";
import { plural } from "@/lib/format";
import {
  PHASE_UNAVAILABLE_NOTE,
  PIPELINE_PHASES,
  type PipelinePhase,
  type PipelinePhaseDescriptor,
} from "./phases";
import type { RepoDepsView } from "@/types/repo";

/**
 * Roadmap 090 — the Pipeline tab's phase picker: Renovate's four phases as one
 * segmented control, two of which this app can run.
 *
 * The app's own `SegmentedControl` rather than a fourth hand-rolled strip: it
 * labels a STATE (which phase is on screen), which is what that component is
 * for, and it carries the radiogroup semantics a home-made row of buttons
 * always forgets. A segment's subtitle is the count the phase produced, so the
 * picker also says what is behind each door before it is opened.
 */

interface PhaseNote {
  text: string;
  tone: "muted" | "ok";
}

/** The subtitle under a segment's name — a real count, or nothing. Never a
 *  zero standing in for "not measured yet": the Extract segment stays quiet
 *  until discovery has reported, exactly as the tab badges do. */
// Not exported: the picker is this file's only consumer, and a helper beside a
// component is what the fast-refresh rule refuses.
function phaseNote(
  phase: PipelinePhase,
  effectiveKeys: number | null,
  extract: RepoDepsView,
): PhaseNote | null {
  if (phase === "config") {
    return effectiveKeys === null ? null : { text: plural(effectiveKeys, "option"), tone: "muted" };
  }
  if (phase === "extract") {
    if (extract.status === "ready") {
      return { text: `+${plural(extract.deps.length, "dep")}`, tone: "ok" };
    }
    return extract.status === "loading" ? { text: "reading…", tone: "muted" } : null;
  }
  return { text: PHASE_UNAVAILABLE_NOTE, tone: "muted" };
}

function PhaseLabel({ label, note }: { label: string; note: PhaseNote | null }) {
  return (
    <>
      <span className="phase-seg-name">{label}</span>
      <span className={note === null ? "phase-seg-note" : `phase-seg-note ${note.tone}`}>
        {note?.text ?? ""}
      </span>
    </>
  );
}

function phaseOption(
  descriptor: PipelinePhaseDescriptor,
  note: PhaseNote | null,
): SegmentedOption<PipelinePhase> {
  return {
    value: descriptor.id,
    label: <PhaseLabel label={descriptor.label} note={note} />,
    // The visible label is two lines; spoken it is one sentence.
    ariaLabel: note === null ? descriptor.label : `${descriptor.label}, ${note.text}`,
    title: descriptor.title,
    disabled: !descriptor.available,
  };
}

export function PhasePicker({
  phase,
  onSelectPhase,
  effectiveKeys,
  extract,
}: {
  phase: PipelinePhase;
  onSelectPhase: (phase: PipelinePhase) => void;
  /** Keys in the effective config, or null while provenance is still being
   *  computed — the Config segment's own count. */
  effectiveKeys: number | null;
  extract: RepoDepsView;
}) {
  const options = PIPELINE_PHASES.map((descriptor) =>
    phaseOption(descriptor, phaseNote(descriptor.id, effectiveKeys, extract)),
  );
  return (
    <SegmentedControl
      className="phase-picker"
      label="Pipeline phase"
      value={phase}
      options={options}
      onChange={onSelectPhase}
    />
  );
}
