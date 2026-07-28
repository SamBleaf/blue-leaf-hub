-- 161_whs_stopnow_hardening.sql
-- WHS "stop-now" hardening (from the Hazard Co readiness audit, 2026-07-28). Record-integrity fixes
-- that stand regardless of the cancel decision. Additive + idempotent; no data backfill needed
-- (there are no live WHS records yet).

-- ── 1. Lock down WHS-record RLS ───────────────────────────────────────────────────────────────
-- Migration 064 shipped `FOR ALL TO authenticated USING(true) WITH CHECK(true)` on both WHS tables,
-- so ANY logged-in user could edit or delete ANY WHS record directly via the anon key — no audit
-- trail. All legitimate WHS writes go through the SERVER (service role, which bypasses RLS), so
-- restricting the browser to read-only removes the tamper hole without breaking anything.
drop policy if exists "auth_users" on public.whs_site_profiles;
drop policy if exists "auth_users" on public.whs_documents;

create policy "whs_site_profiles_read" on public.whs_site_profiles
  for select to authenticated using (true);
create policy "whs_documents_read" on public.whs_documents
  for select to authenticated using (true);
-- NO insert/update/delete policies for `authenticated` → the anon key cannot write these tables.
-- The server (service_role) still writes freely. This is the tamper-evidence P0 from the audit.

-- ── 2. Audit columns (populated by the server as the build wires them) ─────────────────────────
alter table public.whs_site_profiles
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;
-- whs_documents already records generated_by; add updated_by for future edit tracking.
alter table public.whs_documents
  add column if not exists updated_by uuid;

-- ── 3. Induction: capture WHICH SWMS each worker acknowledged (defensibility) ──────────────────
-- site_inductions stored only blanket `swms_acknowledged` booleans. For a record that stands up in a
-- SafeWork SA investigation we need the specific SWMS (and later, version) the worker signed onto.
alter table public.site_inductions
  add column if not exists acknowledged_swms jsonb;
comment on column public.site_inductions.acknowledged_swms is
  'The specific SWMS the worker acknowledged at induction: [{id,title}] (version to follow). Powers a defensible per-worker acknowledgement record — not just a blanket boolean.';
