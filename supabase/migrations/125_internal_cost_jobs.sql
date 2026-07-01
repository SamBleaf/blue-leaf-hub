-- 125: Two standing carpentry jobs for internal cost tracking (not real sites).
--   • Blue Leaf Internal — logistics, yard/trailer clean-up, working at our own houses, any downtime
--     not tied to a site. Lets us cost the business's downtime per financial year / quarter.
--   • Charge Up — chargeable misc works that aren't worth a full job in the system.
-- Structured as carpentry jobs so they flow through the existing Planner (allocation), Workforce
-- (timesheets → labour cost), Carpentry, and Finance — no new tables or app code needed. Cost per
-- FY/quarter is derived from timesheets against these two references. Idempotent (reference UNIQUE).

insert into carpentry_jobs (reference, client_name, address, project_type, status)
values
  ('BL-INTERNAL', 'Blue Leaf Building', 'Blue Leaf Internal — logistics / yard / non-site', 'other', 'active'),
  ('BL-CHARGEUP', 'Blue Leaf Building', 'Charge Up — chargeable misc works',                'other', 'active')
on conflict (reference) do nothing;
