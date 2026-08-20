import { useState } from "react";
import { Term } from "@/components/glossary";
import { isValidEndpoint, isValidToken } from "@/lib/input-schemas";
import { openPickerOnEnter } from "@/lib/select-picker";
import { PLATFORM_ENDPOINTS, PLATFORMS } from "@/data/platform-endpoints";
import type { HostTokenId } from "@/data/host-tokens";
import type { HostTokenField } from "@/hooks/use-host-tokens";
import { credentialsSummary } from "./credentials-summary";

/**
 * Roadmap 040/076 — the footer drawer under the editor.
 *
 * 040 made it the single collapsed home of everything a typical repo user never
 * touches. 076 (design turn 18e/18d) narrows that to what it is actually good
 * at: **hosts & credentials**. The two self-hosted config layers moved to the
 * pipeline stage nodes that report on them (`StageLayerEditor`), and what is
 * left is the fetch context — which host `local>` presets resolve against — and
 * a `hostRules`-shaped list of the credentials this tab is carrying.
 *
 * It still owns no state that outlives it: the drawer and the host section are
 * controlled by App (an untrusted-endpoint guard opens the host section so the
 * field it tells the user to review is actually on screen). The two disclosures
 * INSIDE the credentials list — reveal the GitHub PAT input, open the add-host
 * form — are local, because nothing outside ever needs to open them.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostSectionOpen: boolean;
  onHostSectionOpenChange: (open: boolean) => void;
  displayPlatform: string;
  displayEndpoint: string;
  onPlatformChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  reflectGlobal: boolean;
  globalPlatform: string | undefined;
  globalEndpoint: string | undefined;
  platformOverride: boolean;
  hasGlobalContext: boolean;
  onUseGlobalValues: () => void;
  usesLocal: boolean;
  platform: string;
  /** Whether OAuth sign-in is configured — the github.com row is a sign-in
   *  offer where it is, and a token field where it is not (009). */
  oauthConfigured: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  hostTokens: HostTokenField[];
  /** Roadmap 076: takes the reader to the global-config stage on the Pipeline
   *  tab, where the two merge layers are edited now. Always a live link: the
   *  zone is shell-only (ConfigColumn renders it once a result exists), so the
   *  pipeline it points at is always there. */
  onShowPipelineLayers: () => void;
}

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
function HostAccessSection({
  open,
  onOpenChange,
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
> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <details
      className="advanced-settings"
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
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
  tokenSet,
  tokenValid,
  onSignIn,
  onSignOut,
  onClearToken,
  onRevealToken,
}: {
  oauthConfigured: boolean;
  signedIn: boolean;
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
function GithubHostRow({
  host,
  isPlatform,
  oauthConfigured,
  signedIn,
  onSignIn,
  onSignOut,
}: {
  host: HostTokenField;
  isPlatform: boolean;
  oauthConfigured: boolean;
  signedIn: boolean;
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
function HostTokenRow({ host }: { host: HostTokenField }) {
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

/** The quick-fill chips: one per host type that has no token yet. */
function AddHostChips({
  hosts,
  selected,
  onSelect,
}: {
  hosts: HostTokenField[];
  selected: HostTokenId;
  onSelect: (id: HostTokenId) => void;
}) {
  return (
    <div className="host-add-quick">
      <span className="advanced-hint">Quick fill:</span>
      {hosts.map((host) => (
        <button
          key={host.id}
          type="button"
          className="btn-secondary host-chip"
          aria-pressed={host.id === selected}
          onClick={() => onSelect(host.id)}
        >
          {host.host}
        </button>
      ))}
    </div>
  );
}

/**
 * Roadmap 076: adding a host reads as a sentence with two blanks — "Requests to
 * ⟨host⟩ authenticate with ⟨token⟩" — rather than as a form. Which is what
 * `hostRules` entries actually are, and it keeps the collapsed list to the
 * hosts that mean something.
 */
function AddHostForm({ hosts }: { hosts: HostTokenField[] }) {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState<HostTokenId | null>(null);
  const [token, setToken] = useState("");
  const first = hosts[0];
  if (!first) {
    return null;
  }
  const selected = hosts.find((host) => host.id === wanted) ?? first;
  if (!open) {
    return (
      <button type="button" className="btn-quiet host-add-toggle" onClick={() => setOpen(true)}>
        + Add host…
      </button>
    );
  }
  const close = () => {
    setOpen(false);
    setToken("");
  };
  return (
    <div className="host-add">
      <AddHostChips hosts={hosts} selected={selected.id} onSelect={setWanted} />
      <p className="host-add-sentence">
        Requests to{" "}
        <select
          className="blank-select"
          aria-label="Host to authenticate against"
          value={selected.id}
          onChange={(e) => setWanted(e.target.value as HostTokenId)}
          onKeyDown={openPickerOnEnter}
        >
          {hosts.map((host) => (
            <option key={host.id} value={host.id}>
              {host.host}
            </option>
          ))}
        </select>{" "}
        authenticate with{" "}
        <input
          className="blank-input"
          type="password"
          aria-label={`${selected.label} token`}
          placeholder="token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </p>
      <div className="host-add-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={token === ""}
          onClick={() => {
            selected.onChange(token);
            setWanted(null);
            close();
          }}
        >
          Add host
        </button>
        <button type="button" className="btn-secondary" onClick={close}>
          Cancel
        </button>
        <span className="advanced-hint host-add-note">tokens stay in this tab</span>
      </div>
    </div>
  );
}

/**
 * The credentials this browser tab is carrying, one row per host — the shape
 * `hostRules` has in a real config, which is the vocabulary a reader who needs
 * this at all already has.
 */
function CredentialsList({
  hostTokens,
  displayPlatform,
  oauthConfigured,
  signedIn,
  onSignIn,
  onSignOut,
  count,
}: Pick<
  Props,
  "hostTokens" | "displayPlatform" | "oauthConfigured" | "signedIn" | "onSignIn" | "onSignOut"
> & { count: number }) {
  const github = hostTokens.find((host) => host.id === "github");
  const others = hostTokens.filter((host) => host.id !== "github");
  return (
    <div className="host-list">
      <div className="host-list-head">
        <span className="host-list-title">Credentials</span>
        <span className="advanced-hint">
          {" "}
          · like <code>hostRules</code>
        </span>
        <span className="pill pill-count host-list-count">
          {count} host{count === 1 ? "" : "s"}
        </span>
      </div>
      {github ? (
        <GithubHostRow
          host={github}
          isPlatform={displayPlatform === "github"}
          oauthConfigured={oauthConfigured}
          signedIn={signedIn}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
        />
      ) : null}
      {others
        .filter((host) => host.value !== "")
        .map((host) => (
          <HostTokenRow key={host.id} host={host} />
        ))}
      <AddHostForm hosts={others.filter((host) => host.value === "")} />
      {/* Roadmap 030: the "header injection" rule (control characters, incl.
          CR/LF, or an unreasonable length) — a token failing this was never
          written to storage (see `useHostTokens`). */}
      {hostTokens
        .filter((host) => host.value && !isValidToken(host.value))
        .map((host) => (
          <p className="layer-editor-error" key={host.id}>
            {host.label} token contains characters that can&apos;t be sent in a request header, or
            is too long — it was not saved.
          </p>
        ))}
    </div>
  );
}

/** The drawer's opening paragraph, and the one sentence that says where the
 *  two merge layers went. */
function AdvancedIntro({ onShowPipelineLayers }: Pick<Props, "onShowPipelineLayers">) {
  return (
    <p className="advanced-intro">
      Everything here is optional — the defaults suit a repository on github.com using the hosted
      Renovate app.{" "}
      <button type="button" className="btn-quiet" onClick={onShowPipelineLayers}>
        Self-hosted bot layers (global, inherited) are edited on the Pipeline tab
      </button>
    </p>
  );
}

/** The drawer's collapsed line: what host this session talks to, and whether it
 *  is carrying anything to talk to it WITH. */
function AdvancedSummary({
  context,
  count,
  isDefault,
}: {
  context: string;
  count: number;
  isDefault: boolean;
}) {
  return (
    <summary>
      Advanced
      <span className="advanced-hint"> — hosts &amp; credentials</span>
      <code className="advanced-context">{context}</code>
      {isDefault ? (
        <span className="pill pill-count advanced-active-chip">default</span>
      ) : (
        <span className="pill pill-count advanced-active-chip">
          {count} credential{count === 1 ? "" : "s"}
        </span>
      )}
    </summary>
  );
}

/** `github · api.github.com` — the platform and the HOST of its endpoint, which
 *  is the half of the URL that says where anything is actually going. */
function contextLine(platform: string, endpoint: string): string {
  const effective = endpoint || PLATFORM_ENDPOINTS[platform] || "";
  if (effective === "") {
    return `${platform} · not fetched in the browser`;
  }
  try {
    return `${platform} · ${new URL(effective).host}`;
  } catch {
    return `${platform} · ${effective}`;
  }
}

export function AdvancedZone({
  open,
  onOpenChange,
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
  oauthConfigured,
  signedIn,
  onSignIn,
  onSignOut,
  hostTokens,
  onShowPipelineLayers,
}: Props) {
  const summary = credentialsSummary({
    tokens: hostTokens,
    signedIn: oauthConfigured && signedIn,
    platform: displayPlatform,
    endpoint: displayEndpoint,
  });
  return (
    <details
      className="advanced-zone"
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
    >
      <AdvancedSummary
        context={contextLine(displayPlatform, displayEndpoint)}
        count={summary.count}
        isDefault={summary.isDefault}
      />

      <AdvancedIntro onShowPipelineLayers={onShowPipelineLayers} />

      <HostAccessSection
        open={hostSectionOpen}
        onOpenChange={onHostSectionOpenChange}
        displayPlatform={displayPlatform}
        displayEndpoint={displayEndpoint}
        onPlatformChange={onPlatformChange}
        onEndpointChange={onEndpointChange}
        reflectGlobal={reflectGlobal}
        globalPlatform={globalPlatform}
        globalEndpoint={globalEndpoint}
        platformOverride={platformOverride}
        hasGlobalContext={hasGlobalContext}
        onUseGlobalValues={onUseGlobalValues}
        usesLocal={usesLocal}
        platform={platform}
      />

      <CredentialsList
        hostTokens={hostTokens}
        displayPlatform={displayPlatform}
        oauthConfigured={oauthConfigured}
        signedIn={signedIn}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        count={summary.count}
      />
    </details>
  );
}
