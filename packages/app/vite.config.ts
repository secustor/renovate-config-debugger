import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { renovateShims } from "@renovate-config-visualizer/engine/vite-plugin";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/renovate-config-visualizer/" : "/",
  plugins: [react(), renovateShims()],
});
