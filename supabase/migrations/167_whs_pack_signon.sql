-- 167_whs_pack_signon.sql
-- Phase C: cut worker sign-on over from per-SWMS-module to the ONE composed site WHS pack (Phase B).
-- A worker now signs the pack VERSION (the whole 3-part document), not each module. whs_swms_signon
-- becomes dual-purpose: a row is EITHER a legacy module sign-on (swms_template_id + swms_version) OR a
-- pack sign-on (pack_id + pack_version). A material change bumps carpentry_whs_packs.version → the old
-- sign-on no longer matches the current version → the worker must re-sign. Additive + idempotent.

alter table public.whs_swms_signon
  add column if not exists pack_id      uuid references public.carpentry_whs_packs(id) on delete cascade,
  add column if not exists pack_version integer;

-- Module fields become optional (a pack sign-on has no single template). Existing rows already satisfy
-- the "module" branch of the check below, so it validates without a rewrite.
alter table public.whs_swms_signon alter column swms_template_id drop not null;
alter table public.whs_swms_signon alter column swms_version     drop not null;

-- A sign-on row is exactly one kind: module OR pack.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whs_swms_signon_kind_chk'
  ) then
    alter table public.whs_swms_signon add constraint whs_swms_signon_kind_chk check (
      (swms_template_id is not null and swms_version is not null)
      or (pack_id is not null and pack_version is not null)
    );
  end if;
end $$;

-- One pack sign-on per worker, per pack version. A new version → a new row (re-sign required).
create unique index if not exists whs_swms_signon_pack_unique
  on public.whs_swms_signon (pack_id, pack_version, employee_id)
  where pack_id is not null;
create index if not exists whs_swms_signon_pack_idx
  on public.whs_swms_signon (pack_id) where pack_id is not null;
