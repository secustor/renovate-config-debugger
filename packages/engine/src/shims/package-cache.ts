/**
 * Browser shim for renovate/dist/util/cache/package/index.js.
 * Only reached when `presetCachePersistence` is enabled (never in the
 * visualizer); the real module drags in sqlite/fs. Behaves as an empty cache.
 */
export function init(): Promise<void> {
  return Promise.resolve();
}

export function cleanup(): Promise<void> {
  return Promise.resolve();
}

export function get(): Promise<undefined> {
  return Promise.resolve(undefined);
}

export function set(): Promise<void> {
  return Promise.resolve();
}

export function setWithRawTtl(): Promise<void> {
  return Promise.resolve();
}

export function getCacheType(): undefined {
  return undefined;
}
