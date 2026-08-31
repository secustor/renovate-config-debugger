/**
 * Hand-built `PresetNode` trees for the suites that assert on the resolution
 * tree's SHAPE (roadmap 075/082) — which child is a family, which preset had
 * the last word, what a failed fetch renders as. Synthetic on purpose: a real
 * run would assert Renovate's contents rather than the module's arithmetic.
 *
 * Under `tools/test` like the discovery fixtures: test scaffolding can never
 * ride into the production build.
 */
import type { PresetNode } from "@renovate-config-debugger/engine";

let nextId = 0;

/** One resolved preset, `state`/`kind`/`error` overridable. */
export function presetNode(
  name: string,
  opts: {
    input?: Record<string, unknown>;
    children?: PresetNode[];
    kind?: string;
    state?: PresetNode["state"];
    error?: string;
  } = {},
): PresetNode {
  nextId++;
  return {
    id: `p${nextId}`,
    name,
    state: opts.state ?? "resolved",
    source: { presetSource: opts.kind ?? "internal" } as PresetNode["source"],
    input: opts.input ?? {},
    children: opts.children ?? [],
    ...(opts.error ? { error: { topic: "preset", message: opts.error } } : {}),
  };
}

/** The input config the tree hangs from. */
export function presetRoot(children: PresetNode[]): PresetNode {
  return { id: "root", name: "(input config)", state: "resolved", input: {}, children };
}

/**
 * A node with an id the test chose, and nothing else — for the suites that
 * address a tree BY id (the preset reference's ancestry walk, and the token
 * that renders its facts) and would be describing the builder's defaults if the
 * node carried a source or an input it never reads.
 */
export function presetNodeById(id: string, name: string, children: PresetNode[] = []): PresetNode {
  return { id, name, state: "resolved", children };
}
