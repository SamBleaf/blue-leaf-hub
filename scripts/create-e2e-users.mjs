/**
 * Creates (or resets) all role-based E2E test users.
 * Exported for Playwright global-setup and standalone use:
 *   node scripts/create-e2e-users.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenvConfig({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PASSWORD = "BlueLeaf-E2E-2026!";
const USERS = [
  { key: "admin", email: "e2e-admin@blueleafbuilding.test", fullName: "E2E Director", role: "admin" },
  { key: "supervisor", email: "e2e-supervisor@blueleafbuilding.test", fullName: "E2E Site Supervisor", role: "supervisor" },
  { key: "employee", email: "e2e-employee@blueleafbuilding.test", fullName: "E2E Field Staff", role: "employee" },
  { key: "client", email: "e2e-client@blueleafbuilding.test", fullName: "E2E Client (Sutton)", role: "client" },
  { key: "clientB", email: "e2e-client-b@blueleafbuilding.test", fullName: "E2E Client B (isolation)", role: "client" },
];

function sb() {
  if (!SB_URL || !SVC) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SB_URL, SVC, { auth: { persistSession: false } });
}

async function findAuthUserByEmail(supabase, email) {
  for (let page = 1; page <= 25; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    const hit = (data?.users || []).find((u) => u.email === email);
    if (hit) return hit;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return null;
}

async function upsertUser(supabase, { email, fullName, role }, { resetPassword = false } = {}) {
  let existing = await findAuthUserByEmail(supabase, email);
  let userId;
  if (existing) {
    // BLH-E2E-CLAUDE-001: rotating password on every ensureE2EUsers() call invalidates
    // in-flight JWTs across sequential regression child suites and browser sessions.
    if (resetPassword) {
      await supabase.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true });
    }
    userId = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    userId = data.user.id;
  }
  const { error: pErr } = await supabase.from("user_profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (pErr) throw new Error(`profile ${email}: ${pErr.message}`);
  return { id: userId, email, password: PASSWORD, role, fullName };
}

/**
 * Ensure E2E role users exist with stable profiles.
 * @param {{ resetPassword?: boolean }} opts — pass resetPassword:true only for explicit CLI reset
 */
export async function ensureE2EUsers(opts = {}) {
  const resetPassword =
    opts.resetPassword === true ||
    process.argv.includes("--reset-password") ||
    process.env.E2E_RESET_USER_PASSWORDS === "1";
  const supabase = sb();
  const out = {};
  for (const u of USERS) {
    out[u.key] = await upsertUser(supabase, u, { resetPassword });
  }
  return out;
}

if (process.argv[1]?.includes("create-e2e-users")) {
  const resetPassword = process.argv.includes("--reset-password");
  const users = await ensureE2EUsers({ resetPassword });
  console.log(`E2E users ready${resetPassword ? " (passwords reset)" : ""}:`);
  for (const [k, v] of Object.entries(users)) {
    console.log(`  ${k}: ${v.email} / ${PASSWORD}`);
  }
}
