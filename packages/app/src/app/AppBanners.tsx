import { UntrustedHostBanner } from "@/app/UntrustedHostBanner";
import type { UntrustedEndpointGuard } from "@/lib/share";

/**
 * Roadmap 075 (v2, iteration 2): the two page-level banners, as one row between
 * the header and the panes. They used to be the first things in `<main>`, above
 * a page that scrolled; in the shell nothing above the content scrolls, so they
 * need a home of their own — the row simply is not there when neither has
 * anything to say. Their markup, roles and semantics are unchanged.
 */
export function AppBanners({
  shareError,
  untrustedGuard,
  onAcknowledgeUntrusted,
  onTrustUntrustedHost,
}: {
  shareError: string | null;
  untrustedGuard: UntrustedEndpointGuard | null;
  onAcknowledgeUntrusted: () => void;
  onTrustUntrustedHost: () => void;
}) {
  const showUntrusted = untrustedGuard !== null && !untrustedGuard.acknowledged;
  if (shareError === null && !showUntrusted) {
    return null;
  }
  return (
    <div className="app-banners">
      {shareError ? (
        <div className="share-error-banner" role="alert">
          <strong className="share-error-banner-title">Shared link couldn’t be opened</strong>
          <span>{shareError}</span>
        </div>
      ) : null}
      {showUntrusted && untrustedGuard ? (
        <UntrustedHostBanner
          untrustedGuard={untrustedGuard}
          onAcknowledge={onAcknowledgeUntrusted}
          onTrust={onTrustUntrustedHost}
        />
      ) : null}
    </div>
  );
}
