import schema from "renovate/renovate-schema.json";

/**
 * Property keys containing "%" (e.g. constraints.%goMod) break JSON-pointer
 * handling in schema tooling (decodeURIComponent throws on invalid escapes),
 * so they are dropped from the editor schema. Everything else is verbatim.
 */
function stripPercentKeys(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripPercentKeys);
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (!key.includes("%")) {
        out[key] = stripPercentKeys(value);
      }
    }
    return out;
  }
  return node;
}

/** Renovate's own JSON schema, in lockstep with the pinned renovate version. */
export const renovateSchema: Record<string, unknown> = stripPercentKeys(schema) as Record<
  string,
  unknown
>;
