import { useState } from "react";

/**
 * Roadmap 036 — THE copy affordance. Before it, four unrelated implementations
 * (CopyMarkdownButton, MigrationSteps' inline handler, two plain toolbar
 * buttons) each hand-rolled their own "Copied!" timeout at three different
 * sizes. One component, one size (see `.copy-btn` in index.css), one copied
 * state: clipboard icon + label, flipping to a check + "Copied" for 1.5 s.
 */

/** Octicon `copy` / `check`, inlined — the entry chunk carries no icon dep (031). */
const COPY_PATH =
  "M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25ZM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z";
const CHECK_PATH =
  "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z";

/**
 * Exactly one of the two is given. `getText` covers the common case — the
 * payload is built LAZILY on click, so a long results list never serializes
 * every block up front (the rule roadmap 018 established). `onCopy` covers the
 * copies the caller performs itself, i.e. the share link, which also mirrors
 * the URL into the address bar (use-share-link.ts).
 */
type CopySource =
  | { getText: () => string; onCopy?: never }
  | { onCopy: () => void | Promise<void>; getText?: never };

type Props = CopySource & {
  label: string;
  title?: string;
  className?: string;
  /**
   * Set on buttons rendered inside a `<summary>`: without swallowing the click
   * there, copying would also toggle the surrounding `<details>` open/closed.
   */
  inSummary?: boolean;
};

export function CopyButton({ getText, onCopy, label, title, className, inSummary }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (getText) {
        await navigator.clipboard.writeText(getText());
      } else {
        await onCopy?.();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context) — fail quietly.
    }
  }

  return (
    <button
      type="button"
      className={`copy-btn${copied ? " copied" : ""}${className ? ` ${className}` : ""}`}
      title={title}
      onClick={(e) => {
        if (inSummary) {
          e.preventDefault();
          e.stopPropagation();
        }
        void copy();
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d={copied ? CHECK_PATH : COPY_PATH} />
      </svg>
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
