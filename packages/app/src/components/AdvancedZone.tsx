import { Term } from "../glossary";
import { isValidEndpoint, isValidToken, type LayerParseResult } from "../input-schemas";
import { PLATFORM_ENDPOINTS, PLATFORMS } from "../platform-endpoints";
import type { HostTokenField } from "../use-host-tokens";

/**
 * Roadmap 040 — the single collapsed home of everything a typical repo user
 * never touches (repository host + tokens, the self-hosted 008 layers), lifted
 * out of App.tsx by the JSX-depth ratchet. It owns no state: the two
 * disclosures are controlled by App (a share link carrying self-hosted layers
 * opens them, and an untrusted-endpoint guard opens the host section so the
 * field it tells the user to review is actually on screen).
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostSectionOpen: boolean;
  onHostSectionOpenChange: (open: boolean) => void;
  globalParse: LayerParseResult;
  inheritedParse: LayerParseResult;
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
  /** Whether OAuth sign-in is configured — the PAT note reads differently when
   *  a token is only a fallback (009). */
  oauthConfigured: boolean;
  hostTokens: HostTokenField[];
  globalText: string;
  onGlobalTextChange: (value: string) => void;
  inheritedText: string;
  onInheritedTextChange: (value: string) => void;
}

export function AdvancedZone({
  open,
  onOpenChange,
  hostSectionOpen,
  onHostSectionOpenChange,
  globalParse,
  inheritedParse,
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
  hostTokens,
  globalText,
  onGlobalTextChange,
  inheritedText,
  onInheritedTextChange,
}: Props) {
  return (
    <details
      className="advanced-zone"
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
    >
      <summary>
        Advanced options
        <span className="advanced-hint">
          {" "}
          — repository host, access tokens, self-hosted bot config
        </span>
        {globalParse.config || inheritedParse.config ? (
          <span className="advanced-active-chip">self-hosted config active</span>
        ) : null}
        {globalParse.error || inheritedParse.error ? (
          <span className="advanced-active-chip invalid">invalid JSON</span>
        ) : null}
      </summary>

      <p className="advanced-intro">
        Everything here is optional — the defaults suit a repository on github.com using the hosted
        Renovate app.
      </p>

      <details
        className="advanced-settings"
        open={hostSectionOpen}
        onToggle={(e) => onHostSectionOpenChange(e.currentTarget.open)}
      >
        <summary>
          Repository host &amp; access tokens
          <span className="advanced-hint">
            {" "}
            — where presets that live in other repositories are fetched from
          </span>
        </summary>
        <div className="advanced-body">
          <p className="advanced-note">
            Some presets live in other repositories on your <Term id="platform">
              code host
            </Term>{" "}
            (referenced as{" "}
            <Term id="localPreset">
              <code>local&gt;</code>
            </Term>{" "}
            or a bare <code>owner/repo</code>). Set the host and API endpoint they should resolve
            against.
          </p>
          <div className="advanced-row">
            <label>
              Platform
              <select value={displayPlatform} onChange={(e) => onPlatformChange(e.target.value)}>
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
          {/* Roadmap 030: the "dangerous URL" rule, surfaced inline
              (014/023 style) — the same check that gates Run in
              `blockedByLayerErrors` and the one that keeps a bad
              value out of storage in `onEndpointChange`. */}
          {displayEndpoint && !isValidEndpoint(displayEndpoint) ? (
            <p className="layer-editor-error">
              Not a valid endpoint: must be an http(s) URL. The pipeline won&apos;t run until this
              is fixed or the field is cleared.
            </p>
          ) : null}
          {reflectGlobal ? (
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
              come from the pasted global config — a real Renovate run would use them. Changing the
              control overrides them for this visualization.
            </p>
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
          {oauthConfigured ? (
            <p className="advanced-note">
              Signing in with GitHub (top of the page) is the recommended way to reach private
              GitHub presets and repos. A personal access token is only a fallback — for GitHub
              Enterprise Server, when the app installation can&apos;t be approved, or if the sign-in
              service is unavailable.
            </p>
          ) : (
            <p className="advanced-note">
              A GitHub personal access token lifts preset rate limits and reaches private
              repositories. It stays in this browser tab only.
            </p>
          )}
          <div className="advanced-row">
            {hostTokens.map((host) => (
              <label className="grow" key={host.id}>
                {host.inputLabel}
                <input
                  type="password"
                  placeholder="optional — stays in this browser tab"
                  value={host.value}
                  onChange={(e) => host.onChange(e.target.value)}
                />
              </label>
            ))}
          </div>
          {/* Roadmap 030: the "header injection" rule (control
              characters, incl. CR/LF, or an unreasonable length) —
              a token failing this was never written to storage
              (see `useHostTokens`). */}
          {hostTokens
            .filter((host) => host.value && !isValidToken(host.value))
            .map((host) => (
              <p className="layer-editor-error" key={host.id}>
                {host.label} token contains characters that can&apos;t be sent in a request header,
                or is too long — it was not saved.
              </p>
            ))}
        </div>
      </details>

      <details className="advanced-settings">
        <summary>
          Global config
          <span className="advanced-hint">
            {" "}
            — bot-level settings from a self-hosted administrator
            {globalParse.config ? " · active" : ""}
            {globalParse.error ? " · invalid JSON" : ""}
          </span>
        </summary>
        <div className="advanced-body">
          <p className="advanced-note">
            Running your own Renovate bot? Paste its <Term id="globalConfig">global config</Term> as
            JSON to model the full layer stack: it merges between Renovate&apos;s defaults and your
            repo config, after its own <code>globalExtends</code> presets. Options like{" "}
            <code>platform</code>, <code>endpoint</code> or <code>onboarding</code> become run
            context instead of merging. Leave empty to run without this layer.
          </p>
          <textarea
            className="layer-editor"
            placeholder='{ "globalExtends": ["config:best-practices"], "platform": "gitlab" }'
            value={globalText}
            onChange={(e) => onGlobalTextChange(e.target.value)}
            spellCheck={false}
            rows={8}
          />
          {globalParse.error ? (
            <p className="layer-editor-error">
              Not valid JSON: {globalParse.error}. The pipeline won&apos;t run until this parses or
              the field is cleared.
            </p>
          ) : null}
        </div>
      </details>

      <details className="advanced-settings">
        <summary>
          Inherited config
          <span className="advanced-hint">
            {" "}
            — org-wide defaults shared across repositories
            {inheritedParse.config ? " · active" : ""}
            {inheritedParse.error ? " · invalid JSON" : ""}
          </span>
        </summary>
        <div className="advanced-body">
          <p className="advanced-note">
            Defaults a self-hosted bot shares across repositories via{" "}
            <Term id="inheritedConfig">
              <code>inheritConfig</code>
            </Term>
            . Validated with Renovate&apos;s inherit rules, its presets resolved, bot-only options
            stripped — then merged between the global layer and the repo config. Leave empty to run
            without this layer.
          </p>
          <textarea
            className="layer-editor"
            placeholder='{ "extends": ["github>my-org/renovate-config"], "automerge": false }'
            value={inheritedText}
            onChange={(e) => onInheritedTextChange(e.target.value)}
            spellCheck={false}
            rows={8}
          />
          {inheritedParse.error ? (
            <p className="layer-editor-error">
              Not valid JSON: {inheritedParse.error}. The pipeline won&apos;t run until this parses
              or the field is cleared.
            </p>
          ) : null}
        </div>
      </details>
    </details>
  );
}
