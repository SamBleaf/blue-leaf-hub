/**
 * Creates (or resets) a temporary director-level test user for AI workflow testing.
 * Credentials are written to .test-credentials.local (gitignored).
 *
 * Usage:
 *   node scripts/create-test-user.mjs
 *
 * To delete the test user afterward:
 *   node scripts/create-test-user.mjs --delete
 */

import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenvConfig();

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const CREDS_FILE = join(ROOT, ".test-credentials.local");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const TEST_EMAIL    = "ai-test-director@blueleafbuilding.test";
const TEST_PASSWORD = "BlueLeaf-Test-2026!";
const TEST_NAME     = "AI Test Director";

async function deleteTestUser() {
  // Look up by email in auth.users via admin API
  const { data: { users }, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) { console.error("List users failed:", error.message); process.exit(1); }

  const user = users.find(u => u.email === TEST_EMAIL);
  if (!user) { console.log("Test user not found — nothing to delete."); return; }

  await sb.from("user_profiles").delete().eq("id", user.id);
  const { error: delErr } = await sb.auth.admin.deleteUser(user.id);
  if (delErr) { console.error("Delete failed:", delErr.message); process.exit(1); }

  console.log(`Deleted test user: ${TEST_EMAIL} (${user.id})`);
  if (existsSync(CREDS_FILE)) {
    writeFileSync(CREDS_FILE, JSON.stringify({ deleted: true, deleted_at: new Date().toISOString() }, null, 2));
    console.log("Credentials file cleared.");
  }
}

async function createTestUser() {
  // Check if already exists
  const { data: { users } } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let existing = users?.find(u => u.email === TEST_EMAIL);

  let userId;

  if (existing) {
    console.log(`Test user already exists (${existing.id}) — resetting password…`);
    const { error } = await sb.auth.admin.updateUserById(existing.id, { password: TEST_PASSWORD });
    if (error) { console.error("Password reset failed:", error.message); process.exit(1); }
    userId = existing.id;
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: TEST_NAME }
    });
    if (error) { console.error("Create user failed:", error.message); process.exit(1); }
    userId = data.user.id;
    console.log(`Created test user: ${TEST_EMAIL} (${userId})`);
  }

  // Upsert user_profiles with admin role (full access to all modules)
  const { error: profileErr } = await sb.from("user_profiles").upsert({
    id: userId,
    email: TEST_EMAIL,
    full_name: TEST_NAME,
    role: "admin",
    is_active: true,
    updated_at: new Date().toISOString()
  }, { onConflict: "id" });

  if (profileErr) { console.error("Profile upsert failed:", profileErr.message); process.exit(1); }

  const appUrl = process.env.VITE_APP_URL || "http://localhost:5173";

  const creds = {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    role: "admin",
    note: "Director-level test account. Full access to all modules. DO NOT COMMIT THIS FILE.",
    app_url: appUrl,
    supabase_url: SUPABASE_URL,
    user_id: userId,
    created_at: new Date().toISOString(),
    context_doc: ".agent-test-context.local.md"
  };

  writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
  console.log("\n✓ Test user ready");
  console.log(`  Email:    ${TEST_EMAIL}`);
  console.log(`  Password: ${TEST_PASSWORD}`);
  console.log(`  Role:     admin (full access)`);
  console.log(`  App:      ${appUrl}`);
  console.log(`  Creds:    .test-credentials.local (gitignored)\n`);
  console.log("Run the app:  npm run dev");
  console.log("Delete user:  node scripts/create-test-user.mjs --delete\n");
}

if (process.argv.includes("--delete")) {
  await deleteTestUser();
} else {
  await createTestUser();
}
