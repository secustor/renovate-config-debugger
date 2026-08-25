/**
 * Roadmap 033/076 — the credential list's rows. Split out of
 * `HostAccessSection.tsx` (which is about WHERE presets are fetched from, a
 * different question) because these three are consumed by `CredentialsList`
 * and nothing else.
 *
 * `HostRow` is the shell all of them share below github.com: the host name, a
 * kind pill, the "token ✓" tick and the ✕ that revokes it. The token row and
 * the custom-rule row are the same DOM with different sources for those four
 * facts — they were two copies until this split, which is how they could have
 * come to disagree about what a credential row looks like.
 */
import { useState } from "react";
import type { CustomHostRule } from "@/lib/custom-host-rules";
import type { HostTokenField } from "@/hooks/use-host-tokens";
import { isValidToken } from "@/lib/input-schemas";
import { SessionAvatar } from "@/components/SessionAvatar";

/** Octicons 16px: `mark-github`. */
const GITHUB_MARK =
  "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";

/** One host-token input row (033's table), revealed by a row's own toggle. */
function HostTokenInput({ host }: { host: HostTokenField }) {
  return (
    <div className="advanced-row host-row-input">
      <label className="grow">
        {host.inputLabel}
        <input
          type="password"
          placeholder="optional — stays in this browser tab"
          value={host.value}
          onChange={(e) => host.onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

/** The right-hand side of the github.com row — the one row whose state is not
 *  "a token, or no token" but 009's three-way (signed in / can sign in / PAT
 *  only). Its own component so each branch is a flat list of controls. */
function GithubRowActions({
  oauthConfigured,
  signedIn,
  avatarUrl,
  tokenSet,
  tokenValid,
  onSignIn,
  onSignOut,
  onClearToken,
  onRevealToken,
}: {
  oauthConfigured: boolean;
  signedIn: boolean;
  /** See Props.authUser — the signed-in row names who, when it can. */
  avatarUrl: string | undefined;
  tokenSet: boolean;
  /** Roadmap 030: the tick is a claim the credential is in force, and an
   *  invalid token never reaches storage — so it gets no tick (the error row
   *  under the list says why). */
  tokenValid: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onClearToken: () => void;
  onRevealToken: () => void;
}) {
  if (oauthConfigured && signedIn) {
    return (
      <span className="host-row-actions">
        {avatarUrl === undefined ? null : (
          <SessionAvatar key={avatarUrl} url={avatarUrl} size={16} fallback="person" />
        )}
        <span className="host-ok">signed in ✓</span>
        <button type="button" className="btn-quiet" onClick={onSignOut}>
          sign out
        </button>
      </span>
    );
  }
  return (
    <span className="host-row-actions">
      {oauthConfigured ? (
        <button type="button" className="btn-primary" onClick={onSignIn}>
          Sign in with GitHub
        </button>
      ) : null}
      {tokenValid ? <span className="host-ok">token ✓</span> : null}
      {tokenSet ? (
        <button type="button" className="host-remove" title="Remove token" onClick={onClearToken}>
          ✕
        </button>
      ) : null}
      {tokenSet ? null : (
        <button type="button" className="btn-quiet" onClick={onRevealToken}>
          {oauthConfigured ? "use a token instead…" : "add token…"}
        </button>
      )}
    </span>
  );
}

/** github.com — always the first row, never removable: it is the host the app
 *  defaults to, and the one a sign-in covers. */
export function GithubHostRow({
  host,
  isPlatform,
  oauthConfigured,
  signedIn,
  avatarUrl,
  onSignIn,
  onSignOut,
}: {
  host: HostTokenField;
  isPlatform: boolean;
  oauthConfigured: boolean;
  signedIn: boolean;
  avatarUrl: string | undefined;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const [tokenOpen, setTokenOpen] = useState(false);
  const tokenSet = host.value !== "";
  return (
    <div className="host-row-group">
      <div className="host-row">
        <svg className="host-glyph" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d={GITHUB_MARK} />
        </svg>
        <code className="host-name">{host.host}</code>
        {isPlatform ? <span className="pill pill-count host-kind">platform</span> : null}
        <GithubRowActions
          oauthConfigured={oauthConfigured}
          signedIn={signedIn}
          avatarUrl={avatarUrl}
          tokenSet={tokenSet}
          tokenValid={tokenSet && isValidToken(host.value)}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onClearToken={() => {
            host.onChange("");
            setTokenOpen(false);
          }}
          onRevealToken={() => setTokenOpen(true)}
        />
      </div>
      {/* Stays mounted while the reveal is open even once a value is typed —
          keying this on `tokenSet` would unmount the input (and drop focus)
          on the first keystroke. */}
      {tokenOpen ? <HostTokenInput host={host} /> : null}
      {oauthConfigured && signedIn ? (
        <p className="advanced-note host-row-note">
          Signing in covers github.com automatically — private presets and repos, no token to paste.
          A personal access token is only a fallback: for GitHub Enterprise Server, when the app
          installation can&apos;t be approved, or if the sign-in service is unavailable.
        </p>
      ) : null}
    </div>
  );
}

/**
 * One credential row below github.com. The list only ever shows hosts this
 * session can actually authenticate against, which is what makes it read like
 * `hostRules` rather than like a form with four empty boxes.
 *
 * `kind` is the pill: a descriptor id for one of the four canonical hosts, the
 * rule's own `hostType` for a custom one. `onRemove` is likewise the row's
 * own — blanking a token, or dropping the whole rule.
 */
function HostRow({
  host,
  kind,
  tokenValid,
  onRemove,
}: {
  host: string;
  kind: string;
  /** The tick is a claim the credential is IN FORCE, so a token 030's check
   *  refused to save gets none — the error row under the list explains it. */
  tokenValid: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="host-row">
      <code className="host-name">{host}</code>
      <span className="pill pill-count host-kind">{kind}</span>
      <span className="host-row-actions">
        {tokenValid ? <span className="host-ok">token ✓</span> : null}
        <button type="button" className="host-remove" title="Remove host" onClick={onRemove}>
          ✕
        </button>
      </span>
    </div>
  );
}

/** One of the four canonical hosts (033's table) that HAS a token. */
export function HostTokenRow({ host }: { host: HostTokenField }) {
  return (
    <HostRow
      host={host.host}
      kind={host.id}
      tokenValid={isValidToken(host.value)}
      onRemove={() => host.onChange("")}
    />
  );
}

/** One custom credential row (roadmap 076). Always ticked:
 *  `useCustomHostRules` refuses to store a rule whose token would fail 030's
 *  header-injection check, so a row that exists is a credential in force. */
export function CustomHostRow({ rule, onRemove }: { rule: CustomHostRule; onRemove: () => void }) {
  return <HostRow host={rule.host} kind={rule.hostType} tokenValid onRemove={onRemove} />;
}
