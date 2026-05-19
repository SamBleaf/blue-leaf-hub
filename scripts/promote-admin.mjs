/**
 * One-off recovery: promote an existing auth user to admin in user_profiles.
 * Usage: node scripts/promote-admin.mjs sam@blueleafbuilding.com.au
 */
import "dotenv/config";
import { getServiceSupabase } from "../server/lib/supabaseService.mjs";

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/promote-admin.mjs <email>");
  process.exit(1);
}

const sb = getServiceSupabase();
if (!sb) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

let authUser = null;
let page = 1;
while (!authUser) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("listUsers:", error.message);
    process.exit(1);
  }
  authUser = data.users.find((u) => (u.email || "").toLowerCase() === email) || null;
  if (data.users.length < 200) break;
  page += 1;
}

if (!authUser) {
  console.error(`No auth user found for ${email}. Create the account first (bootstrap or invite).`);
  process.exit(1);
}

const fullName =
  authUser.user_metadata?.full_name ||
  authUser.user_metadata?.name ||
  "Sam Morris";

const { data: profile, error: upsertErr } = await sb
  .from("user_profiles")
  .upsert(
    {
      id: authUser.id,
      email: authUser.email,
      full_name: fullName,
      role: "admin",
      is_active: true,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  )
  .select("id, email, role, is_active")
  .single();

if (upsertErr) {
  console.error("user_profiles upsert:", upsertErr.message);
  process.exit(1);
}

console.log("OK — promoted to admin:");
console.log(profile);
console.log("\nSign out and sign back in (or hard-refresh) so AuthContext reloads your role.");
