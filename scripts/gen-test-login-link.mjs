#!/usr/bin/env node
/**
 * scripts/gen-test-login-link.mjs — mint a one-time magic sign-in link for a TEST account.
 * Useful while there's no self-service password reset. Service-role only; test accounts only.
 *   node scripts/gen-test-login-link.mjs [email]   (default: e2e-admin@blueleafbuilding.test)
 */
import dotenv from "dotenv"; dotenv.config();
import { getServiceSupabase } from "../server/lib/supabaseService.mjs";

const APP = (process.env.APP_URL || "https://blueleafhub.com.au").replace(/\/+$/, "");
const wanted = (process.argv[2] || "e2e-admin@blueleafbuilding.test").toLowerCase();
const sb = getServiceSupabase();
if (!sb) { console.error("✗ no service client"); process.exit(1); }

const { data: list, error: le } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
if (le) { console.error("listUsers:", le.message); process.exit(1); }
const users = list?.users || [];
const testUsers = users.filter((u) => /\.test$/i.test(u.email || "") || /e2e/i.test(u.email || ""));
console.log("Test accounts found:", testUsers.map((u) => u.email).join(", ") || "(none)");

const target = users.find((u) => (u.email || "").toLowerCase() === wanted)
  || testUsers.find((u) => /admin/i.test(u.email || ""));
if (!target) { console.error(`✗ no account matching '${wanted}' (and no test admin fallback)`); process.exit(1); }

const { data: prof } = await sb.from("user_profiles").select("role, full_name, is_active").eq("id", target.id).maybeSingle();
console.log(`\nTarget: ${target.email}  role=${prof?.role || "?"}  active=${prof?.is_active ?? "?"}  confirmed=${!!target.email_confirmed_at}`);
if (prof?.role !== "admin") console.log("  ⚠ not an admin — may not see all jobs.");

const { data: link, error: ge } = await sb.auth.admin.generateLink({ type: "magiclink", email: target.email, options: { redirectTo: APP } });
if (ge) { console.error("generateLink:", ge.message); process.exit(1); }
console.log(`\nMAGIC SIGN-IN LINK (one-time; redirects to ${APP}):\n\n${link?.properties?.action_link}\n`);
