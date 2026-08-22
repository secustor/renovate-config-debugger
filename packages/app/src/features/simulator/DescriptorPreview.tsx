import { type FormState, toDescriptor } from "./form";

/** The keys the design's preview shows, in its order. */
const PREVIEW_KEYS = [
  "packageName",
  "datasource",
  "currentValue",
  "newValue",
  "updateType",
  "manager",
  "packageFile",
  "depType",
] as const;

function JsonLine({ name, value, comma }: { name: string; value: string; comma: boolean }) {
  return (
    <span className="sim-json-line">
      {"  "}
      <span className="sim-json-key">{JSON.stringify(name)}</span>
      {": "}
      <span className="sim-json-str">{JSON.stringify(value)}</span>
      {comma ? ",\n" : "\n"}
    </span>
  );
}

/**
 * Roadmap 079: the design's live "Descriptor Renovate will match against" card
 * — the standalone simulator's right column, and the answer to "what am I
 * actually asking about?" without running anything.
 *
 * It prints what `toDescriptor` would SEND, so the derived updateType appears
 * here as the value it will match on, not as the empty `form.updateType`
 * behind it. Unset keys are omitted rather than printed empty: an absent field
 * and a field set to `""` are different questions to Renovate's matchers, and
 * `""` is not a descriptor this form can produce.
 */
export function DescriptorPreview({
  form,
  effectiveUpdateType,
}: {
  form: FormState;
  effectiveUpdateType: string;
}) {
  const descriptor = toDescriptor(form, effectiveUpdateType);
  const entries: [string, string][] = [];
  for (const key of PREVIEW_KEYS) {
    const value = descriptor[key];
    if (typeof value === "string") {
      entries.push([key, value]);
    }
  }
  return (
    <aside className="sim-descriptor">
      <p className="sim-descriptor-label">Descriptor Renovate will match against</p>
      <pre className="sim-descriptor-json">
        {entries.length === 0 ? "{}" : "{\n"}
        {entries.map(([key, value], i) => (
          <JsonLine key={key} name={key} value={value} comma={i < entries.length - 1} />
        ))}
        {entries.length === 0 ? "" : "}"}
      </pre>
      {entries.length === 0 ? (
        <p className="sim-descriptor-empty">
          Nothing identifying yet — fill in the sentence above, or start from an example.
        </p>
      ) : null}
    </aside>
  );
}
