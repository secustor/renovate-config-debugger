import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { initAnalytics } from "@/platform/analytics";
import { applyTheme, readTheme, runStorageMigrations } from "@/platform/storage";
// The stylesheet, in cascade order (roadmap 050's deferred split, executed):
// index.css holds the token block and element base; the numbered files are
// the former single file cut at its section boundaries. The ORDER of these
// imports is load-bearing — it reproduces the original cascade byte-for-byte,
// which two cross-file equal-specificity couplings (.preset-panel base in
// 04 vs its @container override in 03, and .diff-wrapper's split base/dark
// blocks) depend on. Add new styles to the file that owns the surface; add
// new files only at the end, or knowingly re-verify the cascade.
import "./index.css";
import "./styles/01-shell.css";
import "./styles/02-controls.css";
import "./styles/03-presets.css";
import "./styles/04-config-context.css";
import "./styles/05-docs-trace.css";
import "./styles/06-share-auth.css";
import "./styles/07-simulator.css";
import "./styles/08-landing.css";
import "./styles/09-credentials.css";
import "./styles/10-messages-tabs.css";
import "./styles/11-sim-disclosure.css";
import "./styles/12-overview.css";
import "./styles/13-effective.css";
import "./styles/14-overview-ledgers.css";
import "./styles/15-pins.css";
import "./styles/16-tabs.css";
import "./styles/17-build-info.css";
import "./styles/18-data-table.css";

// Roadmap 033: one-time storage migrations run before the App's `useState`
// initializers read storage — and, unlike their old module-scope home, they
// can never throw, so a storage-disabled browser still reaches `createRoot()`
// (a degraded app, not a blank page).
runStorageMigrations();

// Roadmap 037: the stored theme override is applied at module scope, BEFORE
// `createRoot()`. From a React effect the first paint would use the OS scheme
// and then flip — the theme flash the switcher exists to avoid.
applyTheme(readTheme());

// Google Analytics loads only when a deployment configured a measurement id
// (rcd-config.js or the Pages build var) — dev and self-hosts stay silent.
initAnalytics();

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root element");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
