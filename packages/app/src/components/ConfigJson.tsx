import { Fragment, type ReactNode } from "react";
import { OptionKey } from "./option-docs";
import { useOptionDocs } from "@/hooks/option-docs-hooks";

/**
 * Pretty-prints a config value exactly like `JSON.stringify(v, null, 2)`, but
 * with every object key rendered as an interactive option (hover docs,
 * unknown-key flagging). Meant to be placed inside a `<pre>`.
 */
export function ConfigJson({ value }: { value: unknown }) {
  const { index } = useOptionDocs();
  const containers = index?.containers;

  function render(v: unknown, indent: number, configContext: boolean): ReactNode {
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
          {v.map((item, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- see above
            <Fragment key={i}>
              {pad}
              {render(item, indent + 1, configContext)}
              {i < v.length - 1 ? "," : ""}
              {"\n"}
            </Fragment>
          ))}
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
              {render(val, indent + 1, containers?.has(key) ?? false)}
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
