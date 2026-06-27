/**
 * Optional teardown — only removes data marked with __E2E_ when E2E_CLEANUP=true.
 */
import { config as dotenvConfig } from "dotenv";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { cleanupE2ESuite } from "../scripts/seed-e2e-suite.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenvConfig({ path: join(ROOT, ".env") });

export default async function globalTeardown() {
  if (process.env.E2E_CLEANUP !== "true") {
    console.log("[e2e] Skipping teardown (set E2E_CLEANUP=true to remove __E2E_ seed data)");
    return;
  }
  const runtimePath = join(ROOT, "e2e", ".runtime.json");
  let seed = null;
  if (existsSync(runtimePath)) {
    try {
      seed = JSON.parse(readFileSync(runtimePath, "utf8")).seed;
    } catch {
      /* ignore */
    }
  }
  await cleanupE2ESuite(seed);
  try {
    unlinkSync(runtimePath);
  } catch {
    /* ignore */
  }
  console.log("[e2e] Teardown complete");
}
