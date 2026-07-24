import { useState } from "react";

/**
 * Roadmap 018 — a small "Copy as markdown" affordance for evidence export.
 * Copies a fenced code block with a one-line header (preset name / rule
 * identity + verdict) to the clipboard, ready to paste into a GitHub
 * discussion answer. The markdown is built lazily on click so re-renders of a
 * long results list don't serialize every block up front.
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
  const [copied, setCopied] = useState(false);

  async function copy() {
    const markdown = `${header}\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context) — fail quietly.
    }
  }

  return (
    <button
      type="button"
      className={`copy-md${className ? ` ${className}` : ""}`}
      onClick={(e) => {
        // These buttons live inside <summary> elements; without this a click
        // would toggle the surrounding <details> open/closed.
        e.preventDefault();
        e.stopPropagation();
        void copy();
      }}
      title="Copy this as a markdown code block for a discussion answer"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
