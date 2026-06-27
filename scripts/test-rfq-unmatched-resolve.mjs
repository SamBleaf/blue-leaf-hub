#!/usr/bin/env node
/**
 * RFQ unmatched quote resolve + propagation API tests.
 * Requires: API on :8787, Supabase service role in .env
 *
 * Usage: node scripts/test-rfq-unmatched-resolve.mjs
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env"), override: true });

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const API = process.env.API_URL || "http://localhost:8787";

if (!URL || !SVC || !ANON) {
  console.error("Missing SUPABASE_URL / SERVICE_ROLE / ANON key");
  process.exit(2);
}

const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const ts = Date.now();
const MARK = `__RFQ_TEST_${ts}`;

let pass = 0;
let fail = 0;
const fails = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

async function api(path, token, method = "GET", body) {
  const r = await fetch(API + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = null;
  try {
    j = await r.json();
  } catch {
    /* non-json */
  }
  return { status: r.status, body: j };
}

const created = { jobId: null, packageId: null, scopeId: null, recipientId: null, rfqId: null, unmatchedId: null, adminToken: null };

async function getAdminToken() {
  const email = process.env.E2E_ADMIN_EMAIL || "e2e-admin@blueleafbuilding.test";
  const password = process.env.E2E_ADMIN_PASSWORD || "BlueLeaf-E2E-2026!";
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Admin sign-in failed (${email}): ${error.message}`);
  return data.session.access_token;
}

async function cleanup() {
  if (created.unmatchedId) {
    await svc.from("unmatched_quote_emails").delete().eq("id", created.unmatchedId);
  }
  if (created.packageId) {
    await svc.from("rfq_packages").delete().eq("id", created.packageId);
  }
  if (created.rfqId) {
    await svc.from("rfqs").delete().eq("id", created.rfqId);
  }
  if (created.jobId) {
    await svc.from("jobs").delete().eq("id", created.jobId);
  }
}

async function run() {
  console.log("\n── RFQ unmatched resolve workflow ──\n");

  try {
    created.adminToken = await getAdminToken();
  } catch (e) {
    console.error(e.message);
    console.error("Run: npm run test:e2e:seed  (or create-e2e-users.mjs)");
    process.exit(2);
  }

  // Seed job + package + rfq + recipient + unmatched row
  const { data: job, error: jobErr } = await svc
    .from("jobs")
    .insert({ address: `${MARK} 42 Test Lane Brighton`, status: "tendering" })
    .select("id")
    .single();
  if (jobErr) throw new Error(jobErr.message);
  created.jobId = job.id;

  const { data: sub } = await svc
    .from("subcontractors")
    .select("id, email")
    .limit(1)
    .maybeSingle();
  if (!sub?.id) throw new Error("No subcontractor in DB — seed subcontractors first");

  const { data: rfq, error: rfqErr } = await svc
    .from("rfqs")
    .insert({
      job_id: job.id,
      subcontractor_id: sub.id,
      trade: "electrical",
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_message_id: `<${MARK}@blueleafbuilding.com.au>`
    })
    .select("id")
    .single();
  if (rfqErr) throw new Error(rfqErr.message);
  created.rfqId = rfq.id;

  const { data: pkg, error: pkgErr } = await svc
    .from("rfq_packages")
    .insert({
      job_id: job.id,
      project_address: `${MARK} 42 Test Lane Brighton`,
      status: "active"
    })
    .select("id")
    .single();
  if (pkgErr) throw new Error(pkgErr.message);
  created.packageId = pkg.id;

  const { data: scope, error: scopeErr } = await svc
    .from("rfq_trade_scopes")
    .insert({
      package_id: pkg.id,
      trade_id: "electrical",
      trade_label: "Electrical",
      status: "sent"
    })
    .select("id")
    .single();
  if (scopeErr) throw new Error(scopeErr.message);
  created.scopeId = scope.id;

  const { data: rec, error: recErr } = await svc
    .from("rfq_recipients")
    .insert({
      package_id: pkg.id,
      trade_scope_id: scope.id,
      subcontractor_id: sub.id,
      business_name: "Test Sub",
      email: sub.email || "test@example.com",
      status: "sent",
      rfq_id: rfq.id
    })
    .select("id")
    .single();
  if (recErr) throw new Error(recErr.message);
  created.recipientId = rec.id;

  const { data: unmatched, error: uErr } = await svc
    .from("unmatched_quote_emails")
    .insert({
      source: "test",
      external_id: `test-${MARK}`,
      from_email: sub.email,
      subject: "Quote for test job",
      body_preview: "Total ex GST: $12,500"
    })
    .select("id")
    .single();
  if (uErr) throw new Error(uErr.message);
  created.unmatchedId = unmatched.id;

  // U1: unmatched row exists
  const { data: uRow } = await svc.from("unmatched_quote_emails").select("id").eq("id", unmatched.id).single();
  check("U1 unmatched row in DB", Boolean(uRow?.id));

  // U2: appears in admin queue
  const list = await api("/api/quote-tracker/unmatched", created.adminToken);
  check("U2 GET unmatched (admin auth)", list.status === 200 && list.body?.ok === true);
  check(
    "U2 item visible in queue",
    (list.body?.items || []).some((i) => i.id === unmatched.id),
    `items=${(list.body?.items || []).length}`
  );

  // Unauthenticated blocked (DRIFT-012 fix)
  const listAnon = await api("/api/quote-tracker/unmatched");
  check("U2b unmatched list requires auth", listAnon.status === 401);

  // U3–U8: resolve
  const resolve = await api("/api/unmatched-quotes/resolve", created.adminToken, "POST", {
    unmatchedId: unmatched.id,
    rfqId: rfq.id
  });
  check("U3 resolve API ok", resolve.status === 200 && resolve.body?.ok === true);
  created.unmatchedId = null;

  const { data: rfqAfter } = await svc.from("rfqs").select("status, received_at").eq("id", rfq.id).single();
  check("U4 rfqs status received", rfqAfter?.status === "received" && Boolean(rfqAfter?.received_at));

  const { data: recAfter } = await svc
    .from("rfq_recipients")
    .select("status, quote_received_at")
    .eq("id", rec.id)
    .single();
  check("U5 rfq_recipients propagated", recAfter?.status === "received" && Boolean(recAfter?.quote_received_at));

  const { data: scopeAfter } = await svc.from("rfq_trade_scopes").select("status").eq("id", scope.id).single();
  check("U5b trade scope received", scopeAfter?.status === "received");

  const { data: uResolved } = await svc
    .from("unmatched_quote_emails")
    .select("resolved_at, matched_rfq_id")
    .eq("id", unmatched.id)
    .maybeSingle();
  check("U7 unmatched soft-resolved", Boolean(uResolved?.resolved_at) && uResolved?.matched_rfq_id === rfq.id);

  const { data: corr } = await svc
    .from("correspondence")
    .select("logged_by")
    .eq("rfq_id", rfq.id)
    .eq("logged_by", "manual-match")
    .limit(1);
  check("U8 auditable correspondence", (corr || []).length >= 1);

  console.log(`\n── Summary: ${pass} passed, ${fail} failed ──\n`);
  if (fails.length) {
    for (const f of fails) console.log(`  ${f}`);
    process.exit(1);
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => cleanup());
