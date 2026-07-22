/**
 * Browser shim for renovate/dist/instrumentation/index.js.
 * The real module wires up OpenTelemetry (Node-only, huge); config code only
 * uses instrument() as a wrapper, so it degrades to a plain call.
 */
export function init(): void {}

export function shutdown(): Promise<void> {
  return Promise.resolve();
}

export function getTracerProvider(): never {
  throw new Error("tracing is not available in the browser");
}

export function instrument<T>(
  _name: string,
  fn: () => T,
  _options?: unknown,
  _context?: unknown,
): T {
  return fn();
}
