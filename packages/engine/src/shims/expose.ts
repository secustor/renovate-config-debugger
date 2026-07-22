/**
 * Browser shim for renovate/dist/expose.js — the choke point for Renovate's
 * createRequire() escapes (re2, bunyan, prettier, package.json).
 * re2() throwing makes lib/util/regex fall back to native RegExp.
 */
import pkg from "renovate/package.json";

export function re2(): never {
  throw new Error("re2 is not available in the browser");
}

export function prettier(): never {
  throw new Error("prettier is not available in the browser");
}

export function bunyan(): never {
  throw new Error("bunyan is not available in the browser");
}

export function openpgp(): Promise<never> {
  return Promise.reject(new Error("openpgp is not available in the browser"));
}

export { pkg };
