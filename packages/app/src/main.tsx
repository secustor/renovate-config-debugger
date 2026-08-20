import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { initAnalytics } from "@/platform/analytics";
import { applyTheme, readTheme, runStorageMigrations } from "@/platform/storage";
import "./index.css";

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
// (rcv-config.js or the Pages build var) — dev and self-hosts stay silent.
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
