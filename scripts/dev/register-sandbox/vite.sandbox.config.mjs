// Blue Leaf Hub — LOCAL REGISTER SANDBOX — Vite wrapper config (DEV / TEST ONLY).
// Runs the real SPA (repo vite.config.js) but:
//   • envDir = ~/.blh-register-sandbox/hub-cwd → import.meta.env comes ONLY from the sandbox
//     .env (= hub.env); the repo's production .env is never read for VITE_* values.
//   • vite is started with cwd = hub-cwd, so the base config's loadEnv(process.cwd()) also reads
//     the sandbox .env (PORT_API=8797 → /api proxied to the sandbox Hub API).
//   • port 5184 (strict) + a private dep cache, so it never collides with a normal `npm run dev`.
// Launch: node scripts/dev/register-sandbox/sandbox.mjs vite
import { defineConfig } from "vite";
import { join } from "node:path";
import base from "../../../vite.config.js";
import { HUB_CWD, REPO, SB_DIR } from "./lib.mjs";

export const SANDBOX_VITE_PORT = 5184;

export default defineConfig(async (env) => {
  const cfg = typeof base === "function" ? await base(env) : base;
  return {
    ...cfg,
    root: REPO,
    envDir: HUB_CWD,
    cacheDir: join(SB_DIR, "vite-cache"),
    server: { ...(cfg.server || {}), port: SANDBOX_VITE_PORT, strictPort: true, host: "localhost" }
  };
});
