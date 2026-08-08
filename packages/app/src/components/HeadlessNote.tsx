/**
 * Roadmap 060 — "this trace is available headlessly".
 *
 * The one discovery mechanism the research found that actually works: a
 * VISIBLE note a human can read too, plus a copy-pasteable one-liner. Not
 * hidden text, not an off-screen instruction block, not a meta tag aimed at
 * crawlers — agent-directed content a person cannot see is the canonical
 * indirect-prompt-injection pattern (OWASP LLM01), browser-driving agents read
 * the accessibility tree (which strips hidden elements) anyway, and the
 * `.well-known`/llms.txt discovery proposals are consumed by no shipping
 * client today. See the research doc for what was checked and rejected.
 *
 * In flow, at the end of the page, in a `<footer>`: an agent that scraped the
 * page has it, and so does a developer scrolling to the bottom.
 */

const PACKAGE = "@renovate-config-debugger/cli";
const DOCS_URL = "https://github.com/secustor/renovate-config-debugger/tree/main/packages/cli";

const ONE_LINERS = [
  `# every answer on this page, as JSON`,
  `pnpm dlx ${PACKAGE} digest renovate.json`,
  `pnpm dlx ${PACKAGE} validate renovate.json    # exit 2 = Renovate would refuse it`,
  ``,
  `# or register it once, for an agent session`,
  `claude mcp add rcd -- pnpm dlx ${PACKAGE} mcp`,
].join("\n");

export function HeadlessNote() {
  return (
    <footer className="headless-note">
      <h2 className="headless-note-title">For agents and scripts</h2>
      <p className="headless-note-lead">
        Everything this page shows — the preset tree, per-key provenance, the packageRules
        simulator, the validation errors — is available headlessly from the same engine and the same
        pinned Renovate, with no browser involved.
      </p>
      <pre className="headless-note-code">{ONE_LINERS}</pre>
      <p className="headless-note-foot">
        Experimental: subcommands, flags and output shapes may change.{" "}
        <a href={DOCS_URL} target="_blank" rel="noreferrer">
          CLI documentation ↗
        </a>
      </p>
    </footer>
  );
}
