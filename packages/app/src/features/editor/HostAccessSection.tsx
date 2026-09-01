/**
 * Roadmap 010 — the "Repository host" disclosure: the platform context preset
 * fetches resolve against, and what a pasted global config contributes to it.
 *
 * The CREDENTIAL rows this file used to also hold moved to `HostRows.tsx`
 * (their only consumer is `CredentialsList`, and the two halves share nothing
 * but the folder).
 */
import type { AdvancedZoneProps } from "./AdvancedZone";
import { isValidEndpoint } from "@/lib/input-schemas";
import { openPickerOnEnter } from "@/lib/select-picker";
import { PLATFORM_ENDPOINTS, PLATFORMS } from "@/data/platform-endpoints";
import { Term } from "@/components/glossary";

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
    <p className="advanced-note">
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
}: Pick<
  AdvancedZoneProps,
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
        {/* The platform this note is about is the one the run resolves against
            — `displayPlatform`, the same value every row above renders. Reading
            the stored local platform here would both suppress the note (a
            pasted global `bitbucket` over a stored `github` has an endpoint)
            and name the wrong host when it did show. */}
        {usesLocal && !PLATFORM_ENDPOINTS[displayPlatform] ? (
          <p className="advanced-note">
            <code>{displayPlatform}</code> presets are not fetched in the browser — a real Renovate
            run reaches them. You can still provide their content manually from a failed node below.
          </p>
        ) : null}
      </div>
    </details>
  );
}
