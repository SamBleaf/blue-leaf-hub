-- =============================================================================
-- 208 — Takeoff order category (Hub review HUB 007, 19 Oct 2026)
--
-- A job's takeoff has two sections that go to different suppliers: Flashings, and Timber and cladding. Every NEW
-- order is one or the other (the API refuses lines from the other section). Older orders keep a NULL category.
--
-- Additive and safe to re-run. Requires 206 + 207. Placed / cancelled orders are not touched; a DRAFT whose lines
-- all belong to one section is labelled with that section (nothing else about it changes).
-- =============================================================================

ALTER TABLE public.takeoff_orders ADD COLUMN IF NOT EXISTS category text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'takeoff_orders_category_check') THEN
    ALTER TABLE public.takeoff_orders
      ADD CONSTRAINT takeoff_orders_category_check CHECK (category IS NULL OR category IN ('flashings', 'timber_cladding'));
  END IF;
END $$;

-- label existing single-section drafts (a material with no family, or family "flashing", is a flashing)
WITH sec AS (
  SELECT l.order_id,
         CASE WHEN coalesce(m.spec->>'family', 'flashing') = 'flashing' THEN 'flashings' ELSE 'timber_cladding' END AS s
  FROM public.takeoff_order_lines l
  JOIN public.takeoff_job_materials m ON m.id = l.job_material_id
), one AS (
  SELECT order_id, min(s) AS s FROM sec GROUP BY order_id HAVING count(DISTINCT s) = 1
)
UPDATE public.takeoff_orders o SET category = one.s
FROM one
WHERE o.id = one.order_id AND o.category IS NULL AND o.status = 'draft';

NOTIFY pgrst, 'reload schema';
