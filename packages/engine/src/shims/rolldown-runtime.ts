/**
 * Browser shim for renovate/dist/_virtual/_rolldown/runtime.js — the module
 * helper runtime of Renovate's own rolldown build. The real module evaluates
 * `createRequire(import.meta.url)` at load time, which throws in the browser
 * (Vite externalizes node:module). Production builds tree-shake that binding
 * away, but the dev server evaluates every module, so it needs a shim.
 * __commonJSMin and __exportAll reproduce upstream's behavior exactly;
 * __require throws lazily, only if some module actually calls it.
 *
 * Roadmap 041: `__commonJSMin` was a verbatim copy of upstream's comma-operator
 * one-liner, whose two `!`s the promoted `no-non-null-assertion` rule rejects.
 * Spelled out as statements instead — same semantics (memoize on first call,
 * drop the factory afterwards, always read `mod.exports` so a factory that
 * REASSIGNS `module.exports` still wins), no assertions needed.
 */

/* oxlint-disable no-explicit-any, no-underscore-dangle -- names must match renovate's runtime exports */
type CommonJsFactory = (exports: any, module: { exports: any }) => void;

export const __commonJSMin = (cb: CommonJsFactory | null, mod?: { exports: any }) => (): any => {
  if (!mod) {
    const created: { exports: any } = { exports: {} };
    mod = created;
    cb?.(created.exports, created);
    cb = null;
  }
  return mod.exports;
};

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
