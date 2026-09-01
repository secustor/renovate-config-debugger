import { AboutBuildButton } from "@/components/BuildInfo";
import { RunButton } from "./RunButton";

/**
 * Roadmap 075 (v2, iteration 2) — the landing: what the app is before a run
 * has produced anything to look at.
 *
 * It replaces 040's WelcomePanel, which was a three-step "how it works" card
 * pinned above the editor and left the page's own question unasked. The design
 * asks it in the headline, keeps the promise that answers the objection right
 * under it, and puts everything else the reader can DO in one centered column:
 * the editor, the two example shortcuts, one Run button, and (iteration 4:
 * `StageRailPreview`, now the Pipeline rail itself in preview mode) a preview
 * of the eight stages the run will walk.
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
        {/* Roadmap 088: the promise's receipt — which build, and how to check. */}
        <AboutBuildButton />
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
  /** Roadmap 075: blocked while the repo-load overlay is open — forwarded to
   *  `RunButton`, the same control the toolbar's Run renders. */
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
  return (
    <div className="landing-launch">
      <p className="landing-examples">
        <span>No config handy?</span>
        <button type="button" className="btn-secondary" onClick={onTryExample}>
          Try an example
        </button>
        <button type="button" className="btn-secondary" onClick={onAnalyzeThisProject}>
          Analyze this project
        </button>
      </p>
      <RunButton
        label="Run the pipeline"
        extraClass="landing-run"
        running={running}
        onRun={onRun}
        onRunIntent={onRunIntent}
        blockedReason={blockedReason}
      />
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
