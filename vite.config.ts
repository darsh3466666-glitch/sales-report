// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    preset: "node-server",
    rollupConfig: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node-domexception")) {
            return "dom-shim";
          }
        },
      },
      onwarn(warning: any, warn: any) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
          return;
        }
        warn(warning);
      },
    },
  } as any,
  vite: {
    logLevel: "warn",
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "@tanstack/react-router",
        "@tanstack/react-query",
        "lucide-react",
        "recharts",
        "xlsx",
        "idb-keyval",
        "firebase/app",
        "firebase/firestore",
        "sonner",
        "zod",
        "clsx",
        "tailwind-merge",
      ],
    },
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
            return;
          }
          warn(warning);
        },
      },
    },
  },
});
