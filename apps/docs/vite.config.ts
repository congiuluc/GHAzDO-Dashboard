import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base so the site works under any GitHub Pages path (https://<owner>.github.io/<repo>/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
});
