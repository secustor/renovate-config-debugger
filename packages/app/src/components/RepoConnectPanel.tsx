import type { RepoConnectOffer } from "@/types/repo";

/**
 * The design's connect panel — what a surface built on the loaded repository's
 * dependencies shows while NO repository is loaded in this session. A share
 * link carries the config and the pinned tests but not repository access; when
 * it also names the repo the config came from, one click grants access and
 * extraction runs. Either way the editor's load-from-repo overlay stays one
 * link away.
 *
 * Roadmap 087 wrote it inside the Tests tab's From-repository view, which was
 * its only consumer. Roadmap 089's Dependencies tab is the second, and it is a
 * different feature slice — so the panel moves down here by the promotion rule
 * (see `EmptyNote`) rather than being copied across the boundary. Today no
 * slice reaches it directly: `RepoDiscoveryGate` is its only consumer, and the
 * three discovery surfaces render that gate. It is pure presentation over
 * `RepoConnectOffer`: the shell fills the offer in, and this draws it. Its
 * `pin-repo-connect` classes stay the spelling they were born with
 * (`15-pins.css`), since renaming them would touch a stylesheet for no
 * behavioural reason.
 */
export function RepoConnectPanel({ offer }: { offer: RepoConnectOffer }) {
  return (
    <div className="pin-repo-connect">
      <p className="pin-repo-connect-head">The repository isn’t loaded in this session</p>
      {offer.suggestion === null ? (
        <p className="pin-repo-connect-body">
          Load the repository this config belongs to and the dependencies Renovate detects in its
          package files appear here — each one a click from a pinned test.
        </p>
      ) : (
        <p className="pin-repo-connect-body">
          This config was opened from a shared link, which carries the config and pinned tests but
          not repository access. Reload <code>{offer.suggestion}</code> to pick from its detected
          dependencies.
        </p>
      )}
      <div className="pin-repo-connect-actions">
        {offer.suggestion === null ? null : (
          <button type="button" className="btn-primary" onClick={offer.onConnect}>
            Reload {offer.suggestion}
          </button>
        )}
        <button
          type="button"
          className="digest-link"
          onClick={(e) => offer.onOpenLoad(e.currentTarget)}
        >
          {offer.suggestion === null ? "load a repository…" : "load a different repository…"}
        </button>
      </div>
      <p className="pin-repo-connect-note">read-only · your pinned tests are untouched</p>
    </div>
  );
}
