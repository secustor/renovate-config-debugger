import type { ResolvedConfigOutput } from "@renovate-config-debugger/engine";

/**
 * Roadmap 082: the ONE serialization of the resolved-config document.
 *
 * The design puts a copy button in the tab's toolbar, visible in both the By
 * key and the As JSON views, and it must hand over exactly what the As-JSON
 * view's own copy hands over. Two call sites spelling `JSON.stringify(output
 * .config, null, 2)` would agree today and diverge the first time either one
 * grew an option — so the expression lives here and both read it.
 *
 * The trailing newline is deliberate: what this copies is a FILE's contents
 * (it is pasted into a `renovate.json`), and a file ends with one.
 */
export function resolvedConfigText(output: ResolvedConfigOutput): string {
  return `${JSON.stringify(output.config, null, 2)}\n`;
}
