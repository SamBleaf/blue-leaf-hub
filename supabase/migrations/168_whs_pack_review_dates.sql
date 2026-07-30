-- 168_whs_pack_review_dates.sql
-- WHS pack Phase 2 (document control): the 2022 SWMS's worst failure was being four years out of review
-- with nothing on the page saying so. Give every pack a scheduled review date (gate G-8 requires it on
-- approval; G-9 flags a pack past it) and a place to record the competent reviewer + when. Additive.

alter table public.carpentry_whs_packs
  add column if not exists review_due_at  date,
  add column if not exists reviewed_by    text,   -- the competent WHS person (may be an external consultant, not a Hub user)
  add column if not exists reviewed_at     date;
