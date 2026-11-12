import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    // azure-devops-ui is hoisted to the root node_modules, where the docs workspace's React 19
    // lives. Pin every React import to this workspace's React 18 so the bundle has one copy.
    alias: [
      { find: /^react$/, replacement: resolve(dir, "node_modules/react/index.js") },
      { find: /^react\/(.*)$/, replacement: resolve(dir, "node_modules/react/$1") },
      { find: /^react-dom$/, replacement: resolve(dir, "node_modules/react-dom/index.js") },
      { find: /^react-dom\/(.*)$/, replacement: resolve(dir, "node_modules/react-dom/$1") },
    ],
  },
  // azure-devops-ui ships legacy IE media queries (-ms-high-contrast) that LightningCSS rejects; drop them.
  css: { lightningcss: { errorRecovery: true } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        hub: resolve(dir, "hub.html"),
        "project-hub": resolve(dir, "project-hub.html"),
        widget: resolve(dir, "widget.html"),
        "widget-config": resolve(dir, "widget-config.html"),
      },
    },
  },
  server: { port: 5173 },
});
