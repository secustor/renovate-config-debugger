import { emitJson, emitLines } from "../output";
import { digestPayload } from "../projections/digest";
import { INPUT_OPTIONS } from "../run-input";
import { defineRunCommand } from "../run-command";

/**
 * The Overview tab's paragraph, in a terminal — the cheapest orientation
 * before deciding what to drill into. Not a diff oracle: it narrates run-level
 * aggregates, so two runs differing only inside a `packageRules` entry read
 * the same — use `compare` for that.
 */
export const digestCommand = defineRunCommand({
  name: "digest",
  summary: "the run in one paragraph — start here",
  usage: ["digest [file]"],
  options: [...INPUT_OPTIONS, "format"],
  answer({ io, format, result }) {
    const payload = digestPayload(result);
    if (format === "json") {
      emitJson(io, payload);
    } else {
      emitLines(io, [payload.digest]);
    }
  },
});
