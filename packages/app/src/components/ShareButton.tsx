import { CHECK } from "@/data/octicons";
import { useTransientFlag } from "@/hooks/use-transient-flag";
import { useTransientValue } from "@/hooks/use-transient-value";

/**
 * Proposal F parity (roadmap 077) — the header's Share control.
 *
 * "Copy link" used to be a toolbar button among the document actions, but the
 * link it copies is not a fact about the document: it carries the whole
 * session — config, pipeline layers, pinned tests, the view — which is what
 * the header describes. The design also gives the copy a receipt the flipping
 * label alone can't: a transient popover naming what was just put on the
 * clipboard, with the one promise that matters spelled out (tokens are never
 * included — enforced in share.ts, stated here).
 *
 * `onShare` is `buildShareLinkAndCopy` (use-share-link.ts): it writes the
 * clipboard itself and mirrors the URL into the address bar, which is why the
 * popover can read `location.href` after awaiting it.
 */

/** Octicon `link`, inlined — single-use. The check is the shared one
 *  CopyButton draws (`data/octicons`). */
const LINK_PATH =
  "M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z";

/** How long the button reads "Copied" — CopyButton's own timing. */
const COPIED_MS = 1500;
/** How long the receipt stays up — long enough to read its one sentence. */
const POPOVER_MS = 2600;

export function ShareButton({ onShare }: { onShare: () => Promise<void> }) {
  // Two receipts on two clocks: the button's label reads "Copied" briefly, the
  // popover stays up long enough to read its sentence. Both used to be
  // hand-rolled timers held in refs here — the shared hooks own the clearing
  // (and the unmount cleanup) now, so this component only decides WHAT to show.
  const [copied, flashCopied] = useTransientFlag(COPIED_MS);
  // The copied URL, shown protocol-less the way a reader would say it.
  const [popUrl, showPopUrl] = useTransientValue<string>(POPOVER_MS);

  async function share() {
    try {
      await onShare();
    } catch {
      // Clipboard can be unavailable (insecure context) — the address bar
      // still carries the link; no receipt for a copy that didn't happen.
      return;
    }
    flashCopied();
    showPopUrl(window.location.href.replace(/^https?:\/\//, ""));
  }

  return (
    <span className="share-button">
      <button
        type="button"
        className={`btn-secondary copy-btn${copied ? " copied" : ""}`}
        title="Copy a link that reopens this config and view"
        // Mirrors the visible label — which a narrow viewport hides (the
        // header must not wrap to a second line there; index.css), so the
        // name must not hide with it.
        aria-label={copied ? "Copied" : "Share"}
        onClick={() => void share()}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d={copied ? CHECK : LINK_PATH} />
        </svg>
        <span>{copied ? "Copied" : "Share"}</span>
      </button>
      {popUrl === null ? null : (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- `<output>`'s content model is PHRASING content, and this card holds two `<p>`s and a `<code>` block; the swap would be invalid HTML before it was anything else. The live-region-support argument on `StaleResultsBanner` applies here too.
        <div className="share-pop" role="status">
          <p className="share-pop-ok">✓ Link copied</p>
          <code className="share-pop-url">{popUrl}</code>
          <p className="share-pop-note">
            Includes your config, pipeline layers, and pinned tests. Tokens are never included.
          </p>
        </div>
      )}
    </span>
  );
}
