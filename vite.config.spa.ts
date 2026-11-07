import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  base: "/sales-report/",
  resolve: {
    alias: {
      "@tanstack/react-start": path.resolve(__dirname, "src/lib/start-stub.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    react(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
