import { useState } from "react";
import { Caret } from "@/components/Caret";
import { CopyButton } from "@/components/CopyButton";
import { type DescriptorEntry, descriptorEntries, descriptorJsonText } from "./descriptor-json";
import type { FormState } from "@/types/simulator";

function JsonLine({ entry, comma }: { entry: DescriptorEntry; comma: boolean }) {
  return (
    <span>
      {"  "}
      <span className="sim-json-key">{JSON.stringify(entry.key)}</span>
      {": "}
      {/* A string is the common case and wears the string colour; a
          `registryUrls` array or the `isBump` flag is not one, and colouring it
          as if it were would be the document lying about its own types. */}
      <span className={entry.isString ? "sim-json-str" : undefined}>{entry.json}</span>
      {comma ? ",\n" : "\n"}
    </span>
  );
}

/**
 * Roadmap 079: the descriptor itself, printed. The document is
 * `descriptor-json.ts`'s (082) so the block that COPIES it cannot print
 * something else.
 */
function DescriptorJson({
  form,
  effectiveUpdateType,
}: {
  form: FormState;
  effectiveUpdateType: string;
}) {
  const entries = descriptorEntries(form, effectiveUpdateType);
  return (
    <>
      <pre className="sim-descriptor-json">
        {entries.length === 0 ? "{}" : "{\n"}
        {entries.map((entry, i) => (
          <JsonLine key={entry.key} entry={entry} comma={i < entries.length - 1} />
        ))}
        {entries.length === 0 ? "" : "}"}
      </pre>
      {entries.length === 0 ? (
        <p className="sim-descriptor-empty">
          Nothing identifying yet — fill in the sentence above, or start from an example.
        </p>
      ) : null}
    </>
  );
}

/**
 * Roadmap 079: the design's live "Descriptor Renovate will match against" card
 * — the standalone simulator's right column, and the answer to "what am I
 * actually asking about?" without running anything.
 */
export function DescriptorPreview({
  form,
  effectiveUpdateType,
}: {
  form: FormState;
  effectiveUpdateType: string;
}) {
  return (
    <aside className="sim-descriptor">
      <p className="sim-descriptor-label">Descriptor Renovate will match against</p>
      <DescriptorJson form={form} effectiveUpdateType={effectiveUpdateType} />
    </aside>
  );
}

/** The expanded block: the document, a copy button over it, and the note that
 *  says which end of the card is the editable one. */
function DescriptorSectionBody({
  form,
  effectiveUpdateType,
}: {
  form: FormState;
  effectiveUpdateType: string;
}) {
  return (
    <div className="sim-descriptor-body">
      <CopyButton
        iconOnly
        className="sim-descriptor-copy"
        label="Copy descriptor JSON"
        getText={() => descriptorJsonText(form, effectiveUpdateType)}
      />
      <DescriptorJson form={form} effectiveUpdateType={effectiveUpdateType} />
      <p className="sim-descriptor-note">assembled from the fields above — edit them, not this</p>
    </div>
  );
}

/**
 * Roadmap 082: the same descriptor in the COMPACT form (the Tests tab's pin
 * card), as a collapsed-by-default section under the field groups.
 *
 * 079 gave the compact form no preview at all — the panel is narrow and the
 * pin card it produces is the receipt — but the design's final pin card asks
 * for the document back, folded away and marked "result · read-only", because
 * it is what a reader pastes into an issue or hands to `rcd simulate`. Folded,
 * it costs one 0.78rem row; the aside above is still the standalone
 * simulator's, where there is a column to spend on it.
 */
export function DescriptorSection({
  form,
  effectiveUpdateType,
}: {
  form: FormState;
  effectiveUpdateType: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sim-descriptor-section">
      <button
        type="button"
        className="sim-group-head"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Caret open={open} />
        <span className="sim-descriptor-section-title">Descriptor JSON</span>
        <span className="pill pill-count sim-descriptor-readonly">result · read-only</span>
      </button>
      {open ? (
        <DescriptorSectionBody form={form} effectiveUpdateType={effectiveUpdateType} />
      ) : null}
    </div>
  );
}
