/**
 * Playwright global setup — safety checks, test users, seed data.
 * Writes e2e/.runtime.json (gitignored) for tests to read credentials.
 */
import { config as dotenvConfig } from "dotenv";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { assertSafeE2EEnvironment } from "./helpers/safety.mjs";
import { ensureE2EUsers } from "../scripts/create-e2e-users.mjs";
import { seedE2ESuite } from "../scripts/seed-e2e-suite.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenvConfig({ path: join(ROOT, ".env"), override: true });

export default async function globalSetup() {
  assertSafeE2EEnvironment();

  const reportDir = join(ROOT, "e2e", "report");
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });

  console.log("\n[e2e] Ensuring test users…");
  const users = await ensureE2EUsers();

  console.log("[e2e] Seeding workflow data…");
  let seed;
  try {
    seed = await seedE2ESuite({ users });
  } catch (err) {
    console.warn(`[e2e] Seed failed (non-fatal — some specs create own data): ${err.message}`);
    seed = {
      mark: "__E2E_",
      jobId: null,
      projectA: null,
      projectB: null,
      leadId: null,
      seedError: err.message,
    };
  }

  const runtime = {
    baseUrl: process.env.E2E_BASE_URL || "http://localhost:5174",
    apiUrl: `http://127.0.0.1:${process.env.PORT_API || "8787"}`,
    users,
    seed,
    createdAt: new Date().toISOString(),
  };

  const runtimePath = join(ROOT, "e2e", ".runtime.json");
  writeFileSync(runtimePath, JSON.stringify(runtime, null, 2));
  console.log(`[e2e] Runtime written to ${runtimePath}\n`);
}
