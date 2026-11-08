# Master Register R04 — production migration execution table

Final execution plan for migrations **212, 213, 214, 215, 216**. Read with the preflight
(`PRODUCTION_PREFLIGHT_SQL_EDITOR.sql` — run §0 first) and the gated runbook (`PILOT_SEQUENCE.md`).

**On "current status":** this project applies migrations by pasting the `.sql` into the Supabase SQL Editor,
not via the Supabase CLI, so there is no per-file migration ledger to read. Whether a migration is live is
established by the **schema/data state** the preflight reads — not asserted from the repo. The status column
below is therefore **"to confirm via preflight §0/§8"**, not a claim that they are unapplied. Do not record a
migration as applied or unapplied except from a preflight run against production.

## Execution table

| Order | Migration | Depends on | Data / schema change | Reversible? | Pre-apply validation | Post-apply validation | Current status |
|---|---|---|---|---|---|---|---|
| **1** | **214** `internal_categories_deny_clients` | 104 (`auth_is_staff`), 200 | **No data change.** Adds one RESTRICTIVE `deny_clients` RLS policy to `internal_categories`. Standalone security fix — independent of the register. | Yes — `DROP POLICY IF EXISTS deny_clients ON public.internal_categories;` | Preflight §2b shows exactly one row (`internal_categories`), §0 `has_200=true`, `has_104=true`. | §2b returns **zero** rows; §0 `has_214=true`; `NOTIFY pgrst,'reload schema';`. | **To confirm (§0 `has_214`)** |
| **2** | **212** `master_register_promotion` | 103, 199 | **Additive only.** New table `room_scope_items`; new nullable columns + `client_visible` (default true) on `client_selections`. `IF NOT EXISTS` throughout. | Yes — ROLLBACK block at file foot (⚠ drops the new table/columns = destroys promoted register data). | §0 `has_103=true`, `has_199=true`; apply on staging DB first. | Migration's own VERIFICATION block all true; §0 `has_212=true`. | **To confirm (§0 `has_212`)** |
| **3** | **213** `master_register_r03` | 103, **104**, 188, 199, **212** | **Additive.** Register-owned columns on `client_selections`; `requirement`/`action` kinds + `deny_clients` on `room_scope_items`; `projects.register_meta`; `delivery_model`; issue registry on `lead_documents`; `updated_at` triggers; `register_apply` / `register_issue_document` (SECURITY INVOKER, service-role only). **Fail-closed:** aborts if `auth_is_staff` (104) absent. | Yes — ROLLBACK block (run **before** 212's). ⚠ destructive to register data. | §0 `has_104=true` (else 213 aborts by design); §6 returns **zero** `document_type` rows (else 213 aborts naming the offender); apply AFTER 212 (ON CONFLICT targets 212's indexes). | Migration VERIFICATION all true; §0 `has_213=true`; §2a all six tables carry `deny_clients`; §9 functions `false\|false\|false\|true`. | **To confirm (§0 `has_213`)** |
| **4** | **215** `selection_changes_requested_status` | 103 (status CHECK) | **No data change.** Idempotently DROPs + re-adds the `client_selections.status` CHECK to add the value `changes_requested`. Only widens the allowed set, so **no existing row can be invalidated**. | Yes — re-add the CHECK without `changes_requested` (only safe once no row uses it). | §7: the mig-103 status CHECK is present and `already_has_215=false`. | §7 `already_has_215=true`; `NOTIFY pgrst,'reload schema';`. | **To confirm (§0 `has_215`)** |
| **5** | **216** `architect_tender_stage_fix` | 187 (8-stage; `tender` is a valid stage), `leads.lead_type` | **Data correction, no schema change.** Scoped `UPDATE leads SET stage='tender' WHERE stage='accepted' AND lead_type='architect_tender'`. Column-guarded (no-op if `lead_type` absent). Touches no other `accepted` row. | No rollback (reverting would re-strand the leads). Idempotent (re-run moves 0). | §8: `has_lead_type=true`; `stranded_architect_tenders = N` (the rows it will move); `tender_is_an_allowed_stage=true`. | §8: `stranded = 0`. (No schema flag — confirm via the count.) | **To confirm (§8 count)** |

## Order & grouping notes
- **214 first and standalone** — it is an independent security fix (closes a pre-existing hole where any
  authenticated user, including a portal client, could read/write `internal_categories`). It does not depend
  on the register and can be applied on its own schedule.
- **212 → 213 in that order** — 213's `ON CONFLICT` targets indexes created by 212, and 213 fail-closes on a
  missing 104. Apply both on a staging/branch DB and run the un-gated-path checks (portal nightly sync, an
  existing client portal read) before production.
- **215 and 216 ride with 212/213** (same approval gate). 215 is pure CHECK-widening; 216 is a one-shot data
  correction. On a fresh apply, filename order (212,213,214,215,216) produces the same end state.
- **Everything is additive/forward-only and idempotent.** None of the five drops or rewrites populated data
  (215 widens a CHECK; 216 updates only the stranded architect-tender rows). The code ships **dark** behind
  the feature switch, so all five can land with zero behaviour change.

## What is NOT verified here
The **current production state** of every row above. I have no production access; the status column is
"to confirm via preflight". Run `PRODUCTION_PREFLIGHT_SQL_EDITOR.sql` §0 (+ §8) against production and fill
in the real applied/not-applied state before executing any gate.
