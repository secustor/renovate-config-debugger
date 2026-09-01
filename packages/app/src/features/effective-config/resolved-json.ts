import type { ResolvedConfigOutput } from "@renovate-config-debugger/engine";
import { jsonFile } from "@renovate-config-debugger/engine/json";

/**
 * Roadmap 082: the ONE serialization of the resolved-config document.
 *
 * The design puts a copy button in the tab's toolbar, visible in both the By
 * key and the As JSON views, and it must hand over exactly what the As-JSON
 * view's own copy hands over. Two call sites spelling the serialization would
 * agree today and diverge the first time either one grew an option — so the
 * expression lives here and both read it.
 *
 * `jsonFile` (not `jsonDocument`) because what this copies is a FILE's contents
 * — it is pasted into a `renovate.json`, and a file ends with a newline.
 */
export function resolvedConfigText(output: ResolvedConfigOutput): string {
  return jsonFile(output.config);
}
