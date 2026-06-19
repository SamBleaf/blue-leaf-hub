import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = String(env.PORT_API || "8787").trim() || "8787";
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        // Two distinct installable identities are served from one SPA:
        //   index.html  → /manifest.webmanifest  (Hub,    start_url "/")
        //   worker.html → /manifest.json          (Worker, start_url "/worker")
        // Both manifests are STATIC files in public/, each linked by exactly one entry HTML.
        // VitePWA must NOT generate/inject its own <link rel="manifest"> — doing so re-creates
        // the dual-manifest collision this split exists to fix. The service worker is unaffected:
        // it registers via `virtual:pwa-register` in src/main.jsx, independent of manifest generation.
        includeAssets: ["icons/*.svg", "icons/*.png", "manifest.webmanifest", "manifest.json", "brand/icon-blue.png"],
        manifest: false,
        workbox: {
          mode: "production",
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          // The SW's SPA fallback serves index.html (the Hub identity) for in-app navigations.
          // /api is excluded so API calls hit the server. /worker* is ALSO excluded so the
          // worker routes resolve to worker.html (the Worker manifest + apple icons) via the
          // Vercel rewrite — otherwise an active SW would serve the Hub index.html for /worker
          // and an install there would pick up the wrong icon/identity.
          navigateFallbackDenylist: [/^\/api/, /^\/worker/],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 // 4 MiB — main bundle grows with deps
        },
        devOptions: {
          /* PWA + workbox in dev can scan the tree for a long time with little console output — keep off for fast `npm run dev`. */
          enabled: false
        }
      })
    ],
    build: {
      rollupOptions: {
        // Two entry HTML documents so each can carry its own manifest (Hub vs Worker).
        // Both bootstrap the same /src/main.jsx SPA — React Router renders by path.
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          worker: fileURLToPath(new URL("./worker.html", import.meta.url))
        }
      }
    },
    server: {
      // Pinned to 5174 so the Hub never collides with the blue-leaf-website (Laravel) Vite on 5173.
      // strictPort: true → fail loudly if 5174 is taken rather than silently moving to a surprise port.
      port: 5174,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true
        }
      }
    },
    preview: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true
        }
      }
    }
  };
});
