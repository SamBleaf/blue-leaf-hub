/**
 * register-migration-213.test.mjs — Master Register R03 DDL + RPC test (real Postgres, no Docker).
 *
 * Spins up a DISPOSABLE Postgres cluster in the OS temp dir (initdb + pg_ctl, socket-only), creates the
 * minimal prerequisite schema the register touches (shapes copied from migrations 028/060/069/103/104/
 * 188/194/199), applies 212 then 213, and proves the canonical write-through contract:
 *   • promote-once (staged selections, scope/requirement → room_scope_items, idempotent, observable),
 *   • optimistic concurrency (row versions bumped by EVERY writer, stale writes rejected, nothing written),
 *   • guards: issued rows can't be deleted/reclassified, approvals lock after contract, evidence required
 *     on the transition to client-approved / verified (not for pre-existing board approvals),
 *   • atomicity (a failing op rolls back the whole call), room rename propagation, meta revisions,
 *   • issue registry (supersede chain, version conflict, immutability, cascade delete still allowed),
 *   • RLS deny_clients on room_scope_items for a portal-client JWT, RPC not executable by browser roles,
 *   • delivery_model CHECK + backfill, ROLLBACK block reverses 213, re-apply idempotent.
 * The cluster is always torn down. Run: npm run test:register-213-db
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG = (n) => join(__dirname, "../../supabase/migrations", n);
const M212 = MIG("212_master_register_promotion.sql");
const M213 = MIG("213_master_register_r03.sql");
const PORT = "5441";
const dataDir = mkdtempSync(join(tmpdir(), "mr213-pg-"));

let passed = 0, failed = 0, started = false;
function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `\n    ${detail}` : ""}`); }
}
const PG_ENV = { ...process.env, LC_ALL: "C", LANG: "C" };
const pgctl = (args) => execFileSync("pg_ctl", ["-D", dataDir, ...args], { stdio: "pipe", env: PG_ENV });

function rollbackSql(sqlText) {
  const idx = sqlText.indexOf("-- ROLLBACK");
  if (idx === -1) return "";
  return sqlText.slice(idx).split("\n").filter((l) => l.startsWith("--   ")).map((l) => l.replace(/^--\s{3}/, "")).join("\n");
}

const PREREQ = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $f$ SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $f$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

  CREATE TABLE user_profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), role text, is_active boolean DEFAULT true);
  CREATE FUNCTION public.auth_is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
    $f$ SELECT EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_active AND up.role IN ('admin','supervisor','employee')) $f$;
  GRANT EXECUTE ON FUNCTION public.auth_is_staff() TO authenticated;

  CREATE TABLE jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), address text, status text, project_type text);
  CREATE TABLE leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, job_id uuid,
                      selections_schedule jsonb NOT NULL DEFAULT '[]'::jsonb);
  CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES jobs(id),
                         address text, status text DEFAULT 'active', is_preconstruction boolean DEFAULT false);
  CREATE TABLE client_selections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category text NOT NULL, item_name text NOT NULL, room_area text, due_date date,
    lead_time_weeks int, order_by_date date, allowance_amount numeric(12,2),
    status text NOT NULL DEFAULT 'not_started'
      CHECK (status IN ('not_started','awaiting_client','in_review','approved','ordered','installed','overdue')),
    selected_product text, selected_supplier text, selected_model_code text,
    cost_impact numeric(12,2), time_impact_days int DEFAULT 0, linked_variation_id uuid,
    client_notes text, internal_notes text, attachments jsonb DEFAULT '[]'::jsonb, inspiration_photos jsonb DEFAULT '[]'::jsonb,
    approved_at timestamptz, approved_by_user_id uuid REFERENCES auth.users(id), sort_order int DEFAULT 0,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
  CREATE TABLE selection_options (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    selection_id uuid NOT NULL REFERENCES client_selections(id) ON DELETE CASCADE, label text NOT NULL, product_name text);
  CREATE TABLE client_actions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, action_type text NOT NULL, title text NOT NULL,
    description text, related_entity_type text, related_entity_id uuid, due_date date, priority text DEFAULT 'normal',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','viewed','responded','approved','rejected','overdue','completed')),
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
  CREATE TABLE job_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
    event_type text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), actor_id uuid REFERENCES auth.users(id),
    source text DEFAULT 'system', entity_type text, entity_id uuid, metadata jsonb DEFAULT '{}'::jsonb);
  CREATE TABLE lead_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE, filename text NOT NULL, file_size int, mime_type text,
    storage_path text NOT NULL, document_type text NOT NULL DEFAULT 'other', uploaded_by text NOT NULL DEFAULT 'Sam Morris',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_documents_document_type_check CHECK (document_type IN ('brief','blueprint','survey','quote','contract','ptsa_signed',
      'concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other')));
  ALTER TABLE client_selections ENABLE ROW LEVEL SECURITY;
  CREATE POLICY auth_internal ON client_selections FOR ALL TO authenticated USING (true) WITH CHECK (true);
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
`;

async function main() {
  execFileSync("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C"], { stdio: "pipe", env: PG_ENV });
  const logFile = join(dataDir, "server.log");
  try { pgctl(["-l", logFile, "-o", `-p ${PORT} -k ${dataDir} -c listen_addresses=`, "-w", "start"]); }
  catch (e) { let log = ""; try { log = readFileSync(logFile, "utf8"); } catch { /* */ } throw new Error(`pg_ctl start failed: ${e.message}\n${log}`); }
  started = true;
  const db = new pg.Client({ host: dataDir, port: PORT, user: "postgres", database: "postgres" });
  await db.connect();
  const q = (sql, params) => db.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];

  await q(PREREQ);
  const sql212 = readFileSync(M212, "utf8"), sql213 = readFileSync(M213, "utf8");
  await q(sql212);
  // a lead with an R02 meta deliveryModel 'cm' BEFORE 213 → backfill must map it
  const staff = (await one(`INSERT INTO auth.users (email) VALUES ('staff@x') RETURNING id`)).id;
  const client = (await one(`INSERT INTO auth.users (email) VALUES ('client@x') RETURNING id`)).id;
  await q(`INSERT INTO user_profiles (id, role) VALUES ($1,'admin'),($2,'client')`, [staff, client]);
  const job = (await one(`INSERT INTO jobs (address) VALUES ('1 Test St') RETURNING id`)).id;
  const lead = (await one(`INSERT INTO leads (name, job_id, selections_schedule) VALUES ('Jane Smith', $1,
     '[{"kind":"meta","deliveryModel":"cm","rooms":[]}]'::jsonb) RETURNING id`, [job])).id;
  const lead2 = (await one(`INSERT INTO leads (name) VALUES ('Other') RETURNING id`)).id;
  const proj = (await one(`INSERT INTO projects (job_id, is_preconstruction) VALUES ($1, true) RETURNING id`, [job])).id;

  await q(sql213);
  console.log("\n▸ structure");
  const cols = new Set((await q(`SELECT column_name FROM information_schema.columns WHERE table_name='client_selections'`)).rows.map((r) => r.column_name));
  for (const c of ["certainty", "disposition", "technical_status", "pricing_status", "approval_evidence", "supply_by", "finish", "quantity", "source_room_id", "register_detail"]) check(`client_selections.${c}`, cols.has(c));
  check("projects.register_meta", !!(await one(`SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='register_meta'`)));
  check("delivery_model backfilled from R02 meta ('cm' → construction_management)",
    (await one(`SELECT delivery_model FROM leads WHERE id=$1`, [lead])).delivery_model === "construction_management");
  check("register_apply not executable by authenticated",
    !(await one(`SELECT has_function_privilege('authenticated','public.register_apply(uuid,uuid,jsonb,jsonb,text)','EXECUTE') AS x`)).x);
  check("register_apply executable by service_role",
    (await one(`SELECT has_function_privilege('service_role','public.register_apply(uuid,uuid,jsonb,jsonb,text)','EXECUTE') AS x`)).x);
  check("room_scope_items has deny_clients", !!(await one(`SELECT 1 FROM pg_policies WHERE tablename='room_scope_items' AND policyname='deny_clients'`)));

  const apply = async (ops, mode = "edit", projectId = proj, leadId = lead) =>
    (await one(`SELECT public.register_apply($1,$2,$3::jsonb,$4::jsonb,$5) AS r`,
      [projectId, leadId, JSON.stringify(ops), JSON.stringify({ id: staff, name: "Staff Member" }), mode])).r;
  const sel = (item) => one(`SELECT * FROM client_selections WHERE project_id=$1 AND source_register_item_id=$2`, [proj, item]);
  const rsi = (item) => one(`SELECT * FROM room_scope_items WHERE project_id=$1 AND source_register_item_id=$2`, [proj, item]);
  const ver = (row) => row.updated_at.toISOString ? row.updated_at.toISOString() : String(row.updated_at);
  const verText = async (table, id) => (await one(`SELECT updated_at::text AS v FROM ${table} WHERE id=$1`, [id])).v;

  console.log("\n▸ promote-once");
  const meta = { rooms: [{ id: "rm_k", name: "Kitchen", level: "GF", roomType: "kitchen", scope: "renovated", order: 0 }], planRev: "A102 Rev C" };
  const promoteOps = [
    { op: "meta_init", meta },
    { op: "sel_insert", item_id: "ri_sink", row: { category: "Sanitary / tapware", item_name: "Sink & mixer", room_area: "Kitchen", source_room_id: "rm_k", certainty: "proposed", selected_product: "Franke undermount", technical_status: "not_required", pricing_status: "not_reviewed" } },
    { op: "sel_insert", item_id: "ri_floor", row: { category: "Flooring", item_name: "Engineered oak", certainty: "preference", register_detail: { isDefault: true, section: "project" } } },
    { op: "scope_insert", item_id: "ri_kscope", row: { item_kind: "scope", category: "scope", disposition: "new", description: "New kitchen + island", room_area: "Kitchen", source_room_id: "rm_k" } },
    { op: "scope_insert", item_id: "ri_req", row: { item_kind: "requirement", category: "insulation", description: "Improve thermal comfort", technical_status: "needs_verification", responsibility: "architect" } },
  ];
  const p1 = await apply(promoteOps, "promote");
  check("promotion ok + counts", p1.ok && p1.promoted?.selections === 2 && p1.promoted?.scopeItems === 2, JSON.stringify(p1));
  const sink = await sel("ri_sink");
  check("promoted selection staged (client_visible=false, status not_started)", sink.client_visible === false && sink.status === "not_started", `${sink.client_visible} ${sink.status}`);
  check("certainty stored on its own axis", sink.certainty === "proposed");
  check("requirement stored in room_scope_items (never client_selections)", !!(await rsi("ri_req")) && !(await sel("ri_req")));
  check("no client_actions created by promotion", Number((await one(`SELECT count(*) c FROM client_actions`)).c) === 0);
  const pm = (await one(`SELECT register_meta FROM projects WHERE id=$1`, [proj])).register_meta;
  check("register_meta initialised with rev 1 + promotion record", pm.rev === 1 && pm.promotion?.status === "complete" && pm.planRev === "A102 Rev C", JSON.stringify(pm));
  const p2 = await apply(promoteOps, "promote");
  check("second promotion is a no-op (already_promoted)", p2.ok && p2.already_promoted === true);
  check("no duplicate rows after re-promotion", Number((await one(`SELECT count(*) c FROM client_selections WHERE project_id=$1`, [proj])).c) === 2);
  check("promotion recorded in job_events", Number((await one(`SELECT count(*) c FROM job_events WHERE event_type='register.promoted'`)).c) === 1);

  console.log("\n▸ versioned edits (write-through after promotion)");
  const v0 = await verText("client_selections", sink.id);
  const e1 = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sink.id, base_version: v0, row: { ...{ category: "Sanitary / tapware", item_name: "Sink & mixer", room_area: "Kitchen", source_room_id: "rm_k" }, certainty: "proposed", selected_product: "Franke Bell 1.5 bowl", technical_status: "not_required", pricing_status: "allowance_or_estimate", pricing_ref: "fee_proposal:PC-12" } }]);
  const sink1 = await sel("ri_sink");
  check("office edit lands on the canonical row", e1.ok && sink1.selected_product === "Franke Bell 1.5 bowl" && sink1.pricing_status === "allowance_or_estimate", JSON.stringify(e1));
  check("row version bumped", (await verText("client_selections", sink.id)) !== v0);
  const stale = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sink.id, base_version: v0, row: { item_name: "Sink & mixer", certainty: "proposed", selected_product: "STALE WRITE" } }]);
  check("stale base version → conflict", !stale.ok && stale.conflicts?.[0]?.reason === "stale", JSON.stringify(stale).slice(0, 200));
  check("stale write did not land", (await sel("ri_sink")).selected_product === "Franke Bell 1.5 bowl");
  // a portal client's choice (any writer) bumps the version via the trigger
  const vBefore = await verText("client_selections", sink.id);
  await q(`UPDATE client_selections SET client_notes='client note' WHERE id=$1`, [sink.id]);
  check("trigger bumps version for ANY writer (portal / sweep)", (await verText("client_selections", sink.id)) !== vBefore);

  console.log("\n▸ evidence gates");
  let vs = await verText("client_selections", sink.id);
  const noEv = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sink.id, base_version: vs, row: { item_name: "Sink & mixer", certainty: "client_approved", selected_product: "Franke Bell 1.5 bowl" } }]);
  check("client_approved without evidence → evidence_required", !noEv.ok && noEv.conflicts?.[0]?.reason === "evidence_required");
  const withEv = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sink.id, base_version: vs, row: { item_name: "Sink & mixer", room_area: "Kitchen", source_room_id: "rm_k", certainty: "client_approved", selected_product: "Franke Bell 1.5 bowl", approval_evidence: { at: "2026-11-12T10:00:00Z", by: "Staff Member", ref: "Concept presentation 12 Nov" } } }]);
  const sinkA = await sel("ri_sink");
  check("approval with evidence → status approved + approved_at + approver", withEv.ok && sinkA.status === "approved" && sinkA.approved_at && sinkA.approved_by_user_id === staff, JSON.stringify(withEv));
  // a board-approved row (no evidence) stays editable for non-product fields
  const board = (await one(`INSERT INTO client_selections (project_id, category, item_name, status, approved_at) VALUES ($1,'Tiling','Board approved tile','approved', now()) RETURNING *`, [proj]));
  const bv = await verText("client_selections", board.id);
  const boardEdit = await apply([{ op: "sel_update", item_id: "cs_" + board.id, row_id: board.id, base_version: bv, row: { category: "Tiling", item_name: "Board approved tile", certainty: "client_approved", next_action: "Confirm grout colour" } }]);
  check("pre-existing board approval editable without new evidence", boardEdit.ok, JSON.stringify(boardEdit));
  // changing the product of an approved selection while keeping it approved needs a NEW approval
  const sinkA2 = await sel("ri_sink");
  const vA2 = await verText("client_selections", sinkA2.id);
  const baseA2 = { category: sinkA2.category, item_name: sinkA2.item_name, room_area: sinkA2.room_area, source_room_id: "rm_k", certainty: "client_approved", approval_evidence: sinkA2.approval_evidence };
  const reap = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sinkA2.id, base_version: vA2, row: { ...baseA2, selected_product: "Different sink" } }]);
  check("changing an approved product without a new approval → reapproval_required", !reap.ok && reap.conflicts?.[0]?.reason === "reapproval_required", JSON.stringify(reap));
  const back = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sinkA2.id, base_version: vA2, row: { ...baseA2, certainty: "proposed", selected_product: "Different sink" } }]);
  const sinkBack = await sel("ri_sink");
  check("…stepping it back to proposed is allowed pre-contract (approval cleared)", back.ok && sinkBack.status === "not_started" && sinkBack.approved_at === null && sinkBack.approval_evidence === null, JSON.stringify(back));
  const reApp = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sinkBack.id, base_version: await verText("client_selections", sinkBack.id), row: { ...baseA2, selected_product: "Franke Bell 1.5 bowl", approval_evidence: { at: "2026-11-15T09:00:00Z", by: "Staff Member", method: "email", ref: "Client email 15 Nov" } } }]);
  check("…and re-approving with fresh evidence lands", reApp.ok && (await sel("ri_sink")).status === "approved");
  check("board-created row adopted into the register (source id stamped)", (await one(`SELECT source_register_item_id s FROM client_selections WHERE id=$1`, [board.id])).s === "cs_" + board.id);
  const rq = await rsi("ri_req");
  const tv = await verText("room_scope_items", rq.id);
  const noTev = await apply([{ op: "scope_update", item_id: "ri_req", row_id: rq.id, base_version: tv, row: { item_kind: "requirement", category: "insulation", description: "Improve thermal comfort", technical_status: "verified" } }]);
  check("technical verified without evidence → technical_evidence_required", !noTev.ok && noTev.conflicts?.[0]?.reason === "technical_evidence_required");
  const okTev = await apply([{ op: "scope_update", item_id: "ri_req", row_id: rq.id, base_version: tv, row: { item_kind: "requirement", category: "insulation", description: "Improve thermal comfort", technical_status: "verified", technical_evidence: { at: "2026-11-20", by: "Architect", ref: "A301 Rev D wall detail" } } }]);
  check("technical verified with evidence lands", okTev.ok && (await rsi("ri_req")).technical_status === "verified");

  console.log("\n▸ issue / return / withdraw");
  const floor = await sel("ri_floor");
  const iss = await apply([{ op: "sel_issue", item_id: "ri_floor", row_id: floor.id, base_version: await verText("client_selections", floor.id) }]);
  const floorI = await sel("ri_floor");
  check("issue → client_visible + awaiting_client + client action", iss.ok && floorI.client_visible === true && floorI.status === "awaiting_client"
    && Number((await one(`SELECT count(*) c FROM client_actions WHERE related_entity_id=$1 AND status='pending'`, [floor.id])).c) === 1);
  // client chooses (portal path) → in_review; staff returns it
  await q(`UPDATE client_selections SET selected_product='Option B oak', status='in_review' WHERE id=$1`, [floor.id]);
  await q(`UPDATE client_actions SET status='responded' WHERE related_entity_id=$1`, [floor.id]);
  const ret = await apply([{ op: "sel_return", item_id: "ri_floor", row_id: floor.id, base_version: await verText("client_selections", floor.id), note: "Please reconsider" }]);
  check("return → awaiting_client + action pending again", ret.ok && (await sel("ri_floor")).status === "awaiting_client"
    && (await one(`SELECT status FROM client_actions WHERE related_entity_id=$1`, [floor.id])).status === "pending");
  const delIssued = await apply([{ op: "sel_delete", item_id: "ri_floor", row_id: floor.id, base_version: await verText("client_selections", floor.id) }]);
  check("issued selection cannot be deleted", !delIssued.ok && delIssued.conflicts?.[0]?.reason === "issued_locked");
  // reclassification attempt on an issued row is atomic: scope insert must NOT land
  const recl = await apply([
    { op: "sel_delete", item_id: "ri_floor", row_id: floor.id, base_version: await verText("client_selections", floor.id) },
    { op: "scope_insert", item_id: "ri_floor", row: { item_kind: "selection", disposition: "excluded", description: "Excluded" } },
  ]);
  check("reclassifying an issued row is refused and nothing is written", !recl.ok && !(await rsi("ri_floor")));
  const wd = await apply([{ op: "sel_withdraw", item_id: "ri_floor", row_id: floor.id, base_version: await verText("client_selections", floor.id) }]);
  check("withdraw → hidden + open client actions removed", wd.ok && (await sel("ri_floor")).client_visible === false
    && Number((await one(`SELECT count(*) c FROM client_actions WHERE related_entity_id=$1`, [floor.id])).c) === 0);
  const recl2 = await apply([
    { op: "sel_delete", item_id: "ri_floor", row_id: floor.id, base_version: await verText("client_selections", floor.id) },
    { op: "scope_insert", item_id: "ri_floor", row: { item_kind: "selection", disposition: "by_others", description: "Client supplies flooring" } },
  ]);
  check("staged selection reclassified to scope atomically (same stable id)", recl2.ok && !(await sel("ri_floor")) && (await rsi("ri_floor"))?.disposition === "by_others", JSON.stringify(recl2));

  console.log("\n▸ atomicity");
  const ks = await rsi("ri_kscope");
  let bad;
  try {
    bad = await apply([
      { op: "scope_update", item_id: "ri_kscope", row_id: ks.id, base_version: await verText("room_scope_items", ks.id), row: { item_kind: "scope", category: "scope", disposition: "alter", description: "CHANGED" } },
      { op: "scope_insert", item_id: "ri_bad", row: { item_kind: "scope", disposition: "bogus_value" } },
    ]);
  } catch (e) { bad = { error: e.message }; }
  check("a failing op aborts the whole call", !!bad?.error && /rsi_disposition_check|violates check/i.test(bad.error), JSON.stringify(bad));
  check("…and the earlier op in the same call did not land", (await rsi("ri_kscope")).description === "New kitchen + island");

  console.log("\n▸ meta revisions + room rename propagation");
  const m1 = (await one(`SELECT register_meta FROM projects WHERE id=$1`, [proj])).register_meta;
  const ren = await apply([{ op: "meta_set", base_rev: m1.rev, meta: { ...m1, rooms: [{ ...meta.rooms[0], name: "Kitchen & Scullery" }] } }]);
  check("meta_set ok + rev incremented + promotion preserved", ren.ok && (await one(`SELECT register_meta m FROM projects WHERE id=$1`, [proj])).m.rev === m1.rev + 1
    && !!(await one(`SELECT register_meta m FROM projects WHERE id=$1`, [proj])).m.promotion);
  check("room rename propagated to selections + scope rows", (await sel("ri_sink")).room_area === "Kitchen & Scullery" && (await rsi("ri_kscope")).room_area === "Kitchen & Scullery");
  const staleMeta = await apply([{ op: "meta_set", base_rev: m1.rev, meta: m1 }]);
  check("stale meta rev → meta_stale conflict", !staleMeta.ok && staleMeta.conflicts?.[0]?.reason === "meta_stale");

  console.log("\n▸ post-contract locks");
  await q(`UPDATE projects SET is_preconstruction=false WHERE id=$1`, [proj]);
  const sinkP = await sel("ri_sink");
  const vP = await verText("client_selections", sinkP.id);
  const base = { category: sinkP.category, item_name: sinkP.item_name, room_area: sinkP.room_area, source_room_id: "rm_k", certainty: "client_approved", selected_product: sinkP.selected_product, technical_status: sinkP.technical_status, pricing_status: sinkP.pricing_status, pricing_ref: sinkP.pricing_ref, approval_evidence: sinkP.approval_evidence };
  const lockP = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sinkP.id, base_version: vP, row: { ...base, selected_product: "Different sink" } }]);
  check("approved product change after contract → post_contract_locked", !lockP.ok && lockP.conflicts?.[0]?.reason === "post_contract_locked");
  const unappr = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sinkP.id, base_version: vP, row: { ...base, certainty: "proposed" } }]);
  check("un-approving after contract → post_contract_locked", !unappr.ok && unappr.conflicts?.[0]?.reason === "post_contract_locked");
  const noteP = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sinkP.id, base_version: vP, row: { ...base, next_action: "Order with joinery" } }]);
  check("non-product note on an approved row still allowed after contract", noteP.ok, JSON.stringify(noteP));
  check("history captured the change set", !!(await one(`SELECT 1 FROM job_events WHERE event_type='register.item.updated' AND metadata->'changes' ? 'next_action' AND (metadata->>'post_contract')::boolean`)));

  console.log("\n▸ cross-project isolation in the RPC");
  const job2 = (await one(`INSERT INTO jobs (address) VALUES ('2 Other St') RETURNING id`)).id;
  const proj2 = (await one(`INSERT INTO projects (job_id, is_preconstruction) VALUES ($1, true) RETURNING id`, [job2])).id;
  const cross = await apply([{ op: "sel_update", item_id: "ri_sink", row_id: sinkP.id, base_version: await verText("client_selections", sinkP.id), row: { item_name: "hijack" } }], "edit", proj2, lead2);
  check("a row from another project is 'missing' (cannot be touched)", !cross.ok && cross.conflicts?.[0]?.reason === "missing");

  console.log("\n▸ issue registry + immutability");
  const issue = async (exp, path) => (await one(`SELECT public.register_issue_document($1,'client_brief',$2,$3::jsonb) AS r`,
    [lead, exp, JSON.stringify({ filename: `brief-${exp}.pdf`, storage_path: path, mime_type: "application/pdf", content_sha256: "abc" + exp, revision_label: `P0${exp}`, template_key: "client_brief", template_version: "r04", source_snapshot: { v: exp }, recipient_name: "Jane Smith" })])).r;
  const d1 = await issue(1, "leads/x/brief-1.pdf");
  check("revision 1 issued as current", d1.ok && d1.document.version === 1 && d1.document.status === "current");
  const d2 = await issue(2, "leads/x/brief-2.pdf");
  check("revision 2 supersedes revision 1", d2.ok && d2.superseded_id === d1.document.id
    && (await one(`SELECT status FROM lead_documents WHERE id=$1`, [d1.document.id])).status === "superseded");
  const dx = await issue(2, "leads/x/brief-x.pdf");
  check("expected-version mismatch → version_conflict (no write)", !dx.ok && dx.reason === "version_conflict" && dx.next_version === 3);
  let immut = null; try { await q(`UPDATE lead_documents SET storage_path='hacked' WHERE id=$1`, [d1.document.id]); } catch (e) { immut = e.message; }
  check("issued file path cannot be changed", /immutable/.test(immut || ""), immut);
  let resurrect = null; try { await q(`UPDATE lead_documents SET status='current' WHERE id=$1`, [d1.document.id]); } catch (e) { resurrect = e.message; }
  check("a superseded revision cannot be made current again", /immutable/.test(resurrect || ""));
  let del = null; try { await q(`DELETE FROM lead_documents WHERE id=$1`, [d2.document.id]); } catch (e) { del = e.message; }
  check("issued document cannot be deleted directly", /immutable/.test(del || ""));
  check("superseded revision still retrievable", !!(await one(`SELECT 1 FROM lead_documents WHERE id=$1 AND storage_path='leads/x/brief-1.pdf'`, [d1.document.id])));
  const tmpLead = (await one(`INSERT INTO leads (name) VALUES ('Disposable') RETURNING id`)).id;
  await one(`SELECT public.register_issue_document($1,'client_brief',1,'{"filename":"a.pdf","storage_path":"p"}'::jsonb)`, [tmpLead]);
  let casc = null; try { await q(`DELETE FROM leads WHERE id=$1`, [tmpLead]); } catch (e) { casc = e.message; }
  check("deleting a whole (test) lead still cascades its issued docs", casc === null, casc);

  console.log("\n▸ RLS: portal client denied room_scope_items via PostgREST role");
  await q(`GRANT SELECT ON room_scope_items, client_selections TO authenticated`);
  const asRole = async (uid) => {
    await q("BEGIN");
    await q(`SET LOCAL ROLE authenticated`);
    await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const n = Number((await one(`SELECT count(*) c FROM room_scope_items`)).c);
    await q("ROLLBACK");
    return n;
  };
  check("client JWT sees 0 room_scope_items", (await asRole(client)) === 0);
  check("staff JWT sees room_scope_items", (await asRole(staff)) > 0);

  console.log("\n▸ vocabularies");
  let badKind = null; try { await q(`INSERT INTO room_scope_items (project_id, item_kind) VALUES ($1,'bogus')`, [proj]); } catch (e) { badKind = e.message; }
  check("item_kind CHECK rejects unknown kinds", /item_kind/.test(badKind || ""));
  let badDm = null; try { await q(`UPDATE leads SET delivery_model='nonsense' WHERE id=$1`, [lead]); } catch (e) { badDm = e.message; }
  check("delivery_model CHECK enforced", /delivery_model/.test(badDm || ""));

  console.log("\n▸ rollback + re-apply");
  await q(`DELETE FROM lead_documents WHERE issued_at IS NOT NULL AND false`); // (issued rows stay; rollback drops the guard first)
  await q(rollbackSql(sql213));
  check("rollback drops register_apply", !(await one(`SELECT to_regprocedure('public.register_apply(uuid,uuid,jsonb,jsonb,text)') AS f`)).f);
  check("rollback drops register columns", !(await one(`SELECT 1 FROM information_schema.columns WHERE table_name='client_selections' AND column_name='certainty'`)));
  check("rollback restores the 212 item_kind CHECK", /'scope'::text, 'selection'::text/.test((await one(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname='room_scope_items_item_kind_check'`)).d));
  await q(sql213);
  await q(sql213);
  check("re-applying 213 twice is idempotent", !!(await one(`SELECT to_regprocedure('public.register_apply(uuid,uuid,jsonb,jsonb,text)') AS f`)).f);

  await db.end();
}

main()
  .catch((e) => { failed++; console.error("\n✗ FATAL:", e.stack || e.message); })
  .finally(() => {
    if (started) { try { pgctl(["-m", "immediate", "stop"]); } catch { /* ignore */ } }
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    console.log(`\nregister-migration-213: ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
