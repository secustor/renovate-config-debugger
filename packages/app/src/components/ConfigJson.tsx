import { Fragment, type ReactNode, useMemo } from "react";
import { type DescriptionCard, descriptionCardsFor } from "@/lib/description-attribution";
import { DescriptionValue } from "./DescriptionAttribution";
import { OptionKey } from "./option-docs";
import { useOptionDocs } from "@/hooks/option-docs-hooks";

/**
 * Pretty-prints a config value exactly like `JSON.stringify(v, null, 2)`, but
 * with every object key rendered as an interactive option (hover docs,
 * unknown-key flagging). Meant to be placed inside a `<pre>`.
 *
 * Roadmap 069 (PR 5): the VALUES of one array can be interactive too — the
 * top-level `description` of a resolved-config document, where each string
 * gains the hover card naming the preset that wrote it. Only there, and only
 * when the array positionally matches the attribution (`descriptionCardsFor`):
 * a preset body's own `description` is a different array, and the As-JSON
 * view's keep-internal/hydrated documents are different arrays too.
 */
export function ConfigJson({
  value,
  descriptions,
  onSelectPreset,
}: {
  value: unknown;
  /** Roadmap 069: per-string attribution for the TOP-LEVEL `description` array
   *  of `value`, in that array's order. Ignored unless it matches (see above);
   *  omit it and this renders exactly as it always did. */
  descriptions?: readonly DescriptionCard[] | null;
  /** The attribution card's "Show in preset tree →". Without it the card still
   *  renders — it simply names the preset instead of offering the jump. */
  onSelectPreset?: (nodeId: string) => void;
}) {
  const { index } = useOptionDocs();
  const containers = index?.containers;
  const cards = useMemo(() => descriptionCardsFor(value, descriptions), [value, descriptions]);

  function render(
    v: unknown,
    indent: number,
    configContext: boolean,
    /** Attribution for THIS array's elements — set only for the top-level
     *  `description`, so nothing else can pick it up by accident. */
    attributed?: readonly DescriptionCard[] | null,
  ): ReactNode {
    if (Array.isArray(v)) {
      if (v.length === 0) {
        return "[]";
      }
      const pad = "  ".repeat(indent + 1);
      // Roadmap 041 — index keys, deliberately: this IS the array being
      // pretty-printed, so element i is line i of the rendered JSON. Array
      // elements have no identity beyond their position (duplicates are legal
      // JSON), and a re-render re-prints the whole value anyway.
      return (
        <>
          {"[\n"}
          {v.map((item, i) => {
            const card = attributed?.[i];
            return (
              // oxlint-disable-next-line react/no-array-index-key -- see above
              <Fragment key={i}>
                {pad}
                {card ? (
                  <DescriptionValue card={card} onSelectPreset={onSelectPreset} />
                ) : (
                  render(item, indent + 1, configContext)
                )}
                {i < v.length - 1 ? "," : ""}
                {"\n"}
              </Fragment>
            );
          })}
          {"  ".repeat(indent)}]
        </>
      );
    }
    if (v !== null && typeof v === "object") {
      const entries = Object.entries(v);
      if (entries.length === 0) {
        return "{}";
      }
      const pad = "  ".repeat(indent + 1);
      return (
        <>
          {"{\n"}
          {entries.map(([key, val], i) => (
            <Fragment key={key}>
              {pad}
              {'"'}
              <OptionKey name={key} flagUnknown={configContext} />
              {'": '}
              {render(
                val,
                indent + 1,
                containers?.has(key) ?? false,
                indent === 0 && key === "description" ? cards : null,
              )}
              {i < entries.length - 1 ? "," : ""}
              {"\n"}
            </Fragment>
          ))}
          {"  ".repeat(indent)}
          {"}"}
        </>
      );
    }
    return JSON.stringify(v) ?? "undefined";
  }

  return <>{render(value, 0, true)}</>;
}
