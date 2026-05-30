# WHS Operations-Start Questionnaire — Architecture & Dependency Model (for review)

> **Status:** Architecture for review. **Do not code yet.**
> Sits under `WHS_ENGINE_PLAN.md` (the data-system-that-outputs-documents principle).
> **Last updated:** 2026-05-30

---

## 0. How this fits the engine

The questionnaire is the **bridge** between project data and WHS outputs. It does three jobs only:
1. **Verify** what the Hub already knows (Level 1 — never re-typed).
2. **Capture** site-specific facts once (entered once → merged everywhere).
3. **Trigger** system logic — every answer generates SWMS / permits / registers / inspections / documents.

No AI generates safety content. Outputs are built by **merge + rules** from structured answers. Legal text comes from **referenced codes**, never authored.

**Effort target:** supervisor input < 10 min (reno ~5 min, custom home 10–15 min). Achieved by: prefill from Level 1, conditional reveals, pick-lists over free text.

---

## 1. Questionnaire flowchart (module flow + conditional reveals)

```
                    ┌─────────────────────────────────────────────┐
   project_metrics  │ M0  Construction Method   (AUTO-DERIVED —    │
   + estimate ─────►│     confirm only; pre-selects 50–70% of M5)  │
   + accepted_trades└─────────────────────┬───────────────────────┘
                                          ▼
                    ┌─────────────────────────────────────────────┐
   Level 1 data ───►│ M1  Project Verification   (prefilled)       │
   (read-only)      └─────────────────────────────────────────────┘
                                      │
                    ┌─────────────────▼───────────────────────────┐
                    │ M2  Site Setup        M3  Emergency Planning │
                    │ M4  Site Hazards                              │
                    └─────────────────┬───────────────────────────┘
                                      │
                    ┌─────────────────▼───────────────────────────┐
                    │ M5  HIGH RISK CONSTRUCTION WORK  (the gate)  │
                    │  yes/no per HRCW category                    │
                    └──┬───────┬───────────┬───────────┬───────────┘
        excavation=Y   │ heights/roof=Y    │ silica=Y  │ plant/crane/telehandler=Y
                    ┌──▼──┐ ┌──▼────────┐ ┌▼────────┐ ┌▼──────────┐
                    │ M6  │ │ M7 Falls/ │ │ M8      │ │ M9 Plant  │
                    │Excav│ │ Height    │ │ Silica  │ │ & Equip   │
                    └──┬──┘ └──┬────────┘ └─┬───────┘ └─┬─────────┘
                       └───────┴────────────┴───────────┘
                                      │
                    ┌─────────────────▼───────────────────────────┐
                    │ M10  Subcontractor Management                │
                    └─────────────────┬───────────────────────────┘
                                      ▼
                        RISK ENGINE  →  SWMS · Permits · Inspections ·
                        Registers · Toolbox Talks  →  Document generation
```

Modules 6–9 are **hidden unless** the matching M5 trigger is `yes`. A reno with no HRCW skips straight M5 → M10 (≈5 min).

### Module 0 — Construction Method (auto-derived, confirm-only)
Runs **before** M1 and is **not a fresh questionnaire** — it's read from data the Hub already holds upstream (job setup, tender, estimate, project metrics) and the supervisor merely **confirms**. It pre-ticks 50–70% of M5 so the supervisor confirms rather than thinks (e.g. *double storey + trusses* → Working at Heights, Roof Work, Structural Carpentry, Scaffold, Mobile Plant).

| M0 attribute | Source (existing) |
|---|---|
| New / addition / renovation | `jobs.project_type` |
| Single / double / triple storey | `project_metrics.storeys` |
| Timber / steel frame | `project_metrics.wall_type` / estimate |
| Conventional roof / trusses | `project_metrics.roof_type`, `roof_complexity` |
| Suspended slab · basement | `project_metrics.has_suspended_slab` / estimate |
| Retaining walls | `project_metrics.has_retaining_walls` |
| Structural steel · precast · demolition · masonry | `accepted_trades` / `trade_categories` / estimate |
| Steep site · bushfire (BAL) | `project_metrics.site_slope`, `bal_rating` → also pre-fills **M4** |

The full attribute → HRCW pre-selection logic lives in **`whsOutputsMatrix.md` Part A**.

---

## 2. Database schema

**Single source of truth — one new table:**

`whs_site_profiles` (one row per project)
```
id, project_id (unique → projects)
-- promoted high-reuse fields (entered once, merged into many outputs)
first_aid_location, fire_extinguisher_location, assembly_point,
site_access_location, parking_worker, parking_visitor, delivery_area,
skip_location, amenities_location, toilet_location, lunch_area,
nearest_hospital, nearest_medical_centre,
site_fenced (bool), temp_fencing_required (bool)
emergency_contacts jsonb     -- [{role,name,phone}]
first_aiders jsonb           -- [{name,phone,cert_expiry}]
site_rules jsonb             -- selected + custom
-- full module answers (long tail), keyed by question id
answers jsonb                -- { m2_*, m3_*, m4_*, m5_*, m6_*, ... }
-- DERIVED by risk engine (recomputed on save — never hand-entered)
high_risk_activities jsonb, applicable_swms jsonb, applicable_permits jsonb,
required_inspections jsonb, required_registers jsonb, required_toolbox_talks jsonb
-- meta / version control
status (draft|complete), version int, completed_at,
created_by, updated_by, created_at, updated_at
```

**New operational tables (kept minimal):**
| Table | Purpose | Populated from |
|---|---|---|
| `whs_permits` | excavation / hot works / height / confined space permits | risk engine (M5–M7) |
| `whs_inspections` | excavation, scaffold, EWP inspection schedule + results | risk engine (M6/M7) |
| `whs_plant` | plant register (crane, telehandler, EWP, etc.) | M9 |
| `whs_corrective_actions` | corrective action register | incidents + failed inspections |
| `whs_training` | competency/ticket register (heights, plant, etc.) | M9/M10 + employees |
| `whs_consultation` | toolbox talks, worker consultation, safety alerts, worker feedback | **permanent module** (not the questionnaire) — see §11 |

**Computed, not stored:** the **Compliance Health Score** is derived live across `project_swms` (unsigned), `whs_inspections` (overdue), `site_inductions` (missing), `whs_training` (expired) — see §11.

**Reuse existing tables (do NOT rebuild):**
| Register / record | Existing table |
|---|---|
| Incident register | `site_reports` |
| Induction register | `site_inductions` (+ QR form built) |
| SWMS register | `project_swms` + `swms_templates` (risk engine writes `project_swms`) |
| Contractor compliance register | `contractor_compliance` |
| Generated documents (audience-tagged) | `job_documents` register (from `WHS_ENGINE_PLAN.md`) |

**Config in code (not DB) — keeps it maintainable & version-controlled:**
- `whsQuestionnaire.mjs` — modules, questions, types, options, `code_reference`, `applies_when`
- `whsRiskRules.mjs` — **generated from `whsOutputsMatrix.md`** (the master rulebook). One trigger fires the **full chain**: SWMS → Permit → Inspection → Register → Toolbox Talk → **Site-Board Warning** → **Training/Competency**. Rules live in the matrix, never scattered in code.
- `whsMergeFields.mjs` — each field defined once + the outputs that consume it

---

## 3. Question dependency map (conditional logic)

| Trigger (answer) | Reveals |
|---|---|
| M5 · Excavation **or** Trenching = yes | **Module 6** (Excavation Assessment) |
| M5 · Work at heights **or** Roof work = yes | **Module 7** (Falls & Height) |
| M5 · Silica activities = yes | **Module 8** (Silica Assessment) |
| M5 · Crane **or** Telehandler **or** Mobile plant = yes | **Module 9** (Plant & Equipment) |
| M2 · Site fenced = no | Temp fencing requirement + sign-off |
| M4 · Overhead powerlines = yes | Powerline clearance controls + spotter requirement |
| M4 · Underground services = yes | Forces "Dial Before You Dig" in M6 |
| M6 · Depth > 1.5 m **or** adjacent to structures = yes | Shoring/benching design + Excavation Permit |
| M7 · Scaffold required = yes | Scaffold register + handover/inspection cadence |
| M7 · Rescue plan required = yes | Rescue Plan output |
| M10 · Labour hire **or** high-risk subs = yes | Heightened induction + SWMS-gating before site access |

---

## 4. Document dependency map (output ← sources)

| Output | Audience | Built from |
|---|---|---|
| WHS Management Plan | Management | L1 + M1,M2,M3,M4,M5 |
| Emergency Plan (EMP) | Management | M2 (locations) + M3 (contacts, hospital) |
| Site Safety Plan | Site | M2 + M4 + M5 |
| Risk Register | Management | M4 + M5 (+ derived controls) |
| Site Induction | Worker | M2 + M3 + site rules + applicable SWMS list |
| Site Board / Emergency Board | Worker | M2 (first aid, extinguisher, assembly) + M3 (contacts, hospital) + site rules |
| SWMS (per activity) | Worker | M5–M9 via risk engine |
| Permits | Site | M5,M6,M7 via risk engine |
| Toolbox Talks | Worker | M5,M8 per high-risk activity |
| Rescue Plan | Site | M7 |

Each field appears in many outputs but is **stored once** (e.g. `first_aid_location` → WHS Plan + EMP + Site Safety Plan + Induction + Site Board).

---

## 5. SWMS dependency map (trigger → SWMS)

> **Legal anchor:** High-Risk Construction Work (per WHS Regulations) **requires a SWMS before work starts.** M5 mirrors the HRCW categories so any `yes` mandates the matching SWMS. (Clause references to be confirmed against SA WHS Regulations — see §11.)

| Trigger | SWMS generated |
|---|---|
| Work at heights >2 m | Working at Heights |
| Roof work | Roof Work |
| Excavation / trenching | Excavation |
| Demolition | Demolition |
| Structural alterations | Structural Carpentry / Alterations |
| Crane lifts | Crane / Lifting |
| Telehandler / mobile plant | Mobile Plant |
| Hot works | Hot Works |
| Silica activities (M8) | Silica / RCS |
| Confined spaces | Confined Space |
| Hazardous chemicals | Hazardous Chemicals (+ SDS register) |
| Scaffold (M7) | Scaffold |

SWMS rows are written to `project_swms` (reuse), linked to `swms_templates`. Built in Phase 4 via the master SWMS builder.

---

## 6. Permit dependency map (trigger → permit + inspection)

| Trigger | Permit | Linked inspection |
|---|---|---|
| Excavation >1.5 m / near services / structures (M6) | Excavation Permit (+ DBYD evidence) | Excavation inspection (daily / after rain) |
| Hot works (M5) | Hot Works Permit | Fire-watch checklist |
| Roof / edge work (M7) | Height Work Permit (optional per policy) | Edge-protection / harness check |
| Confined space (M5) | Confined Space Entry Permit | Atmospheric test + standby |

Permits → `whs_permits`; inspections → `whs_inspections`.

---

## 7. Register dependency map (register ← source → storage)

| Register | Source | Storage |
|---|---|---|
| Risk Register | M4 + M5 | `whs_site_profiles` (derived) → rendered |
| Controls Register | M4 | derived |
| Emergency Contacts Register | M3 | `whs_site_profiles.emergency_contacts` |
| SWMS Register | risk engine | `project_swms` *(reuse)* |
| Induction Register | QR induction form | `site_inductions` *(reuse)* |
| Incident Register | incident logging | `site_reports` *(reuse)* |
| Contractor Compliance Register | doc upload | `contractor_compliance` *(reuse)* |
| Plant Register | M9 | `whs_plant` *(new)* |
| Training Register | M9/M10 + crew | `whs_training` *(new)* |
| Corrective Action Register | incidents + inspections | `whs_corrective_actions` *(new)* |
| Inspection Registers (excavation/scaffold) | M6/M7 | `whs_inspections` *(new)* |

---

## 8. API architecture

```
-- Questionnaire (data-driven UI)
GET  /api/whs/questionnaire                         → module/question config
GET  /api/whs/projects/:projectId/profile           → profile + Level 1 prefill
PUT  /api/whs/projects/:projectId/profile           → autosave answers (per module)
POST /api/whs/projects/:projectId/recompute         → run risk engine → derive
                                                      SWMS/permits/inspections/registers;
                                                      upsert project_swms, whs_permits, whs_inspections

-- Outputs (generate from the profile; land in job_documents register)
GET  /api/whs/projects/:projectId/outputs           → list (audience-tagged, stale flags)
POST /api/whs/projects/:projectId/generate/:key     → render one output (PDF)

-- Registers (CRUD)
GET/POST/PATCH /api/whs/projects/:projectId/permits
GET/POST/PATCH /api/whs/projects/:projectId/inspections
GET/POST/PATCH /api/whs/projects/:projectId/plant
GET/POST/PATCH /api/whs/projects/:projectId/corrective-actions
GET/POST/PATCH /api/whs/projects/:projectId/training
```
Existing endpoints reused: induction (`/api/induction/...`), incidents (`/api/whs/:projectId/reports`), compliance (`/api/whs/:projectId/compliance`), SWMS (`/api/whs/swms`).

---

## 9. Version control & legal defensibility

- **Profile versioning:** `whs_site_profiles.version` increments on material change; `created_by/updated_by` + timestamps on every write (full audit trail of who answered what, when).
- **Immutable output snapshots:** when a document is generated, the `job_documents` row stores *the answer set + template version used*. So you can always prove: *"This WHS Plan was generated on [date] from [these answers] using template v[N]."* — the core of legal defensibility.
- **SWMS template versioning:** `swms_templates.version` (already exists) — generated SWMS pin to a version.
- **Stale detection:** if answers change after an output was generated, mark that output **stale → regenerate** (so site docs never silently drift from the data).
- **Code references stored on questions/templates** so every requirement traces to a Safe Work Australia code / SA reg clause.

---

## 10. Future expansion framework

- **Add a module / question / SWMS / permit = edit config**, not the schema. `whsQuestionnaire.mjs` + `whsRiskRules.mjs` + a template — no migration unless a genuinely new register type.
- **Modules are independent** — each is a self-contained config block with its own `applies_when`, outputs, and rules.
- **Integration hooks (later):**
  - *Buildxact* — estimate line items hint at trades/HRCW (pre-tick M5).
  - *Scheduling* — programme phases time the inspections and flag HRCW windows.
  - *Subcontractor mgmt* — compliance gates induction; SWMS-gating before site access.

---

## 11. Operational modules (added in review)

These are **permanent modules**, not part of the one-time questionnaire — they run for the life of the job.

### 11.1 Compliance Health Score (dashboard card)
A live percentage per site, computed across existing data — no new entry. Surfaces what's outstanding so the office sees risk at a glance.
```
Site Compliance Score   92%
Missing:
 • Telehandler SWMS unsigned        (project_swms)
 • Excavation inspection overdue    (whs_inspections)
 • Electrician induction incomplete (site_inductions)
```
Inputs: unsigned `project_swms`, overdue `whs_inspections`, missing `site_inductions`, expired `whs_training`, open `whs_corrective_actions`. Becomes a card on the Job Command Centre + Operations dashboard.

### 11.2 Consultation Module *(biggest legal gap — now closed)*
WHS legislation places significant weight on **consultation**. This is a standing module (table `whs_consultation`) covering:
- **Toolbox talks** (logged, attendees, topic — feeds the SWMS/activity of the week)
- **Worker consultation** records
- **Safety alerts** (push a hazard notice to the site/worker layer)
- **Worker feedback** (raise a hazard / suggestion)

Not in the questionnaire — it's ongoing. Legal basis: WHS Act (SA) duty to consult _(clause TBC, §12)_.

### 11.3 Weather
Activities are tagged `weather_sensitive` with the condition that pauses them (roof/heights → wind; pour → heat/rain; membrane → rain; excavation → rain) — see **`whsOutputsMatrix.md` Part D**. Standalone today (manual check); wired to the scheduler in 11.4.

### 11.4 Programme-driven WHS *(future flagship — beats HazardCo)*
The end-state shifts from **Project → WHS** to **Project → Programme → WHS**. The build programme (`schedule_tasks`) drives WHS automatically:
```
Schedule: Week 8 — Roof trusses
   ↓ (no supervisor action)
Activate: Structural Carpentry SWMS + Working at Heights SWMS
        + Scaffold inspection + Toolbox talk
   + if high-wind forecast that week → notify supervisor (11.3)
```
This is the genuine differentiator. Sequencing: lands after Phase 1–5, once the matrix + scheduler integration exist.

---

## 12. Open items for Sam (content + legal — not architecture)

1. **Final question wording** per module (the brief's list is the v1 set — confirm).
2. **Code-clause references** for each risk question/SWMS/permit, checked against the **WHS Act (SA)**, **WHS Regulations (SA)**, and the relevant Model Codes. *(Architecture leaves a `code_reference` slot on every question; these strings are yours to confirm — the Hub references them, never authors them.)*
3. **Site rules master list** (selectable in M2).
4. **SWMS content** (Phase 4) — the master SWMS builder's control sets per activity.
5. **Permit policy** — which permits Blue Leaf issues internally vs. references (e.g. height-work permit optional).

---

## Success-criteria check (against the brief)

| Criterion | How the design meets it |
|---|---|
| Fewer questions than HazardCo | Prefill Level 1 + conditional reveals (skip irrelevant modules) |
| Better documentation | Structured, project-specific, code-referenced |
| Less supervisor effort | <10 min, pick-lists, autosave, one pass |
| Project-specific outputs | Merge from the per-project profile |
| Scales reno → custom home | Modules independent + conditional |
| Legally defensible | Code references + immutable generated snapshots + audit trail |
| Auditable | Versioning + who/when on every answer and output |
| Maintainable without AI | Structured data + rules config; no AI-authored safety content |
| Future integration | Config-driven + Buildxact/scheduling/subbie hooks |

---

## Build sequence (recap — no code until approved)

**Phase 1 (next):** `whs_site_profiles` migration + **Module 0** (read/confirm from `project_metrics`/estimate) + `whsQuestionnaire.mjs` + `whsRiskRules.mjs` (generated from `whsOutputsMatrix.md`) + `whsMergeFields.mjs` + profile/recompute API + the one-screen conditional questionnaire UI. **No documents.**
**Phase 2:** WHS Plan, EMP, Site Safety Plan.
**Phase 3:** registers (reuse existing + add plant/training/corrective-action/inspections) + **Compliance Health Score** card + **Consultation module** (toolbox/alerts/feedback).
**Phase 4:** SWMS engine + the 10 SWMS.
**Phase 5:** Site Board system (QR induction, emergency/first-aid/rules boards, visitor sign-in) + **Weather** tagging.
**Phase 6 (flagship):** Programme-driven WHS — `schedule_tasks` auto-activates SWMS/inspections/toolbox + weather alerts.
