-- 164_carpentry_swms_propping_retag.sql
-- Corrective retag (seed 163 over-tagged). "Temporary Propping & Load-bearing Demolition" is a
-- DEMOLITION SWMS — it applies to renovation/alteration work, not to a new build. Tagging it
-- 'first_fix_framing' made it auto-match every Full Package / Frame job, where load-bearing demolition
-- doesn't occur (and temporary bracing during frame erection is already covered by the separate
-- "Frame Erection, Temporary Bracing & Truss Handling" SWMS). Retag to 'demolition' only, so it
-- auto-attaches to no current project_type and is added on demand via "+ Add SWMS" when a job
-- actually involves demolition. (A WHS professional can refine this mapping in Settings.)
update public.swms_templates
   set work_category = ARRAY['demolition']::text[]
 where trade = 'Carpentry'
   and title = 'Temporary Propping & Load-bearing Demolition';
