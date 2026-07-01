-- 127: CRM/Sales control spine (Batch 1A of docs/plans/CRM_SALES_CONTROL_SYSTEM_BUILD_PLAN.md).
-- Additive only — no existing table altered destructively, no data moved. Adds:
--   (a) fit classification — two axes, human-set only in this batch (no AI mutation)
--   (b) a driven next-action queue (action_type + action_due_at + snoozed_until)
--   (c) mandatory lead_source_category (every lead must have one going forward)
--   (d) lead_signals — structured objections/fears/priorities (rail UI is a later batch)
-- Explicitly OUT of scope here: lead_touch_events, fee_proposals.lead_id, ROI views — see plan §9.

-- ── (a) Fit classification — two axes ────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS fit_quality text
    CHECK (fit_quality IN ('strong','possible','nurture','poor','price_shopper')),
  ADD COLUMN IF NOT EXISTS readiness text
    CHECK (readiness IN ('early_research','not_ready_yet','ready_for_consult')),
  ADD COLUMN IF NOT EXISTS fit_set_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS fit_set_at timestamptz;

-- ── (b) Driven action queue ───────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS action_type text
    CHECK (action_type IN (
      'response_due','no_reply_follow_up','plans_requested','plans_received',
      'proposal_follow_up','nurture_check_in','lost_review','reactivation'
    )),
  ADD COLUMN IF NOT EXISTS action_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

-- ── (c) Mandatory source category (nullable at the DB layer — enforced at the API
--        layer on create so existing historic rows aren't broken by a NOT NULL) ──
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lead_source_category text
    CHECK (lead_source_category IN (
      'website','referral','repeat','social','search','advertising','walk_in','other'
    ));

CREATE INDEX IF NOT EXISTS idx_leads_fit_quality      ON leads(fit_quality)      WHERE fit_quality IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_readiness        ON leads(readiness)        WHERE readiness IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_action_due_at    ON leads(action_due_at)    WHERE action_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_source_category  ON leads(lead_source_category);

-- ── (d) Structured trust signals (table, not jsonb — aggregatable across pipeline) ─
CREATE TABLE IF NOT EXISTS lead_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('objection','fear','priority')),
  label       text NOT NULL,
  detail      text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed')),
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_signals_lead ON lead_signals(lead_id);

ALTER TABLE lead_signals ENABLE ROW LEVEL SECURITY;
-- Service role (server API) bypasses RLS; access gated at the route layer like other lead tables.

NOTIFY pgrst, 'reload schema';
