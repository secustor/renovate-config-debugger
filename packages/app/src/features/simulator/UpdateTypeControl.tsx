import type { KeyboardEvent } from "react";
import { Term } from "@/components/glossary";
import { UPDATE_TYPES } from "./form";

/** Roadmap 015: the manual updateType override — offered only once the user
 *  has asked for it, and then pinned to their choice. */
export function UpdateTypeSelect({
  value,
  onChange,
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div className="sim-form sim-form-updatetype">
      <label className="sim-field">
        <Term id="updateType">updateType</Term>
        <select value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}>
          <option value="">(unset)</option>
          {UPDATE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * Roadmap 015/047: `updateType` is no longer a primary field — 015's
 * derivation already answers it, so the form states the derived value and
 * offers the select only on demand ("cut before you hide"). Every 015
 * semantic is intact: the value tracks currentValue → newValue live while
 * untouched, "override" pins the user's own choice, and a value that could
 * NOT be derived says so instead of posing as a derivation.
 */
export function UpdateTypeLine({
  effectiveUpdateType,
  derivedUpdateType,
  currentValue,
  newValue,
  onOverride,
}: {
  effectiveUpdateType: string;
  derivedUpdateType: string | undefined;
  currentValue: string;
  newValue: string;
  onOverride: () => void;
}) {
  const derived = derivedUpdateType !== undefined && effectiveUpdateType === derivedUpdateType;
  const pair = `${currentValue.trim() || "?"} → ${newValue.trim() || "?"}`;
  const hasPair = currentValue.trim() !== "" && newValue.trim() !== "";
  let note: string;
  if (derived) {
    note = `derived from ${pair}`;
  } else if (effectiveUpdateType !== "") {
    note = "not derived from these versions";
  } else if (hasPair) {
    note = `no update type could be derived from ${pair}`;
  } else {
    note = "fill the version pair to derive it";
  }
  return (
    <p className="sim-derived-line">
      <span className="value">
        <Term id="updateType">updateType</Term>: {effectiveUpdateType || "(unset)"}
      </span>{" "}
      — {note} ·{" "}
      <button type="button" className="sim-link" onClick={onOverride}>
        {effectiveUpdateType === "" ? "set one" : "override"}
      </button>
    </p>
  );
}
