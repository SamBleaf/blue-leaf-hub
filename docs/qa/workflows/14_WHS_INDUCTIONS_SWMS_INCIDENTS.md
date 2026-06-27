# Workflow 14 — WHS / Inductions / SWMS / Incidents

**Status:** Mapped (2026-06-25) — documentation only  
**Related:** [13_SITE_OPERATIONS_DIARY_MEDIA.md](./13_SITE_OPERATIONS_DIARY_MEDIA.md), [15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md](./15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md), [BATCH_C_REVIEW_PACK.md](../BATCH_C_REVIEW_PACK.md)

**Starts after:** W09 — `projects` row; manual WHS setup  
**Hands off to:** Compliance audits, client documents (partial), site induction records

---

## 1. Business purpose

Work health & safety compliance: **site profiles**, generated WHS plans, subcontractor compliance docs, **QR site inductions**, SWMS linking, incident/near-miss reporting. Replaces external HazardCo-style tooling per `WHS_ENGINE_PLAN.md`.

**Verified from SOP/docs:** `docs/sops/08_whs/` (5 SOPs, untested)

---

## 2. Start trigger

| Trigger | Surface |
|---------|---------|
| First WHS setup visit | `/operations/:projectId/whs-setup` (WhsEngine) |
| Ongoing WHS management | `/operations/:projectId/whs` (WhsManager) |
| Public induction | `/induct/:projectId` (no auth) |
| **NOT on win** | No `whs_site_profiles` auto-create — **W14-DRIFT-001** |

---

## 3. End state

| End state | Store |
|-----------|-------|
| Site profile saved | `whs_site_profiles` |
| WHS plan generated | `whs_documents` (markdown snapshot) |
| SWMS linked | `project_swms` |
| Induction completed | `site_inductions` + PDF filed |
| Incident logged | `site_reports` |
| Sub compliance current | `contractor_compliance` |

---

## 4. Primary users

| User | Role |
|------|------|
| Admin / supervisor | WHS setup, compliance uploads, incidents |
| Subcontractors / visitors | Public induction QR |
| Field staff | FieldWHS hub (link-out only) |
| Client | Documents tab label only — limited WHS push |

---

## 5. Current UI surfaces

| Screen | Route | File |
|--------|-------|------|
| WhsManager | `/operations/:projectId/whs` | Contractors, inductions, incidents tabs |
| WhsEngine | `/operations/:projectId/whs-setup` | Questionnaire + generate plan |
| SiteInduction | `/induct/:projectId` | Public QR form |
| FieldWHS | `/field/*` | Redirect to ops WHS |
| Ops hub | `/operations/:projectId` | WHS alerts + nav card |

---

## 6. Backend routes / APIs

**Legacy WHS:** `server/lib/whsRoutes.mjs`

| Route | Purpose |
|-------|---------|
| `GET /api/whs/:projectId/compliance` | Sub compliance rollup |
| `POST /api/whs/compliance` | Upload compliance doc |
| `GET/POST /api/whs/:projectId/inductions` | Induction register |
| `GET/POST /api/whs/:projectId/reports` | Incidents |
| `PATCH /api/whs/report/:id` | Resolve (status only) |
| `POST/GET /api/whs/swms` | SWMS template library |

**WHS Engine:** `server/lib/whs/whsEngineRoutes.mjs`

| Route | Purpose |
|-------|---------|
| `GET /api/whs/questionnaire` | Question definitions |
| `GET/PUT /api/whs/projects/:projectId/profile` | Profile + risk engine |
| `GET /api/whs/projects/:projectId/documents` | Generated docs |
| `POST .../generate/:templateKey` | **Only** `project_whs_management_plan` wired |

**Public:** `inductionRoutes.mjs` — `/api/induction/:projectId/info|submit`

---

## 7. Database tables

| Table | Migration | Role |
|-------|-----------|------|
| `whs_site_profiles` | 064 | **SSoT** per project (answers + derived) |
| `whs_documents` | 064 | Generated doc snapshots |
| `site_inductions` | 010 | Public induction records |
| `site_reports` | 010, 074 | Incidents / hazards / near-miss |
| `contractor_compliance` | 010 | Sub insurance/licence/SWMS |
| `swms_templates` | 010 | Template library |
| `project_swms` | 010 | Project ↔ SWMS links |
| `job_documents` | 069 | Knowledge core doc types |

---

## 8. External integrations

| Integration | Role |
|-------------|------|
| **Dropbox** | Compliance uploads, incident photos/PDFs |
| **Job records / Storage** | Induction PDF filing |
| **Facts service** | M0 prefill on WHS questionnaire |
| **Template pack** | `docs/whs/template-pack/` — ~24 templates, **1 wired** |
| **External HazardCo** | **None** — Hub is replacement |

---

## 9. Source of truth

| Fact | Store |
|------|-------|
| Project WHS context | `whs_site_profiles` |
| Generated plans | `whs_documents` |
| Induction record | `site_inductions` |
| Incident | `site_reports` |
| Sub compliance doc | `contractor_compliance` |

---

## 10. Happy path

1. Post-win → staff open WHS Setup → complete questionnaire → save profile.
2. Risk engine derives outputs → sync `project_swms` stubs.
3. Generate **Project WHS Management Plan** (only template live).
4. Upload sub compliance docs on WhsManager Contractors tab.
5. Share QR induction link → visitor submits → PDF + `site_inductions` row.
6. Log incidents on Incidents tab → resolve via PATCH.

---

## 11. Failure paths

| Failure | Evidence |
|---------|----------|
| Engine Phase 1 only | 1 of ~24 templates — **W14-DRIFT-002** |
| No PDF export from engine | Markdown preview only — **W14-DRIFT-003** |
| SWMS PDFs empty on induction | `pdf_path` rarely populated — **W14-DRIFT-004** |
| API response drift | `whsRoutes` raw json vs `ok`/`err` — **W14-DRIFT-005** |
| Incident PATCH | Only `resolved` transition — **W14-DRIFT-006** |

---

## 12. Manual workarounds

- Use Dropbox folders for docs not yet in engine templates.
- Manual SWMS PDF upload to compliance table.
- Field app redirects to desktop WhsManager for most actions.

---

## 13. Cross-module dependencies

| Module | Link |
|--------|------|
| W09 | `project_id`; no auto profile |
| W11 | PO subs appear in compliance rollup |
| W13 | Separate diary; incidents in W14 |
| W15 | Induction before site access (process, not enforced in code) |
| W18 | Client documents category label only |

---

## 14. Data ownership

| Table | W14 owns |
|-------|----------|
| `whs_site_profiles` | Profile lifecycle |
| `whs_documents` | Generated snapshots |
| `site_inductions` | Induction records |
| `site_reports` | Incidents (shared naming with W13 reports concept) |
| `contractor_compliance` | Sub docs |

---

## 15. Current tests

| Test | Status |
|------|--------|
| E2E WHS pack | **missing** (planned in E2E master plan) |
| SOP 08-* | untested |
| Adversarial audit | WHS routes noted |

---

## 16. Missing tests

| ID | Purpose |
|----|---------|
| W14-API-01 | Profile save creates/updates `whs_site_profiles` |
| W14-API-02 | Generate management plan |
| W14-API-03 | Public induction submit |
| W14-API-04 | Compliance upload |
| W14-SEC-01 | Induction public vs admin routes |
| W14-E2E-01 | QR induction smoke |

---

## 17. Confirmed drift items

| ID | Risk |
|----|------|
| **W14-DRIFT-001** | No WHS profile on win |
| **W14-DRIFT-002** | Engine template coverage 1/N |
| **W14-DRIFT-003** | No PDF lock/approve pipeline |
| **W14-DRIFT-004** | Induction SWMS PDFs often missing |
| **W14-DRIFT-005** | API response convention drift |
| **W14-DRIFT-006** | Limited incident status transitions |

---

## 18. Unconfirmed risks

- Legal adequacy of generated plan vs state regulations — **Open decision for Sam / legal review**.
- RLS on WHS tables for multi-tenant future.

---

## 19. P0 candidates

| Item | Notes |
|------|-------|
| W14-API-01 profile baseline | No tests |
| Ops readiness WHS item | P0-B5 |
| Document compliance manual steps | Staff training |

**Not P0:** Auto-seed WHS on win.

---

## 20. P1/P2 candidates

| Item | Priority |
|------|----------|
| Wire additional engine templates | P2 |
| PDF export + approval workflow | P1 |
| Portal WHS document push | P2 |
| Field-native WHS (Workstream C) | P2 |

---

## 21. Sam decisions needed

| ID | Question | Recommended |
|----|----------|-------------|
| **SAM-W14-001** | Auto-create WHS profile on win? | **No during hardening** |
| **SAM-W14-002** | Minimum docs before first trade on site? | **Manual checklist — document** |
| **SAM-W14-003** | Engine template rollout priority? | **Plan batch 2 after tests** |

---

## 22. Recommended hardening stance

Test profile + induction + incident CRUD paths. Do not expand template pack until baseline tests green. Document legal/compliance manual obligations clearly.

---

## 23. Next safe action

W14-API-01 skeleton; Sam confirms SAM-W14-002 minimum site-ready WHS list.

---

## Key questions answered

| Question | Answer |
|----------|--------|
| WHS records stored? | `whs_site_profiles`, `whs_documents`, related tables |
| Auto after win? | **No** |
| SWMS templates? | `swms_templates` + engine sync to `project_swms` |
| Inductions tracked? | **Yes** — `site_inductions` |
| QR induction? | **Yes** — `/induct/:projectId` |
| Incidents logged? | **Yes** — `site_reports` |
| Emergency/SSP stored? | Template pack exists; **most not wired in app** |
| Auto vs manual? | **Mostly manual** setup; engine assists one plan |
| Compliance risk | Incomplete template coverage; manual gaps — **high process risk** |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | W14 mapped — Batch C |
