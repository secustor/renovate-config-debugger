/**
 * Browser shim for renovate/dist/_virtual/_rolldown/runtime.js — the module
 * helper runtime of Renovate's own rolldown build. The real module evaluates
 * `createRequire(import.meta.url)` at load time, which throws in the browser
 * (Vite externalizes node:module). Production builds tree-shake that binding
 * away, but the dev server evaluates every module, so it needs a shim.
 * __commonJSMin and __exportAll are copied verbatim; __require throws lazily,
 * only if some module actually calls it.
 */

/* oxlint-disable no-explicit-any, no-underscore-dangle -- names must match renovate's runtime exports */
type CommonJsFactory = (exports: any, module: { exports: any }) => void;

export const __commonJSMin = (cb: CommonJsFactory | null, mod?: { exports: any }) => (): any => (
  mod || (cb!(((mod = { exports: {} }) as { exports: any }).exports, mod), (cb = null)),
  mod!.exports
);

export function __exportAll(all: Record<string, () => any>, noSymbols?: boolean): any {
  const target: Record<string | symbol, unknown> = {};
  for (const name in all) {
    Object.defineProperty(target, name, { get: all[name], enumerable: true });
  }
  if (!noSymbols) {
    Object.defineProperty(target, Symbol.toStringTag, { value: "Module" });
  }
  return target;
}

export function __require(id: string): never {
  throw new Error(`require("${id}") is not available in the browser`);
}
