-- Schedule Manager rebuild: templates, procurement, cost linkage, and richer task fields
-- Run after 013.

CREATE TABLE IF NOT EXISTS public.schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  project_type text DEFAULT 'new_build',
  tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_templates
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all anon schedule_templates" ON public.schedule_templates;
CREATE POLICY "Allow all anon schedule_templates" ON public.schedule_templates FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "schedule_templates_read" ON public.schedule_templates;
CREATE POLICY "schedule_templates_read" ON public.schedule_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "schedule_templates_insert" ON public.schedule_templates;
CREATE POLICY "schedule_templates_insert" ON public.schedule_templates FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "schedule_templates_update" ON public.schedule_templates;
CREATE POLICY "schedule_templates_update" ON public.schedule_templates FOR UPDATE TO authenticated USING (created_by = auth.uid() AND is_system = false) WITH CHECK (created_by = auth.uid() AND is_system = false);
DROP POLICY IF EXISTS "schedule_templates_delete" ON public.schedule_templates;
CREATE POLICY "schedule_templates_delete" ON public.schedule_templates FOR DELETE TO authenticated USING (created_by = auth.uid() AND is_system = false);

CREATE INDEX IF NOT EXISTS schedule_templates_project_type_idx ON public.schedule_templates (project_type);
CREATE UNIQUE INDEX IF NOT EXISTS schedule_templates_default_project_type_idx
  ON public.schedule_templates (project_type)
  WHERE is_default IS TRUE;

CREATE OR REPLACE FUNCTION public.update_schedule_templates_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_templates_updated_at ON public.schedule_templates;
CREATE TRIGGER trg_schedule_templates_updated_at
  BEFORE UPDATE ON public.schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_schedule_templates_updated_at();

ALTER TABLE public.schedule_tasks
  ADD COLUMN IF NOT EXISTS task_type text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS percent_complete integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS procurement_item text,
  ADD COLUMN IF NOT EXISTS procurement_supplier text,
  ADD COLUMN IF NOT EXISTS procurement_lead_days integer,
  ADD COLUMN IF NOT EXISTS procurement_order_by date,
  ADD COLUMN IF NOT EXISTS procurement_order_status text DEFAULT 'not_ordered',
  ADD COLUMN IF NOT EXISTS buildexact_line_item_id text,
  ADD COLUMN IF NOT EXISTS buildexact_match jsonb,
  ADD COLUMN IF NOT EXISTS planned_cost numeric,
  ADD COLUMN IF NOT EXISTS planned_hours numeric,
  ADD COLUMN IF NOT EXISTS assignee_trade text,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS float_days integer,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.schedule_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS schedule_tasks_template_id_idx ON public.schedule_tasks (template_id);
CREATE INDEX IF NOT EXISTS schedule_tasks_task_type_idx ON public.schedule_tasks (project_id, task_type);
CREATE INDEX IF NOT EXISTS schedule_tasks_procurement_order_by_idx ON public.schedule_tasks (project_id, procurement_order_by);
CREATE INDEX IF NOT EXISTS schedule_tasks_buildexact_line_item_idx
  ON public.schedule_tasks (buildexact_line_item_id)
  WHERE buildexact_line_item_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedule_tasks_task_type_check'
  ) THEN
    ALTER TABLE public.schedule_tasks
      ADD CONSTRAINT schedule_tasks_task_type_check
      CHECK (task_type IN ('standard', 'milestone', 'procurement'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedule_tasks_procurement_order_status_check'
  ) THEN
    ALTER TABLE public.schedule_tasks
      ADD CONSTRAINT schedule_tasks_procurement_order_status_check
      CHECK (procurement_order_status IN ('not_ordered', 'ordered', 'delivered'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedule_tasks_priority_check'
  ) THEN
    ALTER TABLE public.schedule_tasks
      ADD CONSTRAINT schedule_tasks_priority_check
      CHECK (priority IN ('low', 'medium', 'high', 'critical'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedule_tasks_percent_complete_check'
  ) THEN
    ALTER TABLE public.schedule_tasks
      ADD CONSTRAINT schedule_tasks_percent_complete_check
      CHECK (percent_complete >= 0 AND percent_complete <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedule_templates_project_type_check'
  ) THEN
    ALTER TABLE public.schedule_templates
      ADD CONSTRAINT schedule_templates_project_type_check
      CHECK (project_type IN ('new_build', 'renovation', 'extension', 'generic', 'custom'));
  END IF;
END $$;

COMMENT ON TABLE public.schedule_templates IS 'Reusable construction schedule templates stored as task offsets from project start.';
COMMENT ON COLUMN public.schedule_templates.tasks IS 'JSONB array of template task definitions with offset_from_project_start instead of absolute dates.';
COMMENT ON COLUMN public.schedule_tasks.task_type IS 'standard | milestone | procurement.';
COMMENT ON COLUMN public.schedule_tasks.percent_complete IS 'Manual progress value, 0-100.';
COMMENT ON COLUMN public.schedule_tasks.procurement_order_by IS 'Order-by date for procurement tasks; mirrors order_by_date where useful.';
COMMENT ON COLUMN public.schedule_tasks.buildexact_line_item_id IS 'External Buildexact/estimate line item reference or generated match id.';
COMMENT ON COLUMN public.schedule_tasks.buildexact_match IS 'Matched Buildexact estimate metadata displayed in the schedule UI.';

INSERT INTO public.schedule_templates (name, description, project_type, is_default, is_system, tasks)
VALUES (
  'Blue Leaf — Standard New Build',
  'Default residential new build sequence with procurement lead times and dependencies.',
  'new_build',
  true,
  true,
  '[
    {"id":"contract_execution","phase":"pre_construction","name":"Contract execution","task_type":"milestone","duration_days":0,"offset_from_project_start":0,"depends_on":[],"planned_hours":0,"procurement":null,"assignee_trade":"admin","priority":"high"},
    {"id":"certifier_engagement","phase":"pre_construction","name":"Council / certifier engagement","task_type":"standard","duration_days":3,"offset_from_project_start":1,"depends_on":["contract_execution"],"planned_hours":8,"procurement":null,"assignee_trade":"admin","priority":"high"},
    {"id":"engineering_drawings","phase":"pre_construction","name":"Engineering drawings finalised","task_type":"standard","duration_days":5,"offset_from_project_start":4,"depends_on":["certifier_engagement"],"planned_hours":16,"procurement":null,"assignee_trade":"engineering","priority":"high"},
    {"id":"colour_selections","phase":"pre_construction","name":"Colour selections","task_type":"standard","duration_days":5,"offset_from_project_start":4,"depends_on":["contract_execution"],"planned_hours":10,"procurement":null,"assignee_trade":"selections","priority":"medium"},
    {"id":"site_establishment","phase":"pre_construction","name":"Site establishment / temporary fencing","task_type":"procurement","duration_days":1,"offset_from_project_start":20,"depends_on":["engineering_drawings"],"planned_hours":4,"procurement":{"item":"Temporary fencing","supplier":"","lead_days":3,"order_status":"not_ordered"},"assignee_trade":"site_prep","priority":"high"},
    {"id":"demolition","phase":"site_slab","name":"Demolition if applicable","task_type":"standard","duration_days":2,"offset_from_project_start":21,"depends_on":["site_establishment"],"planned_hours":16,"procurement":null,"assignee_trade":"demolition","priority":"medium"},
    {"id":"termite_pretreatment","phase":"site_slab","name":"Termite pre-treatment","task_type":"procurement","duration_days":1,"offset_from_project_start":24,"depends_on":["demolition"],"planned_hours":4,"procurement":{"item":"Termite treatment","supplier":"","lead_days":5,"order_status":"not_ordered"},"assignee_trade":"pest_control","priority":"high"},
    {"id":"excavation","phase":"site_slab","name":"Excavation","task_type":"standard","duration_days":3,"offset_from_project_start":25,"depends_on":["termite_pretreatment"],"planned_hours":24,"procurement":null,"assignee_trade":"earthworks","priority":"high"},
    {"id":"footings_formwork","phase":"site_slab","name":"Footings / formwork","task_type":"standard","duration_days":4,"offset_from_project_start":28,"depends_on":["excavation"],"planned_hours":32,"procurement":null,"assignee_trade":"concreting","priority":"high"},
    {"id":"steel_reinforcement","phase":"site_slab","name":"Steel reinforcement","task_type":"procurement","duration_days":2,"offset_from_project_start":32,"depends_on":["footings_formwork"],"planned_hours":16,"procurement":{"item":"Slab reinforcement steel","supplier":"","lead_days":7,"order_status":"not_ordered"},"assignee_trade":"concreting","priority":"high"},
    {"id":"slab_pour","phase":"site_slab","name":"Concrete pour - slab","task_type":"standard","duration_days":1,"offset_from_project_start":34,"depends_on":["steel_reinforcement"],"planned_hours":16,"procurement":null,"assignee_trade":"concreting","priority":"critical"},
    {"id":"slab_cure","phase":"site_slab","name":"Slab cure","task_type":"standard","duration_days":7,"offset_from_project_start":35,"depends_on":["slab_pour"],"planned_hours":0,"procurement":null,"assignee_trade":"concreting","priority":"high"},
    {"id":"framing_materials","phase":"frame","name":"Framing materials order","task_type":"procurement","duration_days":0,"offset_from_project_start":39,"depends_on":["slab_cure"],"planned_hours":2,"procurement":{"item":"Framing materials","supplier":"","lead_days":10,"order_status":"not_ordered"},"assignee_trade":"carpentry","priority":"high"},
    {"id":"wall_framing","phase":"frame","name":"Wall framing","task_type":"standard","duration_days":7,"offset_from_project_start":42,"depends_on":["slab_cure","framing_materials"],"planned_hours":80,"procurement":null,"assignee_trade":"carpentry","priority":"critical"},
    {"id":"roof_framing","phase":"frame","name":"Roof framing","task_type":"standard","duration_days":5,"offset_from_project_start":49,"depends_on":["wall_framing"],"planned_hours":56,"procurement":null,"assignee_trade":"carpentry","priority":"critical"},
    {"id":"roof_sarking","phase":"frame","name":"Roof sarking","task_type":"standard","duration_days":2,"offset_from_project_start":54,"depends_on":["roof_framing"],"planned_hours":16,"procurement":null,"assignee_trade":"roofing","priority":"high"},
    {"id":"frame_inspection","phase":"frame","name":"Frame inspection - certifier","task_type":"milestone","duration_days":0,"offset_from_project_start":56,"depends_on":["roof_sarking"],"planned_hours":2,"procurement":null,"assignee_trade":"certifier","priority":"critical"},
    {"id":"roof_cladding","phase":"lock_up","name":"Roof cladding / metal roofing","task_type":"procurement","duration_days":5,"offset_from_project_start":57,"depends_on":["frame_inspection"],"planned_hours":48,"procurement":{"item":"Roof cladding","supplier":"","lead_days":14,"order_status":"not_ordered"},"assignee_trade":"roofing","priority":"critical"},
    {"id":"windows_doors_supply","phase":"lock_up","name":"Windows and doors supply","task_type":"procurement","duration_days":0,"offset_from_project_start":57,"depends_on":["frame_inspection"],"planned_hours":2,"procurement":{"item":"Windows and doors","supplier":"","lead_days":21,"order_status":"not_ordered"},"assignee_trade":"windows","priority":"critical"},
    {"id":"windows_doors_install","phase":"lock_up","name":"Windows and doors install","task_type":"standard","duration_days":3,"offset_from_project_start":64,"depends_on":["windows_doors_supply","roof_cladding"],"planned_hours":24,"procurement":null,"assignee_trade":"windows","priority":"critical"},
    {"id":"external_cladding","phase":"lock_up","name":"External cladding","task_type":"standard","duration_days":5,"offset_from_project_start":67,"depends_on":["windows_doors_install"],"planned_hours":48,"procurement":null,"assignee_trade":"cladding","priority":"high"},
    {"id":"lock_up_milestone","phase":"lock_up","name":"Lock-up milestone","task_type":"milestone","duration_days":0,"offset_from_project_start":72,"depends_on":["external_cladding"],"planned_hours":0,"procurement":null,"assignee_trade":"supervision","priority":"critical"},
    {"id":"rough_plumbing","phase":"rough_in","name":"Rough plumbing","task_type":"standard","duration_days":5,"offset_from_project_start":73,"depends_on":["lock_up_milestone"],"planned_hours":40,"procurement":null,"assignee_trade":"plumbing","priority":"high"},
    {"id":"rough_electrical","phase":"rough_in","name":"Rough electrical","task_type":"standard","duration_days":5,"offset_from_project_start":73,"depends_on":["lock_up_milestone"],"planned_hours":40,"procurement":null,"assignee_trade":"electrical","priority":"high"},
    {"id":"solar_rough_in","phase":"rough_in","name":"Solar rough-in","task_type":"standard","duration_days":2,"offset_from_project_start":74,"depends_on":["lock_up_milestone"],"planned_hours":16,"procurement":null,"assignee_trade":"solar","priority":"medium"},
    {"id":"insulation","phase":"rough_in","name":"Insulation","task_type":"standard","duration_days":3,"offset_from_project_start":79,"depends_on":["rough_plumbing","rough_electrical"],"planned_hours":24,"procurement":null,"assignee_trade":"insulation","priority":"high"},
    {"id":"plaster_linings","phase":"rough_in","name":"Plaster / internal linings","task_type":"standard","duration_days":7,"offset_from_project_start":82,"depends_on":["insulation"],"planned_hours":64,"procurement":null,"assignee_trade":"plastering","priority":"high"},
    {"id":"joinery_install","phase":"fitout","name":"Joinery install (kitchen, robes)","task_type":"procurement","duration_days":7,"offset_from_project_start":89,"depends_on":["plaster_linings"],"planned_hours":56,"procurement":{"item":"Joinery","supplier":"","lead_days":28,"order_status":"not_ordered"},"assignee_trade":"joinery","priority":"critical"},
    {"id":"tiling","phase":"fitout","name":"Tiling","task_type":"standard","duration_days":5,"offset_from_project_start":96,"depends_on":["plaster_linings"],"planned_hours":40,"procurement":null,"assignee_trade":"tiling","priority":"high"},
    {"id":"internal_painting","phase":"fitout","name":"Painting - internal","task_type":"standard","duration_days":7,"offset_from_project_start":101,"depends_on":["tiling"],"planned_hours":64,"procurement":null,"assignee_trade":"painting","priority":"high"},
    {"id":"second_fix_plumbing","phase":"fitout","name":"Second fix plumbing","task_type":"standard","duration_days":3,"offset_from_project_start":108,"depends_on":["internal_painting"],"planned_hours":24,"procurement":null,"assignee_trade":"plumbing","priority":"high"},
    {"id":"second_fix_electrical","phase":"fitout","name":"Second fix electrical","task_type":"standard","duration_days":3,"offset_from_project_start":108,"depends_on":["internal_painting"],"planned_hours":24,"procurement":null,"assignee_trade":"electrical","priority":"high"},
    {"id":"floor_coverings","phase":"fitout","name":"Floor coverings","task_type":"procurement","duration_days":3,"offset_from_project_start":111,"depends_on":["second_fix_plumbing","second_fix_electrical"],"planned_hours":24,"procurement":{"item":"Floor coverings","supplier":"","lead_days":14,"order_status":"not_ordered"},"assignee_trade":"flooring","priority":"high"},
    {"id":"stairs","phase":"fitout","name":"Stairs if applicable","task_type":"standard","duration_days":3,"offset_from_project_start":111,"depends_on":["internal_painting"],"planned_hours":24,"procurement":null,"assignee_trade":"carpentry","priority":"medium"},
    {"id":"pc_inspection","phase":"completion","name":"Practical completion inspection","task_type":"standard","duration_days":1,"offset_from_project_start":116,"depends_on":["floor_coverings","stairs"],"planned_hours":4,"procurement":null,"assignee_trade":"supervision","priority":"critical"},
    {"id":"defects_list","phase":"completion","name":"Defects list","task_type":"standard","duration_days":3,"offset_from_project_start":117,"depends_on":["pc_inspection"],"planned_hours":24,"procurement":null,"assignee_trade":"supervision","priority":"high"},
    {"id":"handover","phase":"completion","name":"Handover","task_type":"milestone","duration_days":0,"offset_from_project_start":120,"depends_on":["defects_list"],"planned_hours":2,"procurement":null,"assignee_trade":"supervision","priority":"critical"},
    {"id":"final_inspection","phase":"post_construction","name":"Final inspection / occupancy certificate","task_type":"standard","duration_days":3,"offset_from_project_start":121,"depends_on":["handover"],"planned_hours":6,"procurement":null,"assignee_trade":"certifier","priority":"high"},
    {"id":"retention_start","phase":"post_construction","name":"Retention period start","task_type":"milestone","duration_days":0,"offset_from_project_start":124,"depends_on":["final_inspection"],"planned_hours":0,"procurement":null,"assignee_trade":"admin","priority":"medium"}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO public.schedule_templates (name, description, project_type, is_default, is_system, tasks)
VALUES (
  'Blue Leaf — Renovation / Extension',
  'Residential renovation or extension sequence from pre-construction and strip-out through handover. Remove phases that do not apply to the scope.',
  'renovation',
  true,
  true,
  '[
    {"temp_id":"r001","phase":"Pre-construction","name":"Contract execution","task_type":"milestone","duration_days":0,"offset_from_project_start":0,"depends_on":[],"planned_hours":null,"planned_cost":null,"assignee_trade":null,"priority":"critical","procurement":null,"notes":null},
    {"temp_id":"r002","phase":"Pre-construction","name":"Council / certifier engagement","task_type":"standard","duration_days":3,"offset_from_project_start":1,"depends_on":["r001"],"planned_hours":3,"planned_cost":null,"assignee_trade":null,"priority":"high","procurement":null,"notes":"CDC or DA depending on scope and council."},
    {"temp_id":"r003","phase":"Pre-construction","name":"Client selections locked","task_type":"milestone","duration_days":0,"offset_from_project_start":5,"depends_on":["r001"],"planned_hours":null,"planned_cost":null,"assignee_trade":null,"priority":"high","procurement":null,"notes":"Tiles, fixtures, flooring, joinery colours confirmed before ordering."},
    {"temp_id":"r004","phase":"Strip-out","name":"Asbestos check / hazmat survey","task_type":"standard","duration_days":1,"offset_from_project_start":10,"depends_on":["r002"],"planned_hours":4,"planned_cost":null,"assignee_trade":null,"priority":"critical","procurement":null,"notes":"Required on any pre-1990 structure before demolition or strip-out."},
    {"temp_id":"r005","phase":"Strip-out","name":"Demolition / strip-out","task_type":"standard","duration_days":3,"offset_from_project_start":11,"depends_on":["r004"],"planned_hours":24,"planned_cost":null,"assignee_trade":"demolition","priority":"high","procurement":null,"notes":null},
    {"temp_id":"r006","phase":"Structure","name":"Structural work / new framing","task_type":"standard","duration_days":7,"offset_from_project_start":14,"depends_on":["r005"],"planned_hours":56,"planned_cost":null,"assignee_trade":"framing","priority":"high","procurement":null,"notes":"New walls, beams, openings. Adjust duration to scope."},
    {"temp_id":"r007","phase":"Structure","name":"Roofing repairs / extension roof","task_type":"standard","duration_days":3,"offset_from_project_start":21,"depends_on":["r006"],"planned_hours":24,"planned_cost":null,"assignee_trade":"metal roofing","priority":"high","procurement":null,"notes":null},
    {"temp_id":"r008","phase":"Rough-in","name":"Rough-in plumbing","task_type":"standard","duration_days":3,"offset_from_project_start":24,"depends_on":["r006"],"planned_hours":24,"planned_cost":null,"assignee_trade":"plumbing","priority":"high","procurement":null,"notes":null},
    {"temp_id":"r009","phase":"Rough-in","name":"Rough-in electrical","task_type":"standard","duration_days":3,"offset_from_project_start":24,"depends_on":["r006"],"planned_hours":24,"planned_cost":null,"assignee_trade":"electrical","priority":"high","procurement":null,"notes":"Concurrent with plumbing."},
    {"temp_id":"r010","phase":"Rough-in","name":"Insulation","task_type":"standard","duration_days":2,"offset_from_project_start":27,"depends_on":["r008","r009"],"planned_hours":10,"planned_cost":null,"assignee_trade":"insulation","priority":"medium","procurement":null,"notes":null},
    {"temp_id":"r011","phase":"Rough-in","name":"Plasterboard / linings","task_type":"standard","duration_days":5,"offset_from_project_start":29,"depends_on":["r010"],"planned_hours":40,"planned_cost":null,"assignee_trade":"internal linings","priority":"high","procurement":null,"notes":null},
    {"temp_id":"r012","phase":"Fit-out","name":"Tiling","task_type":"standard","duration_days":4,"offset_from_project_start":34,"depends_on":["r011"],"planned_hours":32,"planned_cost":null,"assignee_trade":"tiling","priority":"high","procurement":null,"notes":null},
    {"temp_id":"r013","phase":"Fit-out","name":"Painting","task_type":"standard","duration_days":5,"offset_from_project_start":34,"depends_on":["r011"],"planned_hours":40,"planned_cost":null,"assignee_trade":"painting","priority":"high","procurement":null,"notes":"Concurrent with tiling."},
    {"temp_id":"r014","phase":"Fit-out","name":"Joinery install","task_type":"standard","duration_days":5,"offset_from_project_start":39,"depends_on":["r012","r013"],"planned_hours":40,"planned_cost":null,"assignee_trade":"joinery","priority":"high","procurement":null,"notes":null},
    {"temp_id":"r015","phase":"Fit-out","name":"Second fix — plumbing and electrical","task_type":"standard","duration_days":3,"offset_from_project_start":44,"depends_on":["r014"],"planned_hours":24,"planned_cost":null,"assignee_trade":null,"priority":"high","procurement":null,"notes":null},
    {"temp_id":"r016","phase":"Fit-out","name":"Floor coverings","task_type":"standard","duration_days":2,"offset_from_project_start":47,"depends_on":["r015"],"planned_hours":16,"planned_cost":null,"assignee_trade":"flooring","priority":"high","procurement":null,"notes":null},
    {"temp_id":"r017","phase":"Completion","name":"Practical completion inspection","task_type":"standard","duration_days":1,"offset_from_project_start":50,"depends_on":["r016"],"planned_hours":3,"planned_cost":null,"assignee_trade":null,"priority":"critical","procurement":null,"notes":null},
    {"temp_id":"r018","phase":"Completion","name":"Defects rectification","task_type":"standard","duration_days":3,"offset_from_project_start":51,"depends_on":["r017"],"planned_hours":16,"planned_cost":null,"assignee_trade":null,"priority":"high","procurement":null,"notes":null},
    {"temp_id":"r019","phase":"Completion","name":"Handover","task_type":"milestone","duration_days":0,"offset_from_project_start":54,"depends_on":["r018"],"planned_hours":null,"planned_cost":null,"assignee_trade":null,"priority":"critical","procurement":null,"notes":"Keys to client. Final claim issued."}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW public.v_procurement_dashboard AS
SELECT
  st.id,
  st.project_id,
  st.name AS task_name,
  st.phase,
  st.start_date,
  st.end_date,
  st.procurement_item,
  st.procurement_supplier,
  st.procurement_lead_days,
  st.procurement_order_by,
  st.procurement_order_status,
  (st.procurement_order_by - CURRENT_DATE) AS days_until_order_by,
  CASE
    WHEN st.procurement_order_status = 'delivered' THEN 'delivered'
    WHEN st.procurement_order_status = 'ordered' THEN 'ordered'
    WHEN st.procurement_order_by IS NULL THEN 'no_date'
    WHEN CURRENT_DATE > st.procurement_order_by THEN 'overdue'
    WHEN CURRENT_DATE >= st.procurement_order_by - 7 THEN 'urgent'
    ELSE 'on_track'
  END AS lead_status
FROM public.schedule_tasks st
WHERE st.task_type = 'procurement'
ORDER BY
  CASE
    WHEN st.procurement_order_status IN ('delivered', 'ordered') THEN 1
    ELSE 0
  END,
  st.procurement_order_by ASC NULLS LAST;
