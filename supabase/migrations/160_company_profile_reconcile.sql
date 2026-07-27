-- 160_company_profile_reconcile.sql
-- Reconcile the live company_profile table back to its migration-069 shape.
--
-- Root cause: company_profile was created by an earlier step, so mig 069's
-- `CREATE TABLE IF NOT EXISTS` saw the table already existed and silently added NONE of its
-- columns. The live table ended up with only id + email_signature (added later by mig 157).
-- Consequences of the drift:
--   * mig 158's seed INSERT referenced `name` and failed ("column name does not exist").
--   * purchaseOrder PDF generation (procurementRoutes.mjs) reads name/abn/address/phone/email;
--     that read errors on the drifted table and falls back to a hardcoded name + BLANK ABN/address,
--     so POs have been going out without company details.
--
-- This migration is additive + idempotent: it adds the missing columns, guarantees a config row
-- exists, and seeds the safe default `name`. The PO-facing details (ABN/address/phone/email) are
-- staged in a clearly-marked block below for a human to confirm — they print on legal documents,
-- so they are NOT auto-written with unverified values.

-- ── 1. Restore the missing mig-069 columns (each guarded, so re-running is safe) ──────────────
alter table public.company_profile
  add column if not exists name             text not null default 'Blue Leaf Building',
  add column if not exists abn              text,
  add column if not exists building_licence text,
  add column if not exists address          text,
  add column if not exists phone            text,
  add column if not exists email            text,
  add column if not exists logo_url         text,
  add column if not exists updated_at       timestamptz not null default now();

-- ── 2. Guarantee the single config row exists (the PO read + signature default both need one) ──
insert into public.company_profile (name)
select 'Blue Leaf Building'
where not exists (select 1 from public.company_profile);

-- ── 3. Seed the safe default (matches 069's default + the existing hardcoded PO fallback) ──────
update public.company_profile set name = 'Blue Leaf Building' where name is null or name = '';

-- ── 4. COMPANY DETAILS FOR PURCHASE ORDERS ────────────────────────────────────────────────────
-- These print on POs. ABN confirmed by Sam (2026-07-27); address/phone from the saved email
-- signature; email is the send-from address. Only fills a field when it is currently blank, so it
-- never overwrites a value later edited elsewhere.
update public.company_profile set
  abn     = coalesce(nullif(abn, ''),     '88 656 051 188'),
  address = coalesce(nullif(address, ''), 'PO Box 3225 Newton, 5074'),
  phone   = coalesce(nullif(phone, ''),   '0434 046 399'),
  email   = coalesce(nullif(email, ''),   'admin@blueleafbuilding.com.au')
where id = (select id from public.company_profile order by id limit 1);
