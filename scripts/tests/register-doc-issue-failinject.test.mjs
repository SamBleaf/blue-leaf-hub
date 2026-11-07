/**
 * register-doc-issue-failinject.test.mjs — Tab 25 issue 5 FAILURE-INJECTION regression (loopback sandbox only).
 *
 * Forces register_issue_document to FAIL *after* the PDF and DOCX are already uploaded, and asserts the
 * contract issueDocument() promises: "nothing was issued" is literally true — both orphan storage objects
 * are removed and the caller sees an accurate DocumentError (never a half-stored success). It runs the REAL
 * issueDocument() end-to-end against the sandbox (real render → real uploads → real removes); ONLY the RPC
 * outcome (and, for the last case, one upload) is injected by wrapping the service client. Covers:
 *   1. hard RPC error            → both objects removed, DocumentError(400, ISSUE)
 *   2. ok:false version_conflict → each attempt's objects removed, retry, finally DocumentError(409, VERSION); no leak
 *   3. ok:false other reason     → both objects removed, DocumentError(409, ISSUE) carrying the reason
 *   4. DOCX upload fails (returned error) → the already-stored PDF is rolled back, DocumentError(502, STORAGE)  [half-store guard]
 *   5. RPC REJECTS (throws, not a returned error) → both objects removed, DocumentError(400, ISSUE)  [throw path cleans up too]
 *   6. RPC returns 42883 (function missing) → both objects removed, DocumentError(503, SCHEMA)
 *   7. first upload (PDF) fails → DocumentError(502, STORAGE), nothing stored, no cleanup call
 *   8. DOCX upload REJECTS (throws) → the already-stored PDF is rolled back, DocumentError(502, STORAGE)
 * Run: npm run test:register-doc-failinject
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { makeItem, makeRoom, emptyMeta } from "../../src/lib/register.js";
import { issueDocument, DocumentError } from "../../server/lib/registerDocuments.mjs";

const API = process.env.REGISTER_E2E_API || "http://localhost:8797";
const GW = process.env.REGISTER_E2E_GATEWAY || "http://localhost:54321";
for (const u of [API, GW]) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
const SB_DIR = join(homedir(), ".blh-register-sandbox");
const secrets = JSON.parse(readFileSync(join(SB_DIR, "secrets.json"), "utf8"));
const creds = JSON.parse(readFileSync(join(SB_DIR, "credentials.local.json"), "utf8"));
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });
const anon = () => createClient(GW, secrets.anon_key, { auth: { persistSession: false } });
const BUCKET = "lead-documents";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${d}` : ""}`); } };
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

async function signIn(c) {
  const { data, error } = await anon().auth.signInWithPassword({ email: c.email, password: c.password });
  if (error) throw new Error(`signIn ${c.email}: ${error.message}`);
  return data.session.access_token;
}
async function api(tok, method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });
  let b = null; try { b = await r.json(); } catch { /* non-json */ }
  return { ok: r.ok, status: r.status, body: b };
}
async function catchErr(fn) { try { return { threw: false, value: await fn() }; } catch (e) { return { threw: true, e }; } }
// Confirm an object is really gone by LISTING its folder (unambiguous) — and throw loudly if the listing
// itself fails, so a degraded storage backend can never be mis-read as "deleted" (false green).
async function objectGone(path) {
  const i = path.lastIndexOf("/");
  const dir = path.slice(0, i), name = path.slice(i + 1);
  const { data, error } = await svc.storage.from(BUCKET).list(dir, { limit: 1000, search: name });
  if (error) throw new Error(`storage list failed (cannot confirm deletion of ${name}): ${error.message}`);
  return !(data || []).some((o) => o.name === name);
}

// Wrap the real service client: record every upload/remove, delegate all table + storage ops to the real
// sandbox, and let the caller force the register_issue_document RPC outcome (or fail the Nth upload).
function wrap(real, { rpcFault = null, rpcThrow = false, failUploadNo = 0, throwUploadNo = 0 } = {}) {
  const uploads = [], removes = []; let nUpload = 0;
  const client = {
    auth: real.auth,
    from: (...a) => real.from(...a),
    rpc: async (name, args) => {
      if (name === "register_issue_document") {
        if (rpcThrow) throw new Error("injected: register_issue_document rejected (network/timeout)");
        if (rpcFault) return rpcFault(args);
      }
      return real.rpc(name, args);
    },
    storage: {
      from: (b) => {
        const bk = real.storage.from(b);
        return {
          upload: async (path, data, opts) => {
            nUpload += 1; uploads.push(path);
            if (throwUploadNo && nUpload === throwUploadNo) throw new Error("injected: storage upload rejected (network/timeout)");
            if (failUploadNo && nUpload === failUploadNo) return { data: null, error: { message: "injected upload failure", statusCode: "507" } };
            return bk.upload(path, data, opts);
          },
          remove: async (paths) => { removes.push(paths); return bk.remove(paths); },
          createSignedUrl: (...a) => bk.createSignedUrl(...a),
          list: (...a) => bk.list(...a),
          download: (...a) => bk.download(...a),
        };
      },
    },
  };
  return { client, uploads, removes };
}

// Build a lead whose register issues client_brief cleanly in lead mode (same fixture register-e2e proves issuable).
async function buildIssuableLead(staff) {
  const addr = `  BLH TEST   DOC-FAILINJECT ${Date.now()} ${Math.floor(Math.random() * 1e6)}, Adelaide SA 5000`;
  const cA = await api(staff, "POST", "/api/sales/leads", {
    first_name: "Morgan", last_name: "Hart", name: "Morgan & Alex Hart", email: "hart.family@example.invalid", phone: "0400 111 222",
    site_address: addr, suburb: "Stirling", project_type: "renovation", lead_source: "referral", is_test: true, stage: "winning_offer",
    construction_budget_min: 650000, construction_budget_max: 800000, key_requirements: "More light, a family kitchen, better thermal comfort",
    wo_client_vision: "A warm, light-filled home that works for a growing family",
  });
  if (!cA.ok) throw new Error(`lead create failed: ${JSON.stringify(cA.body)}`);
  const leadId = cA.body.lead.id;

  const rooms = [
    ["Ground", "Entry", "hall", "renovated"], ["Ground", "Living", "living", "renovated"], ["Ground", "Kitchen", "kitchen", "new"],
    ["Ground", "External", "external", "renovated"], ["First", "Main bedroom", "bedroom", "new"], ["First", "Bathroom", "bathroom", "new"],
  ].map(([level, name, roomType, scope], order) => makeRoom({ level, name, roomType, scope, order, sheet: level === "Ground" ? "A102 Rev C" : "A103 Rev C" }));
  const R = Object.fromEntries(rooms.map((r) => [r.name, r]));
  const floorDefault = makeItem({ itemKind: "selection", category: "flooring", promptKey: "W-017", section: "project", isDefault: true, description: "Engineered oak, matt — living zones", certainty: "preference" });
  const items = [
    floorDefault,
    makeItem({ itemKind: "selection", category: "paint", promptKey: "W-019", section: "project", isDefault: true, description: "Warm white walls, low sheen; square-set ceilings", certainty: "preference" }),
    makeItem({ itemKind: "requirement", category: "notes", promptKey: "P-005", section: "project", description: "Natural light, Comfort, Storage; growing family", certainty: "preference" }),
    makeItem({ itemKind: "requirement", category: "windows", promptKey: "W-015", section: "project", description: "Double glazing to new openings; control western sun", certainty: "client_approved",
      evidence: { at: new Date().toISOString(), by: "Sandbox Staff", method: "meeting", ref: "Concept presentation" }, technicalStatus: "needs_verification", responsibility: "architect" }),
    makeItem({ itemKind: "scope", category: "demolition", promptKey: "W-004", section: "site", disposition: "remove", description: "Demolish existing kitchen and rear lean-to; retain front rooms" }),
    makeItem({ itemKind: "scope", category: "site", promptKey: "W-007", section: "site", disposition: "included", description: "Family stays in front rooms; temporary kitchen in dining" }),
    makeItem({ itemKind: "scope", category: "scope", promptKey: "R-003", roomId: R.Kitchen.id, disposition: "new", description: "New kitchen with island; make good floor and plumbing", source: "A102 Rev C" }),
    makeItem({ itemKind: "selection", category: "benchtop", promptKey: "K-005", roomId: R.Kitchen.id, description: "Stone-look benchtop, 40mm edge", certainty: "preference" }),
    makeItem({ itemKind: "scope", category: "scope", promptKey: "R-003", roomId: R.External.id, disposition: "retain", description: "Existing west brick wall retained" }),
    makeItem({ itemKind: "scope", category: "external", promptKey: "O-006", roomId: R.External.id, disposition: "excluded", description: "Landscaping to rear yard — client's landscaper later" }),
    makeItem({ itemKind: "action", category: "notes", promptKey: "K-012", roomId: R.Kitchen.id, description: "Decide appliance tier before tender", responsibility: "client" }),
  ];
  const meta = emptyMeta({ rooms, planRev: "Concept set C — 04 Nov 2026", occupancy: "occupied", lastRoomId: R.Kitchen.id, lastStep: "rooms" });
  const s1 = await api(staff, "PUT", `/api/register/leads/${leadId}`, { meta: { ...meta, rev: 0 }, changes: items });
  if (!s1.ok) throw new Error(`register PUT failed: ${JSON.stringify(s1.body).slice(0, 300)}`);
  return leadId;
}

async function cleanup(leadId) {
  try { const { data } = await svc.storage.from(BUCKET).list(`leads/${leadId}/register/client_brief`); if (data?.length) await svc.storage.from(BUCKET).remove(data.map((o) => `leads/${leadId}/register/client_brief/${o.name}`)); } catch { /* */ }
  try { await svc.from("lead_documents").delete().eq("lead_id", leadId); } catch { /* */ }
  try { await svc.from("leads").delete().eq("id", leadId); } catch { /* */ }
}

async function main() {
  const staff = await signIn(creds.staff);
  const leadId = await buildIssuableLead(staff);
  const actor = { id: creds.staff.id, name: "Sandbox Staff", email: creds.staff.email };
  const issueArgs = { recipientName: "Morgan & Alex Hart", recipientEmail: "hart.family@example.invalid", actor };

  // Setup gate: preview must report zero pre-issue errors, else the fixture — not the code — is at fault.
  const pv = await api(staff, "POST", `/api/register/leads/${leadId}/documents/client_brief/preview`, { recipientName: "Morgan & Alex Hart" });
  ok("setup: client_brief is issuable (preview has no pre-issue errors)", pv.ok && Array.isArray(pv.body?.checks?.errors) && pv.body.checks.errors.length === 0, JSON.stringify(pv.body?.checks || pv.body).slice(0, 240));

  // ── Case 1: hard RPC error after both uploads ───────────────────────────────────────────────
  {
    const w = wrap(svc, { rpcFault: () => ({ data: null, error: { code: "XX000", message: "injected: simulated registry failure after uploads" } }) });
    const r = await catchErr(() => issueDocument(w.client, leadId, "client_brief", issueArgs));
    ok("case1: issueDocument throws (nothing returned)", r.threw);
    ok("case1: error is DocumentError(400, ISSUE) — accurate, not a success", r.threw && r.e instanceof DocumentError && r.e.status === 400 && r.e.code === "ISSUE", r.threw ? `status=${r.e.status} code=${r.e.code}` : "did not throw");
    ok("case1: both PDF and DOCX were uploaded before the RPC", w.uploads.length === 2 && w.uploads[0].endsWith(".pdf") && w.uploads[1].endsWith(".docx"), JSON.stringify(w.uploads));
    ok("case1: cleanup removed BOTH orphan objects in one remove([pdf, docx])", w.removes.length === 1 && sameList(w.removes[0], [w.uploads[0], w.uploads[1]]), JSON.stringify(w.removes));
    ok("case1: both objects are really gone from storage (nothing issued)", (await objectGone(w.uploads[0])) && (await objectGone(w.uploads[1])));
  }

  // ── Case 2: ok:false version_conflict on every attempt → retry then VERSION 409, no leak ─────
  {
    const w = wrap(svc, { rpcFault: () => ({ data: { ok: false, reason: "version_conflict" } }) });
    const r = await catchErr(() => issueDocument(w.client, leadId, "client_brief", issueArgs));
    ok("case2: version_conflict on all attempts → DocumentError(409, VERSION)", r.threw && r.e instanceof DocumentError && r.e.status === 409 && r.e.code === "VERSION", r.threw ? `status=${r.e.status} code=${r.e.code}` : "did not throw");
    ok("case2: two attempts uploaded 2 objects each (4 total)", w.uploads.length === 4, JSON.stringify(w.uploads));
    ok("case2: each attempt cleaned up its own pair — no orphan leaked across the retry", w.removes.length === 2 && sameList(w.removes[0], [w.uploads[0], w.uploads[1]]) && sameList(w.removes[1], [w.uploads[2], w.uploads[3]]), JSON.stringify(w.removes));
    const gone = await Promise.all(w.uploads.map(objectGone));
    ok("case2: all four objects are gone from storage", gone.every(Boolean), JSON.stringify(gone));
  }

  // ── Case 3: ok:false with a non-retry reason → ISSUE 409 carrying the reason ─────────────────
  {
    const w = wrap(svc, { rpcFault: () => ({ data: { ok: false, reason: "post_contract_locked" } }) });
    const r = await catchErr(() => issueDocument(w.client, leadId, "client_brief", issueArgs));
    ok("case3: other refusal → DocumentError(409, ISSUE) with the reason surfaced", r.threw && r.e instanceof DocumentError && r.e.status === 409 && r.e.code === "ISSUE" && /post_contract_locked/.test(r.e.detail?.detail || r.e.detail || ""), r.threw ? `status=${r.e.status} code=${r.e.code} detail=${JSON.stringify(r.e.detail)}` : "did not throw");
    ok("case3: both orphan objects removed and gone", w.removes.length === 1 && sameList(w.removes[0], [w.uploads[0], w.uploads[1]]) && (await objectGone(w.uploads[0])) && (await objectGone(w.uploads[1])), JSON.stringify(w.removes));
  }

  // ── Case 4: DOCX upload fails after the PDF stored → roll back the PDF (half-store guard) ─────
  {
    const w = wrap(svc, { failUploadNo: 2 });   // 2nd upload = the .docx
    const r = await catchErr(() => issueDocument(w.client, leadId, "client_brief", issueArgs));
    ok("case4: DOCX upload failure → DocumentError(502, STORAGE)", r.threw && r.e instanceof DocumentError && r.e.status === 502 && r.e.code === "STORAGE", r.threw ? `status=${r.e.status} code=${r.e.code}` : "did not throw");
    ok("case4: only the already-stored PDF is rolled back (remove([pdf]) — no half-stored issue)", w.removes.length === 1 && sameList(w.removes[0], [w.uploads[0]]), JSON.stringify(w.removes));
    ok("case4: the PDF is gone from storage", await objectGone(w.uploads[0]));
  }

  // ── Case 5: RPC REJECTS (throws, not a returned error) after both uploads → still cleaned up ──
  {
    const w = wrap(svc, { rpcThrow: true });
    const r = await catchErr(() => issueDocument(w.client, leadId, "client_brief", issueArgs));
    ok("case5: a THROWN rpc rejection → DocumentError(400, ISSUE), not a raw error", r.threw && r.e instanceof DocumentError && r.e.status === 400 && r.e.code === "ISSUE", r.threw ? `status=${r.e?.status} code=${r.e?.code} name=${r.e?.constructor?.name}` : "did not throw");
    ok("case5: throw path still removed BOTH orphans (nothing issued)", w.removes.length === 1 && sameList(w.removes[0], [w.uploads[0], w.uploads[1]]) && (await objectGone(w.uploads[0])) && (await objectGone(w.uploads[1])), JSON.stringify(w.removes));
  }

  // ── Case 6: RPC returns the migration-missing error (42883) → SCHEMA 503, both removed ────────
  {
    const w = wrap(svc, { rpcFault: () => ({ data: null, error: { code: "42883", message: "function register_issue_document does not exist" } }) });
    const r = await catchErr(() => issueDocument(w.client, leadId, "client_brief", issueArgs));
    ok("case6: 42883 (function missing) → DocumentError(503, SCHEMA)", r.threw && r.e instanceof DocumentError && r.e.status === 503 && r.e.code === "SCHEMA", r.threw ? `status=${r.e?.status} code=${r.e?.code}` : "did not throw");
    ok("case6: both orphan objects removed and gone", w.removes.length === 1 && sameList(w.removes[0], [w.uploads[0], w.uploads[1]]) && (await objectGone(w.uploads[0])) && (await objectGone(w.uploads[1])), JSON.stringify(w.removes));
  }

  // ── Case 7: the FIRST upload (PDF) fails → 502 STORAGE, nothing stored, nothing to clean ──────
  {
    const w = wrap(svc, { failUploadNo: 1 });
    const r = await catchErr(() => issueDocument(w.client, leadId, "client_brief", issueArgs));
    ok("case7: PDF upload failure → DocumentError(502, STORAGE)", r.threw && r.e instanceof DocumentError && r.e.status === 502 && r.e.code === "STORAGE", r.threw ? `status=${r.e?.status} code=${r.e?.code}` : "did not throw");
    ok("case7: nothing stored → no cleanup call at all (removes.length 0)", w.removes.length === 0, JSON.stringify(w.removes));
  }

  // ── Case 8: DOCX upload REJECTS (throws) after the PDF stored → PDF rolled back ───────────────
  {
    const w = wrap(svc, { throwUploadNo: 2 });
    const r = await catchErr(() => issueDocument(w.client, leadId, "client_brief", issueArgs));
    ok("case8: a THROWN DOCX upload rejection → DocumentError(502, STORAGE)", r.threw && r.e instanceof DocumentError && r.e.status === 502 && r.e.code === "STORAGE", r.threw ? `status=${r.e?.status} code=${r.e?.code}` : "did not throw");
    ok("case8: the already-stored PDF is rolled back (remove([pdf]) only) and gone", w.removes.length === 1 && sameList(w.removes[0], [w.uploads[0]]) && (await objectGone(w.uploads[0])), JSON.stringify(w.removes));
  }

  await cleanup(leadId);
  console.log(`\nregister-doc-issue-failinject: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
