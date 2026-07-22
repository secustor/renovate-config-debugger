import CodeMirror from "@uiw/react-codemirror";
import { jsonSchema } from "codemirror-json-schema";
import { json5Schema } from "codemirror-json-schema/json5";
import { renovateSchema } from "@renovate-config-visualizer/engine/schema";
import { useMemo } from "react";

interface Props {
  fileName: string;
  value: string;
  onChange: (value: string) => void;
}

export function ConfigEditor({ fileName, value, onChange }: Props) {
  const extensions = useMemo(
    () => [fileName.endsWith(".json5") ? json5Schema(renovateSchema) : jsonSchema(renovateSchema)],
    [fileName],
  );

  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  return (
    <div className="card">
      <div className="card-title">{fileName}</div>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={dark ? "dark" : "light"}
        minHeight="14rem"
        maxHeight="28rem"
      />
    </div>
  );
}
