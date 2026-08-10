import { ProjectLinks } from "@/components/ProjectLinks";
import { SessionAvatar } from "@/components/SessionAvatar";
import { SessionMenuItem } from "@/components/SessionMenuItem";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { useSessionMenu } from "@/hooks/use-session-menu";
import { REVOKE_URL, type StoredUser } from "@/platform/oauth";
import { formatShortcut, HELP_SHORTCUT } from "@/lib/shortcuts";

/**
 * Roadmap 066 — the header's session corner, collapsed into one control.
 *
 * Before 066 the corner held three widgets (project links, theme switch,
 * version badge) and the GitHub session lived somewhere else entirely: a chip
 * in the config toolbar, three hundred pixels below the place every user looks
 * for an account control. The chip also scattered one concept across three
 * affordances — "Sign out" as a button, "revoke" as a lowercase link, and
 * "Manage repository access" in a hint that only appears after a failure.
 *
 * This is all of it behind one trigger, and the TRIGGER'S ICON CARRIES THE
 * STATE: an avatar when signed in, a gear when not. That substitution is what
 * makes collapsing the corner work at all — a 043 self-hosted deployment has
 * no sign-in, so an account-shaped trigger there would be a nameless button,
 * while a gear reads as "settings live here" in every deployment. Both glyphs
 * render into the same circle, so the header's width never changes with the
 * session state and nothing reflows when a sign-in lands.
 *
 * The theme switch loses its one-click access by moving in here. That is the
 * deliberate trade: it is a decision a user makes about once per machine, and
 * it was spending permanent header width — the width 055 had to argue about —
 * to save a click nobody makes twice.
 *
 * This component is presentation only. The token lifecycle, the 065 cookie
 * restore and `signOut()` are untouched.
 */

const PANEL_ID = "session-menu-panel";

/** Octicons 16px: `mark-github`, `repo`, `circle-slash`, `sign-out`, `chevron-down`. */
const ICONS = {
  github:
    "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z",
  repo: "M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z",
  revoke:
    "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm3.03 4.53 8-8-1.06-1.06-8 8 1.06 1.06Z",
  signOut:
    "M2 2.75C2 1.784 2.784 1 3.75 1h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 2 13.25Zm10.44 4.5-1.97-1.97a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.97-1.97H6.75a.75.75 0 0 1 0-1.5Z",
  keyboard:
    "M1.75 4h12.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 13H1.75A1.75 1.75 0 0 1 0 11.25v-5.5C0 4.784.784 4 1.75 4Zm0 1.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM4 7h1.5v1.5H4Zm2.75 0h2.5v1.5h-2.5Zm3.75 0H12v1.5h-1.5ZM4 9.5h8V11H4Z",
  chevron:
    "M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z",
} as const;

interface Props {
  /** False in a 043 deployment with no OAuth: the account group is absent. */
  oauthConfigured: boolean;
  signedIn: boolean;
  authUser: StoredUser | null;
  /** Roadmap 032: computed once in App.tsx, not per render. */
  installUrl: string;
  onSignIn: () => void;
  onSignOut: () => void;
  /** Roadmap 067 tier 1: opens the `?` shortcut sheet. The menu is where a
   *  pointer user finds out the keyboard layer exists at all. */
  onShowShortcuts: () => void;
}

/** What the trigger is called, given what is behind it — see the 066 doc's
 *  state table. Never just "Account": two of the four states have none. */
function triggerLabel(oauthConfigured: boolean, signedIn: boolean, login: string | undefined) {
  if (!oauthConfigured) {
    return "Settings";
  }
  if (!signedIn) {
    return "Settings and sign-in";
  }
  return login === undefined ? "Account" : `Account: ${login}`;
}

function Identity({ authUser }: { authUser: StoredUser | null }) {
  return (
    <div className="session-menu-identity">
      <SessionAvatar url={authUser?.avatarUrl} size={32} fallback="person" />
      <span className="session-menu-identity-text">
        {/* The profile fetch is cosmetic and allowed to fail (`oauth.ts`), so
            the handle is not guaranteed. When it is missing the provider line
            becomes the whole label rather than repeating under a placeholder. */}
        <span className="session-menu-login">{authUser?.login ?? "Signed in with GitHub"}</span>
        {authUser === null ? null : (
          <span className="session-menu-meta">Signed in with GitHub</span>
        )}
      </span>
    </div>
  );
}

interface AccountGroupProps {
  signedIn: boolean;
  authUser: StoredUser | null;
  installUrl: string;
  onSignIn: () => void;
  onSignOut: () => void;
  onDismiss: () => void;
}

function AccountGroup({
  signedIn,
  authUser,
  installUrl,
  onSignIn,
  onSignOut,
  onDismiss,
}: AccountGroupProps) {
  if (!signedIn) {
    return (
      <>
        <p className="session-menu-group-label">Account</p>
        <SessionMenuItem
          icon={ICONS.github}
          label="Sign in with GitHub"
          note="Read-only. Needed for private presets and repositories."
          tone="accent"
          onSelect={() => {
            onDismiss();
            onSignIn();
          }}
        />
        <hr className="session-menu-sep" />
      </>
    );
  }

  return (
    <>
      <Identity authUser={authUser} />
      <hr className="session-menu-sep" />
      <SessionMenuItem
        icon={ICONS.repo}
        label="Manage repository access"
        href={installUrl}
        onSelect={onDismiss}
      />
      {/* Sign out vs. revoke, finally stated where it can be read. Before 066
          the difference lived in a `title` attribute on a lowercase link. */}
      <SessionMenuItem
        icon={ICONS.revoke}
        label="Revoke access on GitHub"
        note="Ends this app's authorization for every session, not just this browser."
        href={REVOKE_URL}
        onSelect={onDismiss}
      />
      <SessionMenuItem
        icon={ICONS.signOut}
        label="Sign out"
        note="Clears the token from this browser only."
        tone="danger"
        onSelect={() => {
          onDismiss();
          onSignOut();
        }}
      />
      <hr className="session-menu-sep" />
    </>
  );
}

interface PanelProps extends Props {
  panelRef: React.RefObject<HTMLDivElement | null>;
  onDismiss: () => void;
}

function SessionMenuPanel({
  oauthConfigured,
  signedIn,
  authUser,
  installUrl,
  onSignIn,
  onSignOut,
  onShowShortcuts,
  panelRef,
  onDismiss,
}: PanelProps) {
  return (
    <div className="session-menu-panel" id={PANEL_ID} ref={panelRef}>
      {oauthConfigured ? (
        <AccountGroup
          signedIn={signedIn}
          authUser={authUser}
          installUrl={installUrl}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onDismiss={onDismiss}
        />
      ) : null}
      <p className="session-menu-group-label">Theme</p>
      {/* The 037 segmented control, unchanged: choosing a theme is still one
          click once the menu is open, and it deliberately does NOT dismiss —
          the point of a theme control is comparing the result. */}
      <div className="session-menu-theme">
        <ThemeSwitch />
      </div>
      <hr className="session-menu-sep" />
      <SessionMenuItem
        icon={ICONS.keyboard}
        label="Keyboard shortcuts"
        shortcut={formatShortcut(HELP_SHORTCUT)}
        note="Press ? any time — run, jump between panes, reach any results tab."
        onSelect={() => {
          onDismiss();
          onShowShortcuts();
        }}
      />
      <hr className="session-menu-sep" />
      <ProjectLinks onSelect={onDismiss} />
    </div>
  );
}

export function SessionMenu({
  oauthConfigured,
  signedIn,
  authUser,
  installUrl,
  onSignIn,
  onSignOut,
  onShowShortcuts,
}: Props) {
  const { open, triggerRef, panelRef, toggle, dismiss } = useSessionMenu();
  // Signed-in state is meaningless without OAuth configured, and reading it as
  // a pair here keeps every consumer below from having to remember that.
  const hasSession = oauthConfigured && signedIn;
  const avatarUrl = hasSession ? authUser?.avatarUrl : undefined;
  const label = triggerLabel(oauthConfigured, signedIn, hasSession ? authUser?.login : undefined);

  return (
    <span className="session-menu">
      <button
        type="button"
        ref={triggerRef}
        className="session-menu-trigger"
        aria-expanded={open}
        aria-controls={open ? PANEL_ID : undefined}
        aria-label={label}
        title={label}
        onClick={toggle}
      >
        {/* Keyed on the URL so a sign-out/sign-in with a different avatar
            starts from a clean `onError` state rather than inheriting the
            previous user's broken-image verdict. */}
        <SessionAvatar
          key={avatarUrl ?? "none"}
          url={avatarUrl}
          size={26}
          fallback={hasSession ? "person" : "gear"}
        />
        <svg
          className="session-menu-caret"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d={ICONS.chevron} />
        </svg>
      </button>
      {open ? (
        <SessionMenuPanel
          oauthConfigured={oauthConfigured}
          signedIn={signedIn}
          authUser={authUser}
          installUrl={installUrl}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onShowShortcuts={onShowShortcuts}
          panelRef={panelRef}
          onDismiss={dismiss}
        />
      ) : null}
    </span>
  );
}
