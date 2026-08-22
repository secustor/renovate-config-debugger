import { useState } from "react";
import type { Props } from "./AdvancedZone";
import type { CustomHostRule } from "@/data/custom-host-rules";
import type { HostTokenField } from "@/hooks/use-host-tokens";
import { isValidEndpoint, isValidToken } from "@/lib/input-schemas";
import { openPickerOnEnter } from "@/lib/select-picker";
import { PLATFORM_ENDPOINTS, PLATFORMS } from "@/data/platform-endpoints";
import { SessionAvatar } from "@/components/SessionAvatar";
import { Term } from "@/components/glossary";

/** Octicons 16px: `mark-github`. */
const GITHUB_MARK =
  "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";

/** The platform/endpoint pair (010 "reflect, then override"). Its own
 *  component since 040's depth ratchet: an `<option>` inside the select inside
 *  its label is three elements below the row. */
function PlatformEndpointRow({
  displayPlatform,
  displayEndpoint,
  onPlatformChange,
  onEndpointChange,
}: {
  displayPlatform: string;
  displayEndpoint: string;
  onPlatformChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
}) {
  return (
    <div className="advanced-row">
      <label>
        Platform
        <select
          value={displayPlatform}
          onChange={(e) => onPlatformChange(e.target.value)}
          onKeyDown={openPickerOnEnter}
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          {!PLATFORMS.includes(displayPlatform) ? (
            <option value={displayPlatform}>{displayPlatform}</option>
          ) : null}
        </select>
      </label>
      <label className="grow">
        Endpoint
        <input
          type="text"
          placeholder={PLATFORM_ENDPOINTS[displayPlatform] || "not fetched in the browser"}
          value={displayEndpoint}
          onChange={(e) => onEndpointChange(e.target.value)}
        />
      </label>
    </div>
  );
}

/** The "some presets live elsewhere" intro paragraph — its own component
 *  since the nested `<Term><code>…</code></Term>` pushes the paragraph one
 *  level past the depth ratchet when left inline in `HostAccessSection`. */
function HostPresetIntro() {
  return (
    <p className="advanced-note">
      Some presets live in other repositories on your <Term id="platform">code host</Term>{" "}
      (referenced as{" "}
      <Term id="localPreset">
        <code>local&gt;</code>
      </Term>{" "}
      or a bare <code>owner/repo</code>). Set the host and API endpoint they should resolve against.
    </p>
  );
}

/** The "platform/endpoint came from the global config" banner — split out for
 *  the same reason as `HostPresetIntro`: the conditional `<code>` values
 *  inside the fragments put the paragraph one level past the depth ratchet. */
function PlatformFromGlobalNote({
  globalPlatform,
  globalEndpoint,
}: {
  globalPlatform: string | undefined;
  globalEndpoint: string | undefined;
}) {
  return (
    <p className="advanced-note platform-from-global">
      <span className="badge prov-global">from global config</span>{" "}
      {globalPlatform !== undefined ? (
        <>
          platform <code>{globalPlatform}</code>
        </>
      ) : null}
      {globalPlatform !== undefined && globalEndpoint !== undefined ? " and " : null}
      {globalEndpoint !== undefined ? (
        <>
          endpoint <code>{globalEndpoint}</code>
        </>
      ) : null}{" "}
      come from the pasted global config — a real Renovate run would use them. Changing the control
      overrides them for this visualization.
    </p>
  );
}

/** Where presets living in other repositories are fetched from: the platform
 *  context (010) and what the global config contributes to it. The tokens that
 *  used to sit at the bottom of this section are the credentials list's now. */
export function HostAccessSection({
  hostSectionOpen,
  onHostSectionOpenChange,
  displayPlatform,
  displayEndpoint,
  onPlatformChange,
  onEndpointChange,
  reflectGlobal,
  globalPlatform,
  globalEndpoint,
  platformOverride,
  hasGlobalContext,
  onUseGlobalValues,
  usesLocal,
  platform,
}: Pick<
  Props,
  | "hostSectionOpen"
  | "onHostSectionOpenChange"
  | "displayPlatform"
  | "displayEndpoint"
  | "onPlatformChange"
  | "onEndpointChange"
  | "reflectGlobal"
  | "globalPlatform"
  | "globalEndpoint"
  | "platformOverride"
  | "hasGlobalContext"
  | "onUseGlobalValues"
  | "usesLocal"
  | "platform"
>) {
  return (
    <details
      className="advanced-settings"
      open={hostSectionOpen}
      onToggle={(e) => onHostSectionOpenChange(e.currentTarget.open)}
    >
      <summary>
        Repository host
        <span className="advanced-hint">
          {" "}
          — where presets that live in other repositories are fetched from
        </span>
      </summary>
      <div className="advanced-body">
        <HostPresetIntro />
        <PlatformEndpointRow
          displayPlatform={displayPlatform}
          displayEndpoint={displayEndpoint}
          onPlatformChange={onPlatformChange}
          onEndpointChange={onEndpointChange}
        />
        {/* Roadmap 030: the "dangerous URL" rule, surfaced inline
            (014/023 style) — the same check that gates Run in
            `blockedByLayerErrors` and the one that keeps a bad
            value out of storage in `onEndpointChange`. */}
        {displayEndpoint && !isValidEndpoint(displayEndpoint) ? (
          <p className="layer-editor-error">
            Not a valid endpoint: must be an http(s) URL. The pipeline won&apos;t run until this is
            fixed or the field is cleared.
          </p>
        ) : null}
        {reflectGlobal ? (
          <PlatformFromGlobalNote globalPlatform={globalPlatform} globalEndpoint={globalEndpoint} />
        ) : null}
        {platformOverride && hasGlobalContext ? (
          <p className="advanced-note platform-override-warning">
            Overriding <code>platform</code>/<code>endpoint</code> from the global config — a real
            Renovate run would use <code>{globalPlatform ?? displayPlatform}</code>
            {" / "}
            <code>
              {globalEndpoint ??
                (PLATFORM_ENDPOINTS[globalPlatform ?? ""] || "the platform default")}
            </code>
            .{" "}
            <button type="button" className="platform-override-clear" onClick={onUseGlobalValues}>
              use global config values
            </button>
          </p>
        ) : null}
        {usesLocal && !(platform in PLATFORM_ENDPOINTS && PLATFORM_ENDPOINTS[platform]) ? (
          <p className="advanced-note">
            <code>{platform}</code> presets are not fetched in the browser — a real Renovate run
            reaches them. You can still provide their content manually from a failed node below.
          </p>
        ) : null}
      </div>
    </details>
  );
}

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

/** One non-github host that HAS a token — the list only ever shows the hosts
 *  this session can actually authenticate against, which is what makes it read
 *  like `hostRules` rather than like a form with four empty boxes. */
export function HostTokenRow({ host }: { host: HostTokenField }) {
  return (
    <div className="host-row">
      <code className="host-name">{host.host}</code>
      <span className="pill pill-count host-kind">{host.id}</span>
      <span className="host-row-actions">
        {/* No tick for a token 030's check refused to save — the error row
            under the list explains it. */}
        {isValidToken(host.value) ? <span className="host-ok">token ✓</span> : null}
        <button
          type="button"
          className="host-remove"
          title="Remove host"
          onClick={() => host.onChange("")}
        >
          ✕
        </button>
      </span>
    </div>
  );
}

/** One custom credential row (roadmap 076) — same shape as `HostTokenRow`,
 *  but the pill is the rule's `hostType` rather than a fixed descriptor id,
 *  and removal drops the whole rule instead of blanking a token. */
export function CustomHostRow({ rule, onRemove }: { rule: CustomHostRule; onRemove: () => void }) {
  return (
    <div className="host-row">
      <code className="host-name">{rule.host}</code>
      <span className="pill pill-count host-kind">{rule.hostType}</span>
      <span className="host-row-actions">
        {/* Always a tick: `useCustomHostRules` refuses to store a rule whose
            token would fail 030's header-injection check, so a row that
            exists is a credential in force. */}
        <span className="host-ok">token ✓</span>
        <button type="button" className="host-remove" title="Remove host" onClick={onRemove}>
          ✕
        </button>
      </span>
    </div>
  );
}
