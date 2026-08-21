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
 *
 * Collapsed by default behind a native `<details>` (review on #134): the
 * question is the one visible line, and the platform provides the keyboard
 * and screen-reader behavior. Folding costs discovery nothing — the content
 * stays in the DOM (and the accessibility tree) either way, so only human
 * screen space is spent on demand. The curl/no-JS audience is served by the
 * `<noscript>` block in index.html, not by this component.
 */

import { CopyButton } from "@/components/CopyButton";

const PACKAGE = "@renovate-config-debugger/cli";
const DOCS_URL = "https://github.com/secustor/renovate-config-debugger/tree/main/packages/cli";

const ONE_LINERS = [
  `# every answer on this page, as JSON`,
  `npx -y ${PACKAGE} digest renovate.json`,
  `npx -y ${PACKAGE} validate renovate.json    # exit 2 = Renovate would refuse it`,
  ``,
  `# or register it once, for an agent session`,
  `claude mcp add rcd -- npx -y ${PACKAGE} mcp`,
].join("\n");

function HeadlessNoteBody() {
  return (
    <>
      <p className="headless-note-lead">
        Everything this page answers is also available headlessly — in your terminal or registered
        as an agent tool.
      </p>
      {/* The code-block copy rule (Standard Components): icon-only, top-right
          INSIDE the block — the wrapper is the positioning context. */}
      <div className="headless-note-code-wrap">
        <pre className="headless-note-code">{ONE_LINERS}</pre>
        <CopyButton
          iconOnly
          className="headless-note-copy"
          getText={() => ONE_LINERS}
          label="Copy commands"
        />
      </div>
      <p className="headless-note-foot">
        Experimental: subcommands, flags and output shapes may change.{" "}
        <a href={DOCS_URL} target="_blank" rel="noreferrer">
          CLI documentation ↗
        </a>
      </p>
    </>
  );
}

export function HeadlessNote() {
  return (
    <footer className="headless-note">
      <details className="headless-note-details">
        <summary className="headless-note-summary">
          Looking for a solution for agents and scripts?
        </summary>
        <HeadlessNoteBody />
      </details>
    </footer>
  );
}
