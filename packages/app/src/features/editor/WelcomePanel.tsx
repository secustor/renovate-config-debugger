import { Term } from "@/components/glossary";

/**
 * Roadmap 040 — the pre-run "How it works" panel, lifted out of App.tsx by the
 * JSX-depth ratchet. Pure copy plus the one affordance the steps mention (the
 * example config), so it owns no state.
 */

interface Props {
  onTryExample: () => void;
  /** Loads and runs this app's own repository config — a live dogfood demo. */
  onAnalyzeThisProject: () => void;
}

export function WelcomePanel({ onTryExample, onAnalyzeThisProject }: Props) {
  return (
    <section className="welcome" aria-label="How it works">
      <ol className="welcome-steps">
        <li>
          <strong>Bring a config.</strong> Paste your <code>renovate.json</code> below, load it
          straight from a repository,{" "}
          <button type="button" className="btn-quiet" onClick={onTryExample}>
            try an example
          </button>
          , or{" "}
          <button type="button" className="btn-quiet" onClick={onAnalyzeThisProject}>
            analyze this project&apos;s config
          </button>
          .
        </li>
        <li>
          <strong>Run it.</strong> The same code the real bot uses resolves your{" "}
          <Term id="preset">presets</Term>, applies <Term id="migration">config migration</Term> and
          validates every option.
        </li>
        <li>
          <strong>Explore the result.</strong> Step through each stage, hover any option for its
          docs, and simulate which <Term id="packageRules">packageRules</Term> would apply to a
          dependency update.
        </li>
      </ol>
      <p className="welcome-footnote">
        New to Renovate? Start with the{" "}
        <a href="https://docs.renovatebot.com/" target="_blank" rel="noreferrer">
          official docs ↗
        </a>
        . Your config and any tokens stay in this browser tab.
      </p>
    </section>
  );
}
