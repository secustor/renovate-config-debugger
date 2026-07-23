import { Fragment, type ReactNode } from "react";
import { OptionKey, useOptionDocs } from "../option-docs";

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
      return (
        <>
          {"[\n"}
          {v.map((item, i) => (
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
