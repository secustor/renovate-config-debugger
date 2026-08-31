/**
 * The raw share-token wire format, written by hand: deflate-raw, then
 * base64url. It is deliberately independent of `encodeShare` — that is the
 * codec under test — but it was independent of ITSELF too, spelled once in
 * `src/lib/share.test.ts` and once in `e2e/fixtures.ts`, each with its own copy
 * of the `__proto__` argument below.
 *
 * Web globals only (CompressionStream, TextEncoder, btoa), so the same file
 * serves the vitest unit project and the Playwright fixtures.
 */

async function pipeThrough(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  // Type the stream as GenericTransformStream (writable: WritableStream) so the
  // writer accepts a plain Uint8Array — same pattern as src/lib/share.ts, which
  // works around TextEncoder outputs being typed as ArrayBufferLike.
  const writer = stream.writable.getWriter();
  void writer.write(new Uint8Array(bytes));
  void writer.close();
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Encodes a raw JSON STRING into a share token, bypassing the real codec.
 *
 * It takes TEXT, not an object, because that is the only way to express a
 * `__proto__` key: writing `{ __proto__: ... }` (or even `{ "__proto__": ... }`)
 * as object-literal syntax sets the object's prototype instead of creating an
 * own property, so it would vanish before `JSON.stringify` ever put it on the
 * wire. Hand-built JSON text guarantees the bytes really contain `"__proto__":`,
 * which the app's `JSON.parse` on decode turns into a genuine own property —
 * reproducing the real attack rather than a JS-syntax artifact of the test.
 */
export async function encodeRawShareToken(json: string): Promise<string> {
  const compressed = await pipeThrough(
    new TextEncoder().encode(json),
    new CompressionStream("deflate-raw"),
  );
  return bytesToBase64url(compressed);
}
