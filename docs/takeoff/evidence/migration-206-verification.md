# Migration 206 verification (isolated Postgres)

- Database: PostgreSQL 17.10 (Homebrew) on aarch64-apple-darwin24.6.0, compiled by Apple clang version 17.0.0 (clang-1700.6.4.2), 64-bit
- Migration file: `supabase/migrations/206_takeoff_foundation.sql` sha256 `b1dd6938446346dc87dba23f081063c88536cda5b8e4b2356fe704c489ae3254`
- Applied to a fresh database with the Supabase-shaped base stub (`scripts/tests/fixtures/takeoff-db-stub.sql`): **PASS**
- Re-applied on top of itself (idempotency): **PASS**
- Tables: 14; RLS on with no client policies and no anon/authenticated privileges: **PASS**
- Functions: 16; SECURITY INVOKER, pinned search_path, EXECUTE only for service_role: **PASS**
- Client-role access probes: **PASS (all denied)**
- Generated: 2026-10-13T13:32:05.892Z in 0.1 s

> This is an isolated database. Migration 206 has NOT been applied to production — see the read-only live probe.

## Tables

| table | RLS | policies | anon SELECT | authenticated SELECT | authenticated INSERT | service_role SELECT |
|---|---|---|---|---|---|---|
| takeoff_calibrations | yes | 0 | no | no | no | yes |
| takeoff_contributions | yes | 0 | no | no | no | yes |
| takeoff_exports | yes | 0 | no | no | no | yes |
| takeoff_idempotency | yes | 0 | no | no | no | yes |
| takeoff_job_materials | yes | 0 | no | no | no | yes |
| takeoff_material_preset_revisions | yes | 0 | no | no | no | yes |
| takeoff_material_presets | yes | 0 | no | no | no | yes |
| takeoff_material_rule_history | yes | 0 | no | no | no | yes |
| takeoff_measurements | yes | 0 | no | no | no | yes |
| takeoff_order_lines | yes | 0 | no | no | no | yes |
| takeoff_orders | yes | 0 | no | no | no | yes |
| takeoff_placement_allocations | yes | 0 | no | no | no | yes |
| takeoff_placements | yes | 0 | no | no | no | yes |
| takeoff_workspaces | yes | 0 | no | no | no | yes |

## Functions

| function | security definer | config | PUBLIC exec | anon exec | authenticated exec | service_role exec |
|---|---|---|---|---|---|---|
| takeoff_archive_if_referenced(p_doc_id uuid, p_user_id uuid) | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_block_mutation() | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_cancel_placement(p_placement_id uuid, p_reason text, p_user_id uuid) | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_commit(p_workspace_id uuid, p_expected_revision integer, p_changes jsonb, p_actor jsonb, p_idempotency_key text) | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_create_export(p_order_id uuid, p_expected_order_revision integer, p_expected_workspace_revision integer, p_supplier_updated_at timestamp with time zone, p_is_draft boolean, p_snapshot jsonb, p_snapshot_sha256 text, p_calculation_version text, p_profile_schema_version integer, p_actor jsonb, p_idempotency_key text, p_company_updated_at timestamp with time zone) | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_doc_in_scope(p_ws takeoff_workspaces, p_doc_id uuid) | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_document_referenced(p_doc_id uuid) | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_export_guard() | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_idem_get(p_scope uuid, p_key text, p_op text) | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_job_document_identity_guard() | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_next_order_ref() | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_place_order(p_order_id uuid, p_export_id uuid, p_expected_workspace_revision integer, p_requirements jsonb, p_allocations jsonb, p_supplier_reference text, p_placed_on date, p_surplus_acknowledged boolean, p_user_id uuid, p_idempotency_key text) | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_placement_guard() | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_plan_insert(p_row jsonb, p_supersedes uuid) | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_save_order(p_order_id uuid, p_expected_revision integer, p_fields jsonb, p_lines jsonb) | no | search_path=public, pg_temp | no | no | no | yes |
| takeoff_save_preset(p_preset_id uuid, p_expected_revision integer, p_content jsonb, p_user_id uuid, p_active boolean) | no | search_path=public, pg_temp | no | no | no | yes |

## Triggers

| table | trigger | events | timing |
|---|---|---|---|
| job_documents | takeoff_job_document_identity | UPDATE | BEFORE |
| takeoff_calibrations | takeoff_cal_immutable | DELETE/UPDATE | BEFORE |
| takeoff_contributions | takeoff_contrib_nodelete | DELETE | BEFORE |
| takeoff_exports | takeoff_export_guard | DELETE/UPDATE | BEFORE |
| takeoff_idempotency | takeoff_idem_immutable | UPDATE | BEFORE |
| takeoff_material_preset_revisions | takeoff_presetrev_immutable | DELETE/UPDATE | BEFORE |
| takeoff_material_rule_history | takeoff_rule_hist_immutable | DELETE/UPDATE | BEFORE |
| takeoff_measurements | takeoff_meas_nodelete | DELETE | BEFORE |
| takeoff_orders | takeoff_orders_nodelete | DELETE | BEFORE |
| takeoff_placement_allocations | takeoff_alloc_immutable | DELETE/UPDATE | BEFORE |
| takeoff_placements | takeoff_placement_guard | DELETE/UPDATE | BEFORE |
| takeoff_workspaces | takeoff_ws_nodelete | DELETE | BEFORE |

## CHECK constraints (takeoff_*)

- takeoff_calibrations.takeoff_calibrations_basis_rotation_check: `CHECK ((basis_rotation = ANY (ARRAY[0, 90, 180, 270])))`
- takeoff_calibrations.takeoff_calibrations_created_by_type_check: `CHECK ((created_by_type = ANY (ARRAY['staff'::text, 'employee'::text])))`
- takeoff_calibrations.takeoff_calibrations_mode_check: `CHECK ((mode = ANY (ARRAY['uniform'::text, 'separate'::text])))`
- takeoff_calibrations.takeoff_calibrations_page_index_check: `CHECK ((page_index >= 0))`
- takeoff_calibrations.takeoff_calibrations_status_check: `CHECK ((status = ANY (ARRAY['ready'::text, 'needs_review'::text, 'unverified'::text])))`
- takeoff_calibrations.takeoff_calibrations_sx_check: `CHECK ((sx > (0)::double precision))`
- takeoff_calibrations.takeoff_calibrations_sy_check: `CHECK ((sy > (0)::double precision))`
- takeoff_contributions.takeoff_contributions_role_check: `CHECK ((role = 'primary'::text))`
- takeoff_exports.takeoff_export_ready_has_pdf: `CHECK (((artifact_status <> 'ready'::text) OR ((pdf_document_id IS NOT NULL) AND (pdf_sha256 IS NOT NULL))))`
- takeoff_exports.takeoff_exports_artifact_status_check: `CHECK ((artifact_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text])))`
- takeoff_exports.takeoff_exports_created_by_type_check: `CHECK ((created_by_type = ANY (ARRAY['staff'::text, 'employee'::text])))`
- takeoff_idempotency.takeoff_idempotency_key_check: `CHECK (((char_length(key) >= 8) AND (char_length(key) <= 120)))`
- takeoff_job_materials.takeoff_job_materials_name_check: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)))`
- takeoff_material_presets.takeoff_material_presets_name_check: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)))`
- takeoff_material_rule_history.takeoff_material_rule_history_changed_by_type_check: `CHECK ((changed_by_type = ANY (ARRAY['staff'::text, 'employee'::text])))`
- takeoff_measurements.takeoff_meas_count_len: `CHECK (((kind = 'run'::text) OR (finished_length_mm > (0)::double precision)))`
- takeoff_measurements.takeoff_meas_manual_no_cal: `CHECK (((kind <> 'manual'::text) OR ((calibration_id IS NULL) AND (geometry IS NULL))))`
- takeoff_measurements.takeoff_meas_manual_qty: `CHECK (((kind <> 'manual'::text) OR (quantity IS NOT NULL)))`
- takeoff_measurements.takeoff_meas_run_has_cal: `CHECK (((kind <> 'run'::text) OR ((calibration_id IS NOT NULL) AND (document_id IS NOT NULL))))`
- takeoff_measurements.takeoff_measurements_created_by_type_check: `CHECK ((created_by_type = ANY (ARRAY['staff'::text, 'employee'::text])))`
- takeoff_measurements.takeoff_measurements_kind_check: `CHECK ((kind = ANY (ARRAY['run'::text, 'count'::text, 'manual'::text])))`
- takeoff_measurements.takeoff_measurements_page_index_check: `CHECK (((page_index IS NULL) OR (page_index >= 0)))`
- takeoff_measurements.takeoff_measurements_quantity_check: `CHECK (((quantity IS NULL) OR (quantity >= 1)))`
- takeoff_order_lines.takeoff_order_lines_finished_length_mm_check: `CHECK ((finished_length_mm > (0)::double precision))`
- takeoff_order_lines.takeoff_order_lines_quantity_check: `CHECK ((quantity >= 1))`
- takeoff_orders.takeoff_orders_created_by_type_check: `CHECK ((created_by_type = ANY (ARRAY['staff'::text, 'employee'::text])))`
- takeoff_orders.takeoff_orders_status_check: `CHECK ((status = ANY (ARRAY['draft'::text, 'placed'::text, 'cancelled'::text])))`
- takeoff_placement_allocations.takeoff_placement_allocations_quantity_check: `CHECK ((quantity >= 1))`
- takeoff_placements.takeoff_placements_status_check: `CHECK ((status = ANY (ARRAY['placed'::text, 'cancelled'::text])))`
- takeoff_workspaces.takeoff_workspaces_created_by_type_check: `CHECK ((created_by_type = ANY (ARRAY['staff'::text, 'employee'::text])))`
- takeoff_workspaces.takeoff_workspaces_name_check: `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)))`
- takeoff_workspaces.takeoff_workspaces_primary_page_index_check: `CHECK (((primary_page_index IS NULL) OR (primary_page_index >= 0)))`
- takeoff_workspaces.takeoff_workspaces_state_check: `CHECK ((state = ANY (ARRAY['active'::text, 'needs_review'::text, 'archived'::text])))`
- takeoff_workspaces.takeoff_workspaces_updated_by_type_check: `CHECK ((updated_by_type = ANY (ARRAY['staff'::text, 'employee'::text])))`
- takeoff_workspaces.takeoff_ws_one_job: `CHECK ((num_nonnulls(job_id, carpentry_job_id, charge_up_job_id) = 1))`

## job_documents additive columns

- archived_at (timestamp with time zone)
- archived_by (uuid)
- byte_size (bigint)
- content_sha256 (text)
- revision_label (text)

## Storage buckets

- takeoff-exports: public=false

## Client-role access probes

| role | attempt | result |
|---|---|---|
| anon | select takeoff_workspaces | denied ✓ |
| anon | insert takeoff_exports | denied ✓ |
| anon | execute takeoff_commit | denied ✓ |
| anon | execute takeoff_place_order | denied ✓ |
| authenticated | select takeoff_workspaces | denied ✓ |
| authenticated | insert takeoff_exports | denied ✓ |
| authenticated | execute takeoff_commit | denied ✓ |
| authenticated | execute takeoff_place_order | denied ✓ |
