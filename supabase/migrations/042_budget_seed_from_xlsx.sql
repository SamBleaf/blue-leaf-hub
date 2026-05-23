-- Budget seed from Buildxact estimate export (-estimateitems.XLSX)
-- Grand total ex-markup: $37,033.43 | Inc markup+tax: $57,964.30
--
-- HOW TO USE:
-- 1. Find your job UUID: SELECT id, address FROM jobs ORDER BY created_at DESC LIMIT 10;
-- 2. Replace '<YOUR_JOB_UUID>' below with the actual UUID
-- 3. Run the INSERT block

-- ── Step 1: Preview which trade_categories will match ────────────────────────
SELECT tc.id, tc.name, v.xlsx_name, v.amount_ex_markup
FROM (VALUES
  ('Preliminaries',            25371.16),
  ('Hire Items',                  961.00),
  ('Site Establishment',         3669.91),
  ('Demolition / Civil',          967.85),
  ('Concrete & Footings',         539.52),
  ('Termite Protection',           35.00),
  ('Structural Steel',               0.00),
  ('Carpentry',                       0.00),
  ('Windows / Skylights',          2361.68),
  ('External Cladding',               0.00),
  ('Roof Plumber',                    85.00),
  ('Masonry',                        310.74),
  ('Electrical & Data',            2150.00),
  ('Lighting & Automation',           0.00),
  ('Plumbing',                        0.00),
  ('Sanitary Ware',                   0.00),
  ('Stairs',                          0.00),
  ('Insulation',                      48.44),
  ('Internal Linings',               123.13),
  ('Tiler',                          275.00),
  ('Joinery',                         0.00),
  ('Painting',                        5.00),
  ('Garage Door',                     0.00),
  ('Plastering & Rendering',          0.00),
  ('Flooring',                        0.00),
  ('Window Furnishings',              0.00),
  ('Appliances',                      0.00),
  ('Door Hardware',                   0.00),
  ('Fixtures & Fittings',             0.00),
  ('Glazing',                         0.00),
  ('Solar & Batteries',               0.00),
  ('Heating & Cooling',               0.00),
  ('Landscaping',                    130.00),
  ('Paving',                          0.00),
  ('Fencing',                         0.00),
  ('Pool Works',                      0.00),
  ('Site Cleaner',                    0.00)
) AS v(xlsx_name, amount_ex_markup)
JOIN trade_categories tc ON tc.name ILIKE v.xlsx_name
ORDER BY tc.sort_order;

-- ── Step 2: Seed job_budgets (replace UUID below) ─────────────────────────────
-- Uncomment and run after confirming Step 1 matches all 37 categories.

/*
INSERT INTO job_budgets (job_id, trade_category_id, budget_amount, original_budget, seeded_from, seeded_at)
SELECT
  '<YOUR_JOB_UUID>'::uuid,
  tc.id,
  v.amount_ex_markup,
  v.amount_ex_markup,
  'buildxact_xlsx_manual',
  now()
FROM (VALUES
  ('Preliminaries',            25371.16),
  ('Hire Items',                  961.00),
  ('Site Establishment',         3669.91),
  ('Demolition / Civil',          967.85),
  ('Concrete & Footings',         539.52),
  ('Termite Protection',           35.00),
  ('Structural Steel',               0.00),
  ('Carpentry',                       0.00),
  ('Windows / Skylights',          2361.68),
  ('External Cladding',               0.00),
  ('Roof Plumber',                    85.00),
  ('Masonry',                        310.74),
  ('Electrical & Data',            2150.00),
  ('Lighting & Automation',           0.00),
  ('Plumbing',                        0.00),
  ('Sanitary Ware',                   0.00),
  ('Stairs',                          0.00),
  ('Insulation',                      48.44),
  ('Internal Linings',               123.13),
  ('Tiler',                          275.00),
  ('Joinery',                         0.00),
  ('Painting',                        5.00),
  ('Garage Door',                     0.00),
  ('Plastering & Rendering',          0.00),
  ('Flooring',                        0.00),
  ('Window Furnishings',              0.00),
  ('Appliances',                      0.00),
  ('Door Hardware',                   0.00),
  ('Fixtures & Fittings',             0.00),
  ('Glazing',                         0.00),
  ('Solar & Batteries',               0.00),
  ('Heating & Cooling',               0.00),
  ('Landscaping',                    130.00),
  ('Paving',                          0.00),
  ('Fencing',                         0.00),
  ('Pool Works',                      0.00),
  ('Site Cleaner',                    0.00)
) AS v(xlsx_name, amount_ex_markup)
JOIN trade_categories tc ON tc.name ILIKE v.xlsx_name
ON CONFLICT (job_id, trade_category_id) DO UPDATE
  SET budget_amount    = EXCLUDED.budget_amount,
      original_budget  = COALESCE(job_budgets.original_budget, EXCLUDED.original_budget),
      seeded_from      = EXCLUDED.seeded_from,
      seeded_at        = EXCLUDED.seeded_at,
      updated_at       = now();
*/
