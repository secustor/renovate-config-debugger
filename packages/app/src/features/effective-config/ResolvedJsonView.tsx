import type { ResolvedConfigMode, ResolvedConfigOutput } from "@renovate-config-debugger/engine";
import { ConfigJson } from "@/components/ConfigJson";
import { CopyButton } from "@/components/CopyButton";
import type { DescriptionCards } from "@/lib/description-attribution";
import { openPickerOnEnter } from "@/lib/select-picker";
import { resolvedConfigText } from "./resolved-json";

/** The JSON view's options row — the same chrome-row grammar as EffectiveToolbar,
 *  its own component for the same depth-ratchet reason. */
function ResolvedOptionsRow({
  expand,
  onExpandChange,
  includeDefaults,
  onIncludeDefaultsChange,
  defaultsCount,
  getText,
}: {
  expand: ResolvedConfigMode;
  onExpandChange: (mode: ResolvedConfigMode) => void;
  includeDefaults: boolean;
  onIncludeDefaultsChange: (checked: boolean) => void;
  defaultsCount: number;
  /** Null while the document is still computing — the copy button waits. */
  getText: (() => string) | null;
}) {
  return (
    <div className="prov-filters">
      <label className="resolved-label" htmlFor="resolved-expand">
        Expand presets:
      </label>
      <select
        id="resolved-expand"
        onKeyDown={openPickerOnEnter}
        value={expand}
        onChange={(e) => onExpandChange(e.target.value as ResolvedConfigMode)}
      >
        <option value="keep-internal">keep internal presets</option>
        <option value="full">fully</option>
      </select>
      <label
        className="prov-check"
        title={
          expand === "keep-internal"
            ? "Defaults apply to the fully expanded document only — written into a config that still extends presets, they would override those presets"
            : "Also write out every option Renovate defaults — the fully hydrated document"
        }
      >
        <input
          type="checkbox"
          checked={includeDefaults}
          disabled={expand === "keep-internal"}
          onChange={(e) => onIncludeDefaultsChange(e.target.checked)}
        />{" "}
        include defaults ({defaultsCount})
      </label>
      {getText ? (
        <CopyButton
          className="resolved-copy"
          getText={getText}
          label="Copy resolved config"
          title="Copy this document as JSON — ready to paste into a renovate.json"
        />
      ) : null}
    </div>
  );
}

/**
 * Roadmap 051: the resolved config as a standalone document — hosted presets
 * inlined, internal presets kept as `extends` references (or everything
 * expanded). The counterpart artifact to the Rewrites tab's "Copy migrated
 * config", which owns the pre-resolution document.
 */
export function ResolvedJsonView({
  output,
  expand,
  onExpandChange,
  includeDefaults,
  onIncludeDefaultsChange,
  defaultsCount,
  descriptions,
  onSelectPreset,
}: {
  output: ResolvedConfigOutput | null | undefined;
  expand: ResolvedConfigMode;
  onExpandChange: (mode: ResolvedConfigMode) => void;
  includeDefaults: boolean;
  onIncludeDefaultsChange: (checked: boolean) => void;
  defaultsCount: number;
  /** Roadmap 069 (PR 5): per-string `description` attribution, attached to the
   *  document's own strings when this document IS the array it indexes — which
   *  `ConfigJson` decides, since only the emitted document can answer that. */
  descriptions?: DescriptionCards | null;
  onSelectPreset?: (nodeId: string) => void;
}) {
  return (
    <>
      <ResolvedOptionsRow
        expand={expand}
        onExpandChange={onExpandChange}
        includeDefaults={includeDefaults}
        onIncludeDefaultsChange={onIncludeDefaultsChange}
        defaultsCount={defaultsCount}
        getText={output ? () => resolvedConfigText(output) : null}
      />
      {output === undefined ? <p className="empty-note">Computing…</p> : null}
      {output === null ? (
        <p className="empty-note">
          This document needs a completed preset resolution — see the Problems tab.
        </p>
      ) : null}
      {output ? (
        <pre className="config-view">
          <ConfigJson
            value={output.config}
            descriptions={descriptions}
            onSelectPreset={onSelectPreset}
          />
        </pre>
      ) : null}
      {output && output.divergingKeys.length > 0 ? (
        <p className="resolved-caveat">
          Merge-order caveat: <code>{output.divergingKeys.join(", ")}</code> would resolve
          differently from this document — a kept internal preset written after an inlined preset
          now merges first. Switch “Expand presets” to “fully” for an exact document.
        </p>
      ) : null}
      <p className="empty-note">
        Need the config <em>before</em> preset resolution? The Rewrites tab’s “Copy migrated config”
        has it — syntax modernised, extends untouched.
      </p>
    </>
  );
}
