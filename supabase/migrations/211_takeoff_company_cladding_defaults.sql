-- 211_takeoff_company_cladding_defaults.sql
-- Hub review HUB 014: Blue Leaf's company cladding defaults for the James Hardie products in the catalogue
-- (Axon, Linea, Stria, Matrix). Sam's reviewed values: cavity, wind N2, timber frame, fixed on studs,
-- ND nails, 10% spares, and for Axon sheets the 10 mm H-flashing joint rule (HUB 015).
--
-- Each default is an ordinary company preset (migration 206 tables) marked rules.companyDefault = true and
-- keyed by the catalogue product id. Only the product's identity is stored: sizes, cover and stock lengths
-- still come from the catalogue. The app applies only the answers each product's own assembly asks for
-- (for example Stria takes wind; edge zone and fixing style stay "still needed").
--
-- Additive and safe to re-run: a product that already has an active company default (seeded here or saved
-- in the app) is skipped. One statement, no temporary tables (the Supabase SQL editor runs it as one).
-- Requires 206. Rollback: retire the presets in the app (Company products → Retire) — never delete revisions.
WITH d(name, method_key, method_version, spec, rules) AS (VALUES
  ('Axon 133 grained — company default', 'sheet_layout', 2, '{"family":"cladding","layout":"sheet","orientation":"vertical","assemblyId":"axon-vertical","product":{"id":"James Hardie|Axon 133 grained|1200|9","manufacturer":"James Hardie","name":"Axon 133 grained","widthMm":1200,"thicknessMm":9},"spareRate":10,"supplierName":null}'::jsonb, '{"companyDefault":true,"route":"cavity","installConditions":{"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"},"jointRows":{"atMm":[],"gapMm":10,"detailRef":"H-flashing"}}'::jsonb),
  ('Axon 133 smooth — company default', 'sheet_layout', 2, '{"family":"cladding","layout":"sheet","orientation":"vertical","assemblyId":"axon-vertical","product":{"id":"James Hardie|Axon 133 smooth|1200|9","manufacturer":"James Hardie","name":"Axon 133 smooth","widthMm":1200,"thicknessMm":9},"spareRate":10,"supplierName":null}'::jsonb, '{"companyDefault":true,"route":"cavity","installConditions":{"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"},"jointRows":{"atMm":[],"gapMm":10,"detailRef":"H-flashing"}}'::jsonb),
  ('Axon 400 smooth — company default', 'sheet_layout', 2, '{"family":"cladding","layout":"sheet","orientation":"vertical","assemblyId":"axon-vertical","product":{"id":"James Hardie|Axon 400 smooth|1200|9","manufacturer":"James Hardie","name":"Axon 400 smooth","widthMm":1200,"thicknessMm":9},"spareRate":10,"supplierName":null}'::jsonb, '{"companyDefault":true,"route":"cavity","installConditions":{"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"},"jointRows":{"atMm":[],"gapMm":10,"detailRef":"H-flashing"}}'::jsonb),
  ('Linea 150 mm — company default', 'course_layout', 1, '{"family":"cladding","layout":"course","orientation":"horizontal","assemblyId":"linea-horizontal","product":{"id":"James Hardie|Linea|150|16","manufacturer":"James Hardie","name":"Linea","widthMm":150,"thicknessMm":16},"spareRate":10,"supplierName":null}'::jsonb, '{"companyDefault":true,"route":"cavity","installConditions":{"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"}}'::jsonb),
  ('Linea 180 mm — company default', 'course_layout', 1, '{"family":"cladding","layout":"course","orientation":"horizontal","assemblyId":"linea-horizontal","product":{"id":"James Hardie|Linea|180|16","manufacturer":"James Hardie","name":"Linea","widthMm":180,"thicknessMm":16},"spareRate":10,"supplierName":null}'::jsonb, '{"companyDefault":true,"route":"cavity","installConditions":{"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"}}'::jsonb),
  ('Matrix 590 mm — company default', 'panel_grid', 1, '{"family":"cladding","layout":"grid","orientation":"vertical","assemblyId":"matrix-grid","product":{"id":"James Hardie|Matrix|590|8","manufacturer":"James Hardie","name":"Matrix","widthMm":590,"thicknessMm":8},"spareRate":10,"supplierName":null}'::jsonb, '{"companyDefault":true,"route":"cavity","installConditions":{"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"}}'::jsonb),
  ('Matrix 1190 mm — company default', 'panel_grid', 1, '{"family":"cladding","layout":"grid","orientation":"vertical","assemblyId":"matrix-grid","product":{"id":"James Hardie|Matrix|1190|8","manufacturer":"James Hardie","name":"Matrix","widthMm":1190,"thicknessMm":8},"spareRate":10,"supplierName":null}'::jsonb, '{"companyDefault":true,"route":"cavity","installConditions":{"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"}}'::jsonb),
  ('Stria Fine Texture — company default', 'course_layout', 1, '{"family":"cladding","layout":"course","orientation":"vertical","assemblyId":"stria-fine-texture","product":{"id":"James Hardie|Stria Fine Texture|325|14","manufacturer":"James Hardie","name":"Stria Fine Texture","widthMm":325,"thicknessMm":14},"spareRate":10,"supplierName":null}'::jsonb, '{"companyDefault":true,"route":"cavity","installConditions":{"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"}}'::jsonb),
  ('Stria smooth 325 mm — company default', 'course_layout', 1, '{"family":"cladding","layout":"course","orientation":"vertical","assemblyId":"stria-smooth-vertical","product":{"id":"James Hardie|Stria smooth|325|14","manufacturer":"James Hardie","name":"Stria smooth","widthMm":325,"thicknessMm":14},"spareRate":10,"supplierName":null}'::jsonb, '{"companyDefault":true,"route":"cavity","installConditions":{"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"}}'::jsonb),
  ('Stria smooth 405 mm — company default', 'course_layout', 1, '{"family":"cladding","layout":"course","orientation":"vertical","assemblyId":"stria-smooth-vertical","product":{"id":"James Hardie|Stria smooth|405|14","manufacturer":"James Hardie","name":"Stria smooth","widthMm":405,"thicknessMm":14},"spareRate":10,"supplierName":null}'::jsonb, '{"companyDefault":true,"route":"cavity","installConditions":{"wind":"N2","substrate":"Timber frame","on-or-off-stud":"on-stud","fixing-family":"ND nails"}}'::jsonb)
), todo AS (
  SELECT d.* FROM d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.takeoff_material_presets p
    JOIN public.takeoff_material_preset_revisions r ON r.preset_id = p.id AND r.revision = p.current_revision
    WHERE p.is_active AND r.rules->>'companyDefault' = 'true' AND r.spec->'product'->>'id' = d.spec->'product'->>'id')
), ins AS (
  INSERT INTO public.takeoff_material_presets (name, current_revision, is_active)
  SELECT name, 1, true FROM todo
  RETURNING id, name
)
INSERT INTO public.takeoff_material_preset_revisions (preset_id, revision, name, method_key, method_version, spec, rules, profile, source_review)
SELECT ins.id, 1, todo.name, todo.method_key, todo.method_version, todo.spec, todo.rules, NULL,
       '{"status":"user_entered","title":"Blue Leaf company default (Hub review HUB 014)"}'::jsonb
FROM ins JOIN todo ON todo.name = ins.name;
