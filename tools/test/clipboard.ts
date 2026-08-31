/**
 * `navigator.clipboard` for a jsdom test: replaced with a recorder, so a suite
 * asserts WHAT was copied rather than that a write happened.
 *
 * `configurable: true` is what lets the next test redefine it — jsdom's own
 * `navigator.clipboard` is not writable, and a non-configurable stub would
 * leave the first suite's recorder in place for the rest of the file.
 *
 * Under `tools/test` rather than the app's `src/`, like the other harnesses
 * here: test scaffolding never rides into the production build.
 */
export function recordClipboardWrites(): string[] {
  const writes: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        writes.push(text);
      },
    },
  });
  return writes;
}
