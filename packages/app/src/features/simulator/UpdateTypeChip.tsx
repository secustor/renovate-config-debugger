import type { KeyboardEvent } from "react";
import { UPDATE_TYPES } from "./form";

/** The note the chip carries — 047's `UpdateTypeLine` sentence, now a title. */
function derivationNote(
  effectiveUpdateType: string,
  derivedUpdateType: string | undefined,
  currentValue: string,
  newValue: string,
): string {
  const pair = `${currentValue.trim() || "?"} → ${newValue.trim() || "?"}`;
  const hasPair = currentValue.trim() !== "" && newValue.trim() !== "";
  if (derivedUpdateType !== undefined && effectiveUpdateType === derivedUpdateType) {
    return `derived from ${pair} — click to override`;
  }
  if (effectiveUpdateType !== "") {
    return "not derived from these versions — click to change it";
  }
  if (hasPair) {
    return `no update type could be derived from ${pair} — click to set one`;
  }
  return "fill the version pair to derive it — click to set one";
}

/**
 * Roadmap 079: `updateType` inside the sentence, as the design's amber
 * "derived" chip — a value the form STATES rather than asks for, wearing the
 * dashed warn border that means "worked out, not typed", and opening the
 * nine-type override on a click.
 *
 * The override is a real `<select>` sized to the chip and painted out
 * (`opacity: 0`), not a menu of our own: a click anywhere on the chip is the
 * platform's own picker, keyboard and screen-reader behaviour come free, and
 * every 015 semantic survives untouched — the value tracks currentValue →
 * newValue while nobody has chosen, a choice pins it, and the states that
 * cannot be derived say so in the chip's text and title instead of posing as a
 * derivation (`derivationNote`, which is 047's line word for word).
 */
export function UpdateTypeChip({
  effectiveUpdateType,
  derivedUpdateType,
  currentValue,
  newValue,
  onChange,
  onKeyDown,
}: {
  effectiveUpdateType: string;
  derivedUpdateType: string | undefined;
  currentValue: string;
  newValue: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLSelectElement>) => void;
}) {
  const note = derivationNote(effectiveUpdateType, derivedUpdateType, currentValue, newValue);
  return (
    <span className="sim-ut-chip">
      {/* The visible value, so the chip is only as wide as the type it shows —
          a `<select>` sizes itself to `lockFileMaintenance` whatever is
          selected, which would put a permanent gap in the sentence. */}
      <span className="sim-ut-value" aria-hidden="true">
        {effectiveUpdateType || "(unset)"}
      </span>
      <span className="sim-ut-caret" aria-hidden="true">
        ▾
      </span>
      <select
        className="sim-ut-select"
        aria-label="updateType"
        title={note}
        value={effectiveUpdateType}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      >
        <option value="">(unset)</option>
        {UPDATE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </span>
  );
}
