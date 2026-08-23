import { useTransientFlag } from "@/hooks/use-transient-flag";

/**
 * Roadmap 036 — THE copy affordance. Before it, four unrelated implementations
 * (CopyMarkdownButton, MigrationSteps' inline handler, two plain toolbar
 * buttons) each hand-rolled their own "Copied!" timeout at three different
 * sizes. One component, one size (roadmap 039: the shared button base, with
 * `.copy-btn` in index.css left holding only the accent look), one copied
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
  /** Roadmap 077: icon-only in tight chrome (the toolbar's file-name copy).
   *  The label becomes the accessible name; the icon still flips to the
   *  check, which is the whole feedback there is. */
  iconOnly?: boolean;
};

export function CopyButton({
  getText,
  onCopy,
  label,
  title,
  className,
  inSummary,
  iconOnly,
}: Props) {
  const [copied, flashCopied] = useTransientFlag(1500);

  async function copy() {
    try {
      if (getText) {
        await navigator.clipboard.writeText(getText());
      } else {
        await onCopy?.();
      }
      flashCopied();
    } catch {
      // Clipboard can be unavailable (insecure context) — fail quietly.
    }
  }

  // An icon-only button has no visible text, so pointer users get the
  // accessible name as the hover tooltip too (the design's `title`).
  const hoverTitle = title ?? (iconOnly ? label : undefined);

  return (
    <button
      type="button"
      className={`btn-secondary copy-btn${copied ? " copied" : ""}${iconOnly ? " icon-only" : ""}${className ? ` ${className}` : ""}`}
      title={hoverTitle}
      aria-label={iconOnly ? label : undefined}
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
      {iconOnly ? null : <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}
