import type { ReactNode } from "react";
import { Term } from "./glossary";
import type { InheritLayerState } from "@/lib/inherit-probe";
import { isValidEndpoint, isValidToken, type LayerParseResult } from "@/lib/input-schemas";
import { PLATFORM_ENDPOINTS, PLATFORMS } from "@/data/platform-endpoints";
import type { HostTokenField } from "@/hooks/use-host-tokens";

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
  /** Roadmap 045: what the last inherited-config probe did, already framed by
   *  the pasted global config's `inheritConfig*` options. Null = no probe has
   *  run (or the layer has been edited since, which makes it a pasted layer). */
  inheritState: InheritLayerState | null;
  /** The inherited section is controlled (like the host section above) so a
   *  probe that just filled the layer can open the section its result is in. */
  inheritedSectionOpen: boolean;
  onInheritedSectionOpenChange: (open: boolean) => void;
}

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
  );
}

/** Where presets living in other repositories are fetched from: the platform
 *  context (010), what the global config contributes to it, and the per-host
 *  access tokens (033's table, mapped over twice — inputs and error rows). */
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
  oauthConfigured,
  hostTokens,
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
  | "oauthConfigured"
  | "hostTokens"
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
        Repository host &amp; access tokens
        <span className="advanced-hint">
          {" "}
          — where presets that live in other repositories are fetched from
        </span>
      </summary>
      <div className="advanced-body">
        <p className="advanced-note">
          Some presets live in other repositories on your <Term id="platform">code host</Term>{" "}
          (referenced as{" "}
          <Term id="localPreset">
            <code>local&gt;</code>
          </Term>{" "}
          or a bare <code>owner/repo</code>). Set the host and API endpoint they should resolve
          against.
        </p>
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
            Signing in with GitHub (top of the page) is the recommended way to reach private GitHub
            presets and repos. A personal access token is only a fallback — for GitHub Enterprise
            Server, when the app installation can&apos;t be approved, or if the sign-in service is
            unavailable.
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
              {host.label} token contains characters that can&apos;t be sent in a request header, or
              is too long — it was not saved.
            </p>
          ))}
      </div>
    </details>
  );
}

/**
 * Roadmap 045: what the last inherited-config probe did, in the three states
 * the approved mockup defines. Rendered between the section's note and its
 * editor, above the text the probe wrote — an auto-filled layer says where it
 * came from and that editing it makes it the user's own (which is literally
 * true: any edit clears this line, and the layer is a pasted one from then on).
 */
function InheritStateNote({ state }: { state: InheritLayerState }) {
  const target = (
    <>
      <code>{state.target.repo}</code> · <code>{state.target.file}</code>
    </>
  );
  if (state.kind === "auto-loaded") {
    return (
      <>
        <p className="layer-origin">
          <span className="badge auto">auto-loaded</span>
          from {target}
          {state.disabledByGlobal ? null : " — editing makes it yours, like a pasted layer."}
        </p>
        {state.disabledByGlobal ? (
          <p className="layer-hint">
            Your global config sets <code>inheritConfig: false</code> — a run under that global
            config would not apply this layer.
          </p>
        ) : null}
      </>
    );
  }
  if (state.kind === "missing") {
    // Absent file, `inheritConfigStrict` off (the default): a real run carries
    // on without the layer, so the app does too — quietly.
    return state.strict ? (
      <p className="layer-editor-error">
        Your global config sets <code>inheritConfigStrict: true</code> and{" "}
        <code>{state.target.repo}</code> has no <code>{state.target.file}</code> (404) — a real run
        would abort here instead of continuing without the layer.
      </p>
    ) : (
      <p className="advanced-note">
        No org inherited config: <code>{state.target.repo}</code> has no{" "}
        <code>{state.target.file}</code> (404). A real run tolerates this too (
        <code>inheritConfigStrict</code> is off by default).
      </p>
    );
  }
  // A refused request is not an absent file: say which it was.
  return (
    <p className={state.strict ? "layer-editor-error" : "advanced-note"}>
      Couldn&apos;t look for an inherited config in {target}: {state.detail}
      {state.strict ? (
        <>
          {" "}
          Your global config sets <code>inheritConfigStrict: true</code>, so a real run would abort
          on this.
        </>
      ) : (
        // The engine's own detail already names the cause (CORS, a missing
        // token, a rate limit), so this only says what the user can do next.
        " You can paste the layer by hand below."
      )}
    </p>
  );
}

/** Roadmap 008: one pasted config layer (global or inherited). The two are the
 *  same section down to the error text — only the copy, the placeholder and
 *  the state they bind to differ — so they share this component rather than
 *  restating it, which is also what 040's depth budget affords. */
function LayerSection({
  title,
  hint,
  note,
  banner,
  placeholder,
  value,
  onChange,
  parse,
  open,
  onOpenChange,
}: {
  title: string;
  /** The em-dashed hint text, verbatim (the dash is part of the copy). */
  hint: string;
  note: ReactNode;
  /** Roadmap 045: state about where this layer's text came from, above it. */
  banner?: ReactNode;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  parse: LayerParseResult;
  /** Controlled only where something outside has to be able to open the
   *  section (the inherited layer, once a probe filled it); the global layer
   *  passes neither and stays a plain uncontrolled disclosure. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <details
      className="advanced-settings"
      {...(open === undefined ? {} : { open })}
      onToggle={onOpenChange ? (e) => onOpenChange(e.currentTarget.open) : undefined}
    >
      <summary>
        {title}
        <span className="advanced-hint">
          {" "}
          {hint}
          {parse.config ? " · active" : ""}
          {parse.error ? " · invalid JSON" : ""}
        </span>
      </summary>
      <div className="advanced-body">
        {note}
        {banner}
        <textarea
          className="layer-editor"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          rows={8}
        />
        {parse.error ? (
          <p className="layer-editor-error">
            Not valid JSON: {parse.error}. The pipeline won&apos;t run until this parses or the
            field is cleared.
          </p>
        ) : null}
      </div>
    </details>
  );
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
  inheritState,
  inheritedSectionOpen,
  onInheritedSectionOpenChange,
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
        oauthConfigured={oauthConfigured}
        hostTokens={hostTokens}
      />

      <LayerSection
        title="Global config"
        hint="— bot-level settings from a self-hosted administrator"
        note={
          <p className="advanced-note">
            Running your own Renovate bot? Paste its <Term id="globalConfig">global config</Term> as
            JSON to model the full layer stack: it merges between Renovate&apos;s defaults and your
            repo config, after its own <code>globalExtends</code> presets. Options like{" "}
            <code>platform</code>, <code>endpoint</code> or <code>onboarding</code> become run
            context instead of merging. Leave empty to run without this layer.
          </p>
        }
        placeholder='{ "globalExtends": ["config:best-practices"], "platform": "gitlab" }'
        value={globalText}
        onChange={onGlobalTextChange}
        parse={globalParse}
      />

      <LayerSection
        title="Inherited config"
        hint="— org-wide defaults shared across repositories"
        note={
          <p className="advanced-note">
            Defaults a self-hosted bot shares across repositories via{" "}
            <Term id="inheritedConfig">
              <code>inheritConfig</code>
            </Term>
            . Validated with Renovate&apos;s inherit rules, its presets resolved, bot-only options
            stripped — then merged between the global layer and the repo config. Leave empty to run
            without this layer, or let a repo load fetch it for you.
          </p>
        }
        banner={inheritState ? <InheritStateNote state={inheritState} /> : null}
        placeholder='{ "extends": ["github>my-org/renovate-config"], "automerge": false }'
        value={inheritedText}
        onChange={onInheritedTextChange}
        parse={inheritedParse}
        open={inheritedSectionOpen}
        onOpenChange={onInheritedSectionOpenChange}
      />
    </details>
  );
}
