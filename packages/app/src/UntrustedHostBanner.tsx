import type { UntrustedEndpointGuard } from "@/lib/share";

/**
 * Security 2026-07-25: the banner shown while an untrusted-endpoint guard
 * stands. It names the host and states plainly that nothing is being sent to
 * it. Never a `window.confirm` — a modal would block the run (and every
 * automated/persona session) on a decision the user cannot even evaluate yet,
 * since the endpoint only becomes visible once the link has loaded. The two
 * ways out are the banner's own buttons, so the choice is always explicit and
 * always names the host.
 */
function untrustedEndpointMessage(endpoints: readonly string[]): string {
  const list = endpoints.map((endpoint) => `“${endpoint}”`).join(" and ");
  return (
    `This link asks the analysis to contact ${list}, which is not one of the public code hosts this app trusts. ` +
    `It was opened WITHOUT your GitHub sign-in and without any token you have saved — nothing was sent to that host — ` +
    `and your saved platform settings were left unchanged. ` +
    `Every run keeps leaving your tokens behind until you decide otherwise below; you can review the host under Advanced options → “Repository host & access tokens”.`
  );
}

export function UntrustedHostBanner({
  untrustedGuard,
  onAcknowledge,
  onTrust,
}: {
  untrustedGuard: UntrustedEndpointGuard;
  onAcknowledge: () => void;
  onTrust: () => void;
}) {
  return (
    <div className="share-error-banner share-warning-banner" role="alert">
      <strong className="share-error-banner-title">
        Shared link points at an untrusted host — running without your tokens
      </strong>
      <span>{untrustedEndpointMessage(untrustedGuard.endpoints)}</span>
      {/* Two explicit choices, both naming the host. Neither is a
          dismissal: "continue" only collapses this to the standing
          reminder beside Run, the suppression itself stays on. */}
      <div className="share-warning-actions">
        <button type="button" className="share-warning-ack" onClick={onAcknowledge}>
          Continue without tokens
        </button>
        <button type="button" className="share-warning-trust" onClick={onTrust}>
          Use my tokens with {untrustedGuard.host}
        </button>
      </div>
    </div>
  );
}
