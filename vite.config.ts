// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

export default defineConfig({
  // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
  tanstackStart: {
    server: { entry: "server" },
  },
  // Nitro adapter so Vercel knows how to run the SSR app.
  vite: {
    plugins: [nitro({ preset: "vercel" })],
  },
});
