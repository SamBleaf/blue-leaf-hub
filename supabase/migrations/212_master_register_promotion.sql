-- 212_master_register_promotion.sql — Master Register R02 · Increment 2 (promote-once)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- The Master Register (Tab 18 / R02) is captured room-by-room in the pre-job scratchpad
-- `leads.selections_schedule` (migration 188). This migration adds the canonical project-keyed
-- landing zone so the register can be PROMOTED ONCE into the project at the preconstruction-portal
-- moment and again (idempotently) at Won — WITHOUT re-typing and WITHOUT surfacing anything to the
-- client until the office deliberately issues it.
--
-- Two destinations, keyed by the register's own scope-vs-selection axis (see src/lib/register.js
-- isClientSelection):
--   • genuine product/finish CHOICES  → existing `client_selections` (mig 103), STAGED:
--       client_visible = false  (invisible to the client until the office issues it),
--       and NO `client_actions` row is created by promotion (no auto-invite, no notification).
--   • everything else — work/scope records (demolish / retain / make good / by others / excluded /
--     N-A / undecided) → the NEW, internal-only `room_scope_items` table. These must NEVER reach
--     `client_selections` (that store is client-facing). This is the load-bearing data guard.
--
-- Idempotency key: the register item's stable id (`ri_…`) in `source_register_item_id`. Promotion
-- upserts ON CONFLICT DO NOTHING, so re-running never duplicates and never clobbers an office edit.
--
-- SAFETY / IDEMPOTENCY:
--   • Purely ADDITIVE — new nullable columns + one new table. No existing column is altered or dropped.
--   • `client_visible` defaults TRUE, so every pre-existing client_selections row keeps its current
--     (visible) behaviour. Only promotion sets it false.
--   • All CREATE / ADD COLUMN / CREATE INDEX use IF NOT EXISTS → safe to re-paste.
--   • Fully REVERSIBLE — see the ROLLBACK block at the foot of this file.
--
-- DEPLOY ORDER (important): the client Selections board read (portalV2Routes.mjs) is being changed in
-- the same increment to filter `client_visible = true`. That read TOLERATES a pre-212 DB (it falls
-- back to showing all rows on undefined_column), so code and migration can deploy in either order —
-- but apply THIS migration before relying on staged (hidden) promotion in production.
--
-- PREREQUISITE: migration 103 (client_portal_v2 — creates `client_selections`) and 199
-- (`projects.is_preconstruction`). As of this branch 103 is NOT yet verified on the live DB; test on
-- a disposable DB first (scripts/tests/register-migration-212.test.mjs) and apply manually in the
-- Supabase SQL editor only with explicit sign-off.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ─── A. Provenance + staging on the canonical selection store ───────────────────────────────────
ALTER TABLE public.client_selections
  ADD COLUMN IF NOT EXISTS source_register_item_id text,
  ADD COLUMN IF NOT EXISTS source_lead_id           uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promoted_at              timestamptz,
  -- Visibility gate. Pre-existing rows (all client-created) default TRUE → unchanged behaviour.
  -- Promotion inserts rows as FALSE (staged); the office flips it TRUE to issue to the client.
  ADD COLUMN IF NOT EXISTS client_visible           boolean NOT NULL DEFAULT true;

-- Idempotency arbiter for promotion. NULLs are distinct in a Postgres unique index, so the many
-- client-created rows (source_register_item_id IS NULL) never collide; only promoted rows (one per
-- register item per project) are de-duplicated. Serves as the ON CONFLICT target.
CREATE UNIQUE INDEX IF NOT EXISTS client_selections_register_item_uq
  ON public.client_selections (project_id, source_register_item_id);

CREATE INDEX IF NOT EXISTS idx_csel_source_lead ON public.client_selections (source_lead_id);


-- ─── B. Internal-only room scope / works register ───────────────────────────────────────────────
-- The non-selection half of the Master Register. INTERNAL: the client portal never reads this table.
-- One row per promoted scope/works item (and per selection settled as excluded / by-others / N-A).
CREATE TABLE IF NOT EXISTS public.room_scope_items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_register_item_id text,                                        -- stable ri_ id (idempotency key)
  source_lead_id          uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  room_area               text,                                        -- resolved room label at promotion time
  category                text,                                        -- register category key (scope/structure/…)
  item_kind               text CHECK (item_kind IN ('scope','selection')),
  disposition             text,                                        -- new/alter/retain/remove/make_good/by_others/excluded/na/undecided
  certainty               text,                                        -- carried only for settled-out selections, else null
  responsibility          text,                                        -- client/architect/blue_leaf/trade
  description             text,
  product                 text,
  model                   text,
  colour                  text,
  source_ref              text,                                        -- drawing sheet+rev / supplier doc+version / meeting note
  next_action             text,
  notes                   text,                                        -- internal provenance note
  sort_order              integer DEFAULT 0,
  promoted_at             timestamptz DEFAULT now(),
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rsi_project     ON public.room_scope_items (project_id);
CREATE INDEX IF NOT EXISTS idx_rsi_source_lead ON public.room_scope_items (source_lead_id);
CREATE INDEX IF NOT EXISTS idx_rsi_disposition ON public.room_scope_items (disposition);

CREATE UNIQUE INDEX IF NOT EXISTS room_scope_items_register_item_uq
  ON public.room_scope_items (project_id, source_register_item_id);


-- ─── C. Row Level Security ──────────────────────────────────────────────────────────────────────
-- Mirrors migration 103: all API access is via the service-role key (bypasses RLS); this policy is a
-- safety net for internal authenticated users. room_scope_items is internal — no client policy, and
-- the portal routes never query it.
ALTER TABLE public.room_scope_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_internal" ON public.room_scope_items;
CREATE POLICY "auth_internal" ON public.room_scope_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (reversible — run manually to undo; verified by scripts/tests/register-migration-212.test.mjs)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--   DROP TABLE IF EXISTS public.room_scope_items;          -- also drops its indexes + policy
--   DROP INDEX IF EXISTS public.client_selections_register_item_uq;
--   DROP INDEX IF EXISTS public.idx_csel_source_lead;
--   ALTER TABLE public.client_selections
--     DROP COLUMN IF EXISTS source_register_item_id,
--     DROP COLUMN IF EXISTS source_lead_id,
--     DROP COLUMN IF EXISTS promoted_at,
--     DROP COLUMN IF EXISTS client_visible;
--   NOTIFY pgrst, 'reload schema';
-- ════════════════════════════════════════════════════════════════════════════════════════════════
