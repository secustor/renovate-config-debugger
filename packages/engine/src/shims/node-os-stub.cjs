/**
 * Minimal `node:os` stand-in for the dep prebundle (roadmap 087) — the
 * npm-extraction graph reads platform facts at module scope. The answers only
 * feed cache paths and log labels that never leave the page; the values match
 * the `process.platform`/`arch` defines in vite-plugin-renovate-shims.ts.
 */
module.exports = {
  EOL: "\n",
  // human-signals (execa's graph) destructures `constants.signals` at load.
  constants: { signals: {} },
  arch: () => "x64",
  cpus: () => [],
  homedir: () => "/",
  hostname: () => "browser",
  platform: () => "linux",
  release: () => "0.0.0",
  tmpdir: () => "/tmp",
  type: () => "Linux",
  userInfo: () => ({ username: "browser", homedir: "/" }),
};
