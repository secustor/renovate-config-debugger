import { SessionMenu } from "@/components/SessionMenu";
import type { StoredUser } from "@/platform/oauth";

interface Props {
  renovateVersion: string | undefined;
  oauthConfigured: boolean;
  signedIn: boolean;
  authUser: StoredUser | null;
  installUrl: string;
  onSignIn: () => void;
  onSignOut: () => void;
  onShowShortcuts: () => void;
}

/**
 * Roadmap 037 established this corner as "about this session"; 055 put the
 * project links here; 066 collapsed all of it into one trigger and brought the
 * GitHub session up from the config toolbar to join it — the top-right corner
 * being where an account control is looked for, and nowhere else.
 *
 * What is left in the row is what a menu cannot carry: the version badge,
 * which is a fact rather than an action, and so has to be readable without a
 * click. It sits LEFT of the trigger because the account control is the
 * rightmost thing in a header by convention.
 */
export function AppHeaderTools({
  renovateVersion,
  oauthConfigured,
  signedIn,
  authUser,
  installUrl,
  onSignIn,
  onSignOut,
  onShowShortcuts,
}: Props) {
  return (
    <span className="app-header-tools">
      {renovateVersion !== undefined ? (
        <span className="version-badge">Renovate v{renovateVersion}</span>
      ) : null}
      <SessionMenu
        oauthConfigured={oauthConfigured}
        signedIn={signedIn}
        authUser={authUser}
        installUrl={installUrl}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        onShowShortcuts={onShowShortcuts}
      />
    </span>
  );
}
