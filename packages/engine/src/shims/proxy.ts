/**
 * Shim for `renovate/dist/proxy.js` (roadmap 087).
 *
 * The real module wires `global-agent` (Node http/https agents) into
 * `process.env`-driven proxy bootstrap — meaningless in a browser, where the
 * fetch stack is the user agent's. It is reached at module scope from
 * `util/http/host-rules.js`, which sits in every manager-extraction graph via
 * the datasource classes. `bootstrap` is never called here (that is
 * renovate.js's entry path); `hasProxy` answers what is true in a browser.
 */
export function bootstrap(): void {
  // No proxy agent to install in a browser.
}

export function hasProxy(): boolean {
  return false;
}
