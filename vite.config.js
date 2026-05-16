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
        includeAssets: ["icons/*.svg", "manifest.webmanifest"],
        manifest: {
          name: "Blue Leaf Hub",
          short_name: "Blue Leaf",
          description: "Operating system for Blue Leaf Building — RFQs, tenders, cost intelligence.",
          theme_color: "#1B3A5C",
          background_color: "#F8F9FA",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "/icons/icon-192.svg",
              sizes: "192x192",
              type: "image/svg+xml",
              purpose: "any maskable"
            },
            {
              src: "/icons/icon-512.svg",
              sizes: "512x512",
              type: "image/svg+xml",
              purpose: "any maskable"
            }
          ]
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallbackDenylist: [/^\/api/]
        },
        devOptions: {
          /* PWA + workbox in dev can scan the tree for a long time with little console output — keep off for fast `npm run dev`. */
          enabled: false
        }
      })
    ],
    server: {
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
