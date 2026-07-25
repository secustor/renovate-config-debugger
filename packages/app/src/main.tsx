import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { runStorageMigrations } from "./storage";
import "./index.css";

// Roadmap 033: one-time storage migrations run before the App's `useState`
// initializers read storage — and, unlike their old module-scope home, they
// can never throw, so a storage-disabled browser still reaches `createRoot()`
// (a degraded app, not a blank page).
runStorageMigrations();

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root element");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
