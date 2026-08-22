import { type KeyboardEvent, type ReactNode, useState } from "react";
import { joinValues, splitValues } from "./form";

function ValueChip({ value, onRemove }: { value: string; onRemove: () => void }) {
  return (
    <span className="sim-chip">
      {value}
      <button
        type="button"
        className="sim-chip-remove"
        aria-label={`Remove ${value}`}
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  );
}

/**
 * Roadmap 079: `registryUrls`, `lockFiles` and `categories` as chips — a box
 * that looks like an input, one pill per committed value, and a borderless
 * draft input that Enter turns into the next pill.
 *
 * The chips are a VIEW over the comma-separated string `FormState` has always
 * held (`splitValues`/`joinValues`): the share-link codec encodes the form as
 * flat strings and `toDescriptor` splits these three on commas, so a second
 * representation would be a second thing to keep in step for no gain. A value
 * containing a comma stays inexpressible, exactly as it was in the text field.
 *
 * Not a `<label>` wrapper, unlike `Field`: a label associates with the first
 * LABELABLE descendant, and here that would be a chip's remove button rather
 * than the draft input. The name rides on the input as `aria-label` instead.
 */
export function MultiValueInput({
  name,
  label,
  value,
  onChange,
  placeholder,
}: {
  /** The field's Renovate name — the draft input's accessible name. */
  name: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  // Deduplicated, which is what makes each chip's own value its React key: a
  // repeated registry URL or category is meaningless to every matcher that
  // reads these, so a duplicate is a typo the chip view simply doesn't show
  // twice. Any edit writes the deduplicated list back.
  const values = [...new Set(splitValues(value))];

  function commit() {
    const next = draft.trim();
    if (next === "") {
      return;
    }
    onChange(joinValues(values.includes(next) ? values : [...values, next]));
    setDraft("");
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Roadmap 068's rule, third consumer: ⌘/Ctrl+⏎ is the app's Run chord and
    // must reach the page listener, so only a BARE Enter is claimed here. That
    // one always is — it commits a chip, and it must never also submit the
    // form, which is what `preventDefault` declines even when the draft is
    // empty (an empty draft is a mis-press, not a request for a verdict).
    if (e.key !== "Enter" || e.metaKey || e.ctrlKey) {
      return;
    }
    e.preventDefault();
    commit();
  }

  return (
    <div className="sim-field sim-field-multi">
      {label}
      <span className="sim-multi-box">
        {values.map((item, i) => (
          <ValueChip
            key={item}
            value={item}
            onRemove={() => onChange(joinValues(values.filter((_, j) => j !== i)))}
          />
        ))}
        <input
          type="text"
          className="sim-multi-draft"
          aria-label={name}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={keyDown}
          // Committing on blur would silently turn an abandoned half-typed
          // value into a matcher input; the draft simply stays visible instead.
          spellCheck={false}
        />
      </span>
    </div>
  );
}
