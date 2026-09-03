import type { InputVerdict, PatternVerdict } from "./pattern-tests";

/**
 * Roadmap 094: the two row shapes inside an open pattern-test card.
 *
 * A PATTERN row is the pattern itself (editable in place), its hit count over
 * the inputs, and the chips saying how upstream reads it. An INPUT row is the
 * mark upstream gave it, the value (editable), the expectation the reader
 * holds about it, and — when the mark alone would leave a reader guessing —
 * the one-line why.
 */

export function PatternRow({
  verdict,
  index,
  onChange,
  onRemove,
}: {
  verdict: PatternVerdict;
  index: number;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className={verdict.dead ? "pattern-row pattern-row-dead" : "pattern-row"}>
      <div className="pattern-row-main">
        <input
          type="text"
          className="pattern-row-value"
          aria-label={`Pattern ${index + 1}`}
          value={verdict.pattern}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="pattern-count" title="Inputs this pattern matches">
          {verdict.count}
        </span>
        <button
          type="button"
          className="pin-remove"
          aria-label={`Remove pattern ${verdict.pattern}`}
          title="Remove"
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      <div className="pattern-chips">
        {verdict.chips.map((chip) => (
          <span key={chip} className="pill pill-count">
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

export function InputRow({
  verdict,
  index,
  onChange,
  onFlip,
  onRemove,
}: {
  verdict: InputVerdict;
  index: number;
  onChange: (value: string) => void;
  onFlip: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={verdict.pass ? "pattern-input" : "pattern-input pattern-input-fail"}>
      <div className="pattern-row-main">
        <span
          className={`pin-section-mark ${verdict.matches ? "mark-ok" : "mark-error"}`}
          aria-hidden="true"
        >
          {verdict.matches ? "✓" : "✗"}
        </span>
        <span className="visually-hidden">{verdict.matches ? "matches" : "does not match"}</span>
        <input
          type="text"
          className="pattern-row-value"
          aria-label={`Input ${index + 1}`}
          value={verdict.value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="btn-chip pattern-expect"
          title="Toggle expectation"
          aria-pressed={verdict.expect}
          onClick={onFlip}
        >
          {verdict.expect ? "should match" : "should not"}
        </button>
        <button
          type="button"
          className="pin-remove"
          aria-label={`Remove input ${verdict.value}`}
          title="Remove"
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      {verdict.why === null ? null : <span className="pattern-why">{verdict.why}</span>}
    </div>
  );
}
