import { CopyButton } from "./CopyButton";

/**
 * Roadmap 018 — a small "Copy as markdown" affordance for evidence export.
 * Copies a fenced code block with a one-line header (preset name / rule
 * identity + verdict) to the clipboard, ready to paste into a GitHub
 * discussion answer. The markdown is built lazily on click so re-renders of a
 * long results list don't serialize every block up front.
 *
 * Roadmap 036: the rendering is now {@link CopyButton} — this stays as the
 * thin markdown-building wrapper, so its call sites (PresetTree,
 * RuleSimulator) keep passing header/code/lang and nothing else.
 */
export function CopyMarkdownButton({
  header,
  code,
  lang = "",
  label = "Copy as markdown",
  className,
}: {
  /** The one-line header rendered above the fence. */
  header: string;
  /** The already-formatted body placed inside the fence. */
  code: string;
  /** Fence info string (e.g. `json`); empty for a plain fence. */
  lang?: string;
  label?: string;
  className?: string;
}) {
  return (
    <CopyButton
      // Every call site renders inside a <summary> or a details-owned title.
      inSummary
      getText={() => `${header}\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`}
      label={label}
      className={className}
      title="Copy this as a markdown code block for a discussion answer"
    />
  );
}
