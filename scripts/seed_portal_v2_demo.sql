-- ════════════════════════════════════════════════════════════════════════════
-- Client Portal v2.0 — DEMO SEED (run in Supabase SQL editor AFTER 103 + 103b)
-- ════════════════════════════════════════════════════════════════════════════
-- Lights up ONE real project with a full pre-construction → handover scenario so
-- you can click through every screen. Safe to re-run (idempotent on natural keys).
--
-- HOW TO USE:
--   1. Apply migrations 099→103 + 103b first.
--   2. Pick the project to demo. By default this targets the most recently
--      created portal-enabled project. To force a specific one, replace the
--      sub-select in the DO block's `target_project` line with: 'your-uuid-here'.
--   3. Run this file.
--   4. Invite the client to that project (Settings → invite, role = client) and
--      log in as them at /client-portal to walk the full journey.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  target_project uuid;
  sel_id uuid;
BEGIN
  -- Choose the demo project (most recent portal-enabled, with a linked job).
  SELECT id INTO target_project
  FROM projects
  WHERE portal_enabled = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF target_project IS NULL THEN
    RAISE NOTICE 'No portal-enabled project found. Enable a project portal first, then re-run.';
    RETURN;
  END IF;

  -- Turn on v2 + set an on-site build phase + a team directory.
  UPDATE projects
  SET portal_v2_enabled = true,
      build_phase = 'on_site',
      team_members = '[
        {"name":"Sam Morris","role":"Director","contactPreference":"call"},
        {"name":"Site Supervisor","role":"On-site contact","contactPreference":"call"}
      ]'::jsonb
  WHERE id = target_project;

  -- ── Milestones (Project Journey) ──────────────────────────────────────────
  INSERT INTO portal_milestones (project_id, key, label, sort_order, achieved_at, is_current, confidence, confidence_note, stage_preview, auto_synced)
  VALUES
    (target_project, 'pre_construction', 'Pre-Construction', 0, current_date - 60, false, null, null, null, false),
    (target_project, 'site_slab',        'Slab',             1, current_date - 30, false, null, null, null, false),
    (target_project, 'frame',            'Frame & Roof',     2, null, true, 'watch', 'Roof trusses delayed 5 days due to supplier lead time. No change to the lock-up date expected.', null, false),
    (target_project, 'lock_up',          'Lock-Up',          3, null, false, null, null, 'Roof cladding, windows and external doors are installed and the house becomes weatherproof. Typically 3–4 weeks. A good time to finalise your splashback tile selection.', false),
    (target_project, 'fitout',           'Fit-Out',          4, null, false, null, null, null, false),
    (target_project, 'completion',       'Handover',         5, null, false, null, null, null, false)
  ON CONFLICT (project_id, key) DO UPDATE
    SET is_current = EXCLUDED.is_current, confidence = EXCLUDED.confidence,
        confidence_note = EXCLUDED.confidence_note, stage_preview = EXCLUDED.stage_preview;

  -- ── A weekly update with builder reasoning (how_we_build) ─────────────────
  INSERT INTO portal_updates (project_id, week_of, headline, body, builder_reasoning, schedule_phase, published, status, published_at)
  VALUES (
    target_project, current_date - 3,
    'Frame is 90% complete — roof trusses next week',
    'Wall frames and top plate are done. Trusses are delivered and set, ready to install Monday.',
    'We used a vapour-permeable sarking rather than standard foil — it lets the wall assembly breathe while still blocking air infiltration, which matters for long-term weather-tightness in the Adelaide climate.',
    'frame', true, 'published', now()
  )
  ON CONFLICT DO NOTHING;

  -- ── A selection with options (awaiting client) + its action ───────────────
  INSERT INTO client_selections (project_id, category, item_name, room_area, due_date, lead_time_weeks, order_by_date, allowance_amount, status, sort_order)
  VALUES (target_project, 'Kitchen', 'Splashback Tile', 'Kitchen', current_date + 5, 6, current_date + 3, 850, 'awaiting_client', 0)
  ON CONFLICT DO NOTHING
  RETURNING id INTO sel_id;

  IF sel_id IS NOT NULL THEN
    INSERT INTO selection_options (selection_id, label, product_name, supplier, price_inc_gst, lead_time_weeks, is_recommended, sort_order)
    VALUES
      (sel_id, 'Option A', 'Subway White Gloss', 'Tile Republic', 640, 4, true, 0),
      (sel_id, 'Option B', 'Terracotta Handmade', 'Artisan Tiles', 1240, 8, false, 1);

    INSERT INTO client_actions (project_id, action_type, title, description, related_entity_type, related_entity_id, due_date, priority, status)
    VALUES (target_project, 'selection_decision', 'Select Splashback Tile', 'Kitchen — allowance $850, 2 options', 'client_selection', sel_id, current_date + 5, 'normal', 'pending');
  END IF;

  -- ── An upcoming meeting + its action ──────────────────────────────────────
  WITH m AS (
    INSERT INTO portal_meetings (project_id, title, meeting_type, status, client_visible, scheduled_at, location, agenda)
    VALUES (target_project, 'Site Meeting', 'site', 'scheduled', true, now() + interval '5 days', 'On site', 'Frame inspection, roof schedule, splashback decision')
    RETURNING id
  )
  INSERT INTO client_actions (project_id, action_type, title, description, related_entity_type, related_entity_id, due_date, priority, status)
  SELECT target_project, 'meeting_confirmation', 'Confirm Site Meeting', 'Thursday 9:00am — frame inspection', 'portal_meeting', m.id, current_date + 5, 'normal', 'pending' FROM m;

  -- ── A couple of documents (the smart archive) ─────────────────────────────
  INSERT INTO portal_documents (project_id, folder, title, upload_source, storage_provider, client_visible)
  VALUES
    (target_project, 'contract', 'Building Contract.pdf', 'manual', 'dropbox', true),
    (target_project, 'approved_plans', 'Approved Plans.pdf', 'manual', 'dropbox', true)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seeded portal v2 demo on project %', target_project;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- To also see a VARIATION and a PROGRESS CLAIM in My Actions, raise them from
-- Finance (they auto-sync via the portalIntegration hooks):
--   • Finance → the job → Variations → create → Send to client  (→ My Actions)
--   • Finance → the job → Progress Claims → create → Issue       (→ My Actions)
-- ════════════════════════════════════════════════════════════════════════════
