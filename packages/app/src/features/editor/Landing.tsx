import type { TermId } from "@/data/glossary-data";
import { Term } from "@/components/glossary";
import { formatShortcut, RUN_SHORTCUT } from "@/lib/shortcuts";

/**
 * Roadmap 075 (v2, iteration 2) — the landing: what the app is before a run
 * has produced anything to look at.
 *
 * It replaces 040's WelcomePanel, which was a three-step "how it works" card
 * pinned above the editor and left the page's own question unasked. The design
 * asks it in the headline, keeps the promise that answers the objection right
 * under it, and puts everything else the reader can DO in one centered column:
 * the editor, the two example shortcuts, one Run button, and a preview of the
 * eight stages the run will walk.
 *
 * Copy-and-affordances only — no state of its own; App owns every handler.
 */

export function LandingIntro() {
  return (
    <div className="landing-intro">
      {/* Visually the page's headline, semantically the second level: the
          document's h1 is the product name in the header, which is still there
          (and still first in the reading order) on this screen. */}
      <h2 className="landing-title">What does your Renovate config actually do?</h2>
      <p className="landing-subtitle">
        Renovate&apos;s own code processes it right here — nothing leaves your browser.
      </p>
    </div>
  );
}

interface LaunchProps {
  onTryExample: () => void;
  /** Loads and runs this app's own repository config — a live dogfood demo. */
  onAnalyzeThisProject: () => void;
  running: boolean;
  onRun: () => void;
  /** Roadmap 031: hover/focus signal Run intent — start the engine download. */
  onRunIntent: () => void;
  /** Roadmap 075: blocked while the repo-load overlay is open — see the
   *  toolbar's Run, which carries the same rule and the same reason. */
  blockedReason: string | null;
}

/**
 * The two ways in for a reader who has nothing to paste, and the Run button
 * itself — the landing's one primary action, centered under them rather than
 * hidden in a chrome row, because on this screen it is the only thing to do.
 */
export function LandingLaunch({
  onTryExample,
  onAnalyzeThisProject,
  running,
  onRun,
  onRunIntent,
  blockedReason,
}: LaunchProps) {
  const runHint = formatShortcut(RUN_SHORTCUT);
  return (
    <div className="landing-launch">
      <p className="landing-examples">
        <span className="landing-examples-label">No config handy?</span>
        <button type="button" className="btn-secondary" onClick={onTryExample}>
          Try an example
        </button>
        <button type="button" className="btn-secondary" onClick={onAnalyzeThisProject}>
          Analyze this project
        </button>
      </p>
      <button
        type="button"
        className="btn-primary run-button landing-run"
        onClick={onRun}
        onPointerEnter={onRunIntent}
        onFocus={onRunIntent}
        disabled={running || blockedReason !== null}
        title={
          blockedReason ??
          `Process this config with Renovate's own code — it never leaves your browser (${runHint})`
        }
      >
        {running ? "Running…" : "Run the pipeline"}
        <kbd aria-hidden="true">{runHint}</kbd>
      </button>
    </div>
  );
}

/** The eight stages of the pipeline, in the order the run walks them. The four
 *  that name a Renovate concept carry its glossary card — on this screen the
 *  rail is the only place the vocabulary appears at all. */
const STAGES: { label: string; term?: TermId }[] = [
  { label: "Global", term: "globalConfig" },
  { label: "Inherited", term: "inheritedConfig" },
  { label: "Parse" },
  { label: "Migrate", term: "migration" },
  { label: "Massage", term: "massage" },
  { label: "Validate", term: "validation" },
  { label: "Presets", term: "preset" },
  { label: "Merge" },
];

/** One dot on the rail. Its own component for the depth ratchet: a glossary
 *  term inside a list item inside the rail is one level past the limit. */
function RailNode({ label, term }: { label: string; term?: TermId }) {
  return (
    <li className="stage-rail-node">
      <span className="stage-rail-dot" aria-hidden="true" />
      {term ? <Term id={term}>{label}</Term> : <span>{label}</span>}
    </li>
  );
}

/**
 * A static, dimmed preview of the stage rail the results pane will show. It is
 * deliberately not a live progress indicator (roadmap 075 iteration 4 owns the
 * rail's run states): what it has to do here is tell a first-time reader that
 * the run is a sequence of named steps they will be able to walk.
 */
export function StageRailPreview() {
  return (
    <div className="stage-rail-preview">
      <ol className="stage-rail">
        {STAGES.map((stage) => (
          <RailNode key={stage.label} label={stage.label} term={stage.term} />
        ))}
      </ol>
      <p className="stage-rail-caption">
        The run lights these up in order — the same stages you&apos;ll navigate afterwards.
      </p>
    </div>
  );
}

/** The bottom strip: the whole session in three words, so the reader knows
 *  what the screen after this one is for. */
export function LandingSteps() {
  return (
    <p className="landing-steps">
      <span>1. Bring a config</span>
      <span aria-hidden="true">·</span>
      <span>2. Run it</span>
      <span aria-hidden="true">·</span>
      <span>3. Test it against your dependencies</span>
    </p>
  );
}
