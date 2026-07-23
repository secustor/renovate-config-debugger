/**
 * Browser shim for renovate/dist/util/hash.js, which needs node:crypto's
 * synchronous createHash (WebCrypto is async-only). In the browsered subgraph
 * the digests are only used as cache keys (lib/util/jsonata keys compiled
 * expressions by toSha256), so a deterministic non-cryptographic hex string is
 * behaviorally equivalent.
 */

function fnv1a32Hex(data: string | Uint8Array, seed: number): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let h = seed >>> 0;
  for (const byte of bytes) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function hash(data: string | Uint8Array, algorithm = "sha512"): string {
  return `${algorithm}-${fnv1a32Hex(data, 0x811c9dc5)}${fnv1a32Hex(data, 0xdeadbeef)}`;
}

export function toSha256(input: string): string {
  return hash(input, "sha256");
}

export function hashStream(): Promise<never> {
  return Promise.reject(new Error("hashStream is not available in the browser"));
}
