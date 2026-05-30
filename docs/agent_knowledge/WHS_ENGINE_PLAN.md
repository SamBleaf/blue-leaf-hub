# WHS Engine — Data Model & Questionnaire Architecture (Plan)

> **Status:** Planned — this is the spec to build first. No documents are written until the data layer exists.
> **Owner:** Sam / Admin
> **Last updated:** 2026-05-30

---

## Content pack (imported 2026-05-30)

The approved WHS content lives at **`docs/whs/template-pack/`** — the canonical source the engine consumes (3 core plan templates, 10 SWMS, 3 permits, 7 registers, merge-field register, questionnaire map, outputs matrix, legal/usability critique). Templates use **`{{merge_field}}`** (mustache-style) markdown — distinct from the fee-proposal docxtemplater single-brace flow.

Build-time reconciliation notes (found while reading the pack):
- **Extend the merge-field register.** The SWMS/permit/register templates use fields not yet in `01_merge_field_register.md` — e.g. `swms_scope_notes`, `plant_equipment_required`, `task_specific_controls`, `task_specific_emergency_response`, `permit_number`, `excavation_depth`, `contractor_name`, `check_*`/`notes_*`, and repeating-row fields (`swms_name`, `worker_name`, `signed_count`). The renderer must support **repeating rows** (registers, worker sign-on, work-step tables).
- **Matrix canonical here.** `whsOutputsMatrix.md` (this folder) stays in sync with the pack's `config/whs_outputs_matrix.md`; mine adds Part A (Module 0 pre-select) + Part D (weather).
- **Honour the critique.** `critique/99_legal_usability_critique.md` lists the legal gaps (confirm SA clause refs; review asbestos/silica/confined-space; notifiable-incident workflow) and the approval cycle: Draft → supervisor review → Director approval → locked PDF → worker sign-on → **stale on any profile change**.

> **Critical (from the critique):** replacing HazardCo means Blue Leaf now owns template review, legislation monitoring, code updates, and subcontractor document review. Safe if maintained; dangerous if templates go stale.

---

## The principle (read this first)

**Do not build a document system. Build a data system that outputs documents.**

Most WHS software (HazardCo, HammerTech, SafetyCulture) asks the same information 15 times across different forms. Blue Leaf Hub will ask each fact **once** and generate every output from that single source.

Three rules that govern everything below:

1. **Enter once, reuse everywhere.** "Where is the first aid kit?" is answered one time, then merged into the WHS Plan, EMP, Site Safety Plan, Induction, and Site Board. Never re-asked.
2. **Never re-ask what the Hub already knows.** Level 1 (project data) is read from existing tables — the WHS module has no copy of the site address, client, supervisor, contract value, trades, or programme.
3. **Reference the law, never author it.** Templates cite the Safe Work Australia model codes and SA WHS Act/Regs. The Hub never invents a legal requirement.

---

## Architecture: four levels, one source of truth

```
LEVEL 1  Project Data        ── READ from existing tables (never re-asked)
LEVEL 2  Site Setup Q's      ─┐
LEVEL 3  Risk Q's            ─┤→  whs_site_profiles  (the single source of truth)
                              │        │
                              │        ▼  risk engine (rules, not free text)
                              │   applicable SWMS / permits / registers / high-risk activities
                              ▼        ▼
LEVEL 4  Generated Outputs ── merge(Level 1 + profile) → rendered docs (no data of their own)
```

### Level 1 — Project Data (already in the Hub — map, don't re-ask)
| WHS needs | Source today |
|---|---|
| Site address | `projects.address` |
| Client | `projects.client_name` / `jobs.client_name` |
| Supervisor / principal contractor | `projects.supervisor` (+ company defaults) |
| Contract value | `jobs.contract_value` |
| Project type | `jobs.project_type` |
| Programme / dates | `schedule_tasks`, `projects.commencement_date` |
| Trades on site | `projects.accepted_trades`, `purchase_orders` |
| In-house crew | `employees` |
| High-risk activities | **Derived** by the risk engine (Level 1 trades + Level 3 answers) |

### Level 2 — Site Setup Questionnaire (~20–30 questions, answered once)
The site-specific facts the Hub can't already know. Examples (final list = Sam):
first aid kit location, first aiders + certs, emergency assembly point, nearest hospital, site access, amenities, power/water source, fire extinguisher + spill kit location, traffic management, neighbouring hazards, services (gas/power/comms) location, site rules selection.

### Level 3 — Risk Questionnaire (~20–40 questions, drives outputs)
Yes/no + pick-list questions that **decide which SWMS, permits, and controls apply**. Each question maps to a code clause. Examples:
work at height >2m? roof work? scaffold? excavation >1.5m? demolition? silica/dust? mobile plant? crane/lifting? hot works? confined space? asbestos? energised electrical?

→ The **risk engine** turns these answers (+ trades) into `high_risk_activities`, `applicable_swms`, `applicable_permits`, `required_registers`. Pure rules — no free text, no guessing.

### Level 4 — Generated Outputs (assembled by merge — store nothing new)
WHS Management Plan, Emergency Plan (EMP), Site Safety Plan, SWMS, Permits, Registers, Toolbox Talks, Site Boards. Each output is a **template with merge tags** that pulls from Level 1 + the profile. Outputs hold no data of their own.

---

## Data model (deliberately minimal)

**1. `whs_site_profiles`** — one row per project, the single source of truth.
```
id, project_id (unique → projects)
-- promoted high-reuse fields (entered once, merged into many outputs)
first_aid_location, first_aiders jsonb, emergency_assembly_point,
nearest_hospital, nearest_hospital_address, site_access_notes,
amenities_location, power_source, water_source,
fire_extinguisher_location, spill_kit_location,
emergency_contacts jsonb, principal_contractor, site_rules jsonb
-- long tail of questionnaire answers
site_setup_answers jsonb   -- Level 2, keyed by question id
risk_answers jsonb         -- Level 3, keyed by question id
-- derived by the risk engine (recomputed on answer change — never hand-entered)
high_risk_activities jsonb, applicable_swms jsonb,
applicable_permits jsonb, required_registers jsonb
-- meta
status (draft|complete), completed_at, version, created_at, updated_at
```

**2. Questionnaire = config in code** (`server/lib/whsQuestionnaire.mjs`), not a DB builder — simpler, version-controlled, easy for Sam to edit.
```
sections: [{ level, title, questions: [
  { key, label, type (yesno|select|multiselect|text|list),
    options?, help?, code_reference, applies_when? }
]}]
```
`applies_when` = conditional logic so the supervisor only sees relevant questions (e.g. scaffold questions only if "scaffold = yes").

**3. Risk engine = rules config** (`server/lib/whsRiskRules.mjs`) — pure functions.
```
answers + trades  →  { high_risk_activities, applicable_swms, applicable_permits, required_registers }
e.g. work_at_height>2m → SWMS "working_at_heights" + control set + (if roof) "roof_work"
```

**4. Merge-field registry** (`server/lib/whsMergeFields.mjs`) — each field defined **once** with the outputs that consume it. Enforces enter-once.

**5. Outputs reuse the existing per-job register.** Generated WHS docs become `job_documents` rows (`fill_type: generated`, `generator_key: whs_engine`), each tagged with an **audience layer**. No parallel storage.

### Reuse what already exists (no duplication)
| Concept | Use the existing table |
|---|---|
| SWMS templates + per-project SWMS | `swms_templates`, `project_swms` (risk engine populates `project_swms`) |
| Induction register | `site_inductions` (+ QR form already built) |
| Incident register | `site_reports` |
| Subcontractor compliance | `contractor_compliance` |
| New registers (plant, training, corrective action) | small new tables in Phase 3 |

---

## Enter-once → reuse (the concrete win)
`first_aid_location` is asked **one time** in the Site Setup questionnaire, then merged into:
**WHS Management Plan · Emergency Plan · Site Safety Plan · Site Induction · Site Board / First Aid Board.**
Change it once → every output updates. This is the difference vs HazardCo asking it five times.

---

## Three audiences (every output is tagged)
| Layer | Audience | Outputs |
|---|---|---|
| **Management** | Office | WHS Management Plan, EMP, Registers |
| **Site** | Supervisor | Site Safety Plan, Permits, Inspections |
| **Worker** | Tradies | Site Rules, Emergency Board, relevant SWMS, Toolbox Talk |

Tradies never get the 40-page plan — they get the one-page board and their task's SWMS. The data is shared; the *presentation* is layered.

---

## Legal grounding (templates reference, never invent)
Build every template around these — cite them, don't rewrite them:
Safe Work Australia Model Codes — Construction Work · Managing Risks · First Aid · Hazardous Chemicals · Managing the Risk of Falls · Excavation Work — plus **WHS Act (SA)** and **WHS Regulations (SA)**.

---

## Build sequence

**Phase 1 — Data schema + questionnaire + risk engine (THE NEXT DELIVERABLE). No documents.**
- Migration: `whs_site_profiles` (+ RLS, unique on project_id)
- `whsQuestionnaire.mjs` (Level 2 + Level 3 questions, conditional logic, code references)
- `whsRiskRules.mjs` (answers + trades → applicable SWMS / permits / registers / high-risk activities)
- `whsMergeFields.mjs` (field registry)
- API: get/save profile (reads Level 1 from existing tables), recompute-risk endpoint
- UI: the single questionnaire (one screen, conditional, prefilled from Level 1)

**Phase 2 — Core outputs:** WHS Management Plan, EMP, Site Safety Plan (merge from the profile).
**Phase 3 — Registers:** plant, training, incident (=`site_reports`), induction (=`site_inductions`), SWMS (=`project_swms`), corrective action.
**Phase 4 — SWMS engine:** master SWMS builder → Working at Heights, Roof Work, Scaffold, Excavation, Demolition, Silica, Mobile Plant, Crane/Lifting, Hot Works, Structural Carpentry.
**Phase 5 — Site Board system (biggest visible value):** auto-generate QR induction, emergency board, first-aid board, site-rules board, visitor sign-in.

---

## Simplicity guardrails (keep it effortless)
- **One questionnaire, answered once.** Conditional — only show questions that apply.
- **Prefill from Level 1.** The supervisor confirms, doesn't retype.
- **Pick-lists over free text** wherever a list works (free text is where duplication and unread content creep in).
- **Outputs are read-only and generated** — never a form the supervisor fills again.
- **Reuse existing tables** (`site_reports`, `site_inductions`, `project_swms`, `contractor_compliance`) — don't re-implement registers that exist.
- The test for any new question: *"Does the Hub already know this, and is this answer reused in 2+ outputs?"* If the Hub knows it, read it. If it's used once, reconsider asking it.

---

*Next deliverable = Phase 1 (data model + questionnaire + risk engine). Everything else generates from it.*
