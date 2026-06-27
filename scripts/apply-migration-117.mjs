#!/usr/bin/env node
/**
 * Apply migration 117 to dev Supabase (DDL).
 * Requires SUPABASE_DB_PASSWORD in env (project database password from Supabase dashboard).
 *
 *   SUPABASE_DB_PASSWORD=... node scripts/apply-migration-117.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
const projectRef = match?.[1];
const password = process.env.SUPABASE_DB_PASSWORD?.trim();

if (!projectRef) {
  console.error("Missing SUPABASE_URL");
  process.exit(2);
}
if (!password) {
  console.error("Set SUPABASE_DB_PASSWORD (Supabase dashboard → Project Settings → Database)");
  process.exit(2);
}

const sqlPath = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations", "117_workforce_allocations.sql");
const sql = readFileSync(sqlPath, "utf8");

const { default: postgres } = await import("postgres");
const connStr = `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres`;
const sqlClient = postgres(connStr, { ssl: "require", max: 1 });

try {
  await sqlClient.unsafe(sql);
  console.log("Migration 117 applied.");
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exit(1);
} finally {
  await sqlClient.end({ timeout: 5 });
}
