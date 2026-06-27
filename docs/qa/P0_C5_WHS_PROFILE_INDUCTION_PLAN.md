# P0-C5 — WHS Profile / Induction Smoke Hardening Plan (W14)

**Date:** 2026-06-25  
**Status:** Planning complete — baseline tests **already shipped** (`test:w14-whs-baseline:write` 12/12); this doc formalises scope, gaps, and any follow-up  
**Workflow:** [14_WHS_INDUCTIONS_SWMS_INCIDENTS.md](./workflows/14_WHS_INDUCTIONS_SWMS_INCIDENTS.md) *(not `14_WHS_SITE_PROFILE_INDUCTION.md` — file does not exist)*  
**Sam decisions:** [SAM-W14-001](./SAM_DECISION_LOG.md) — **No auto WHS profile on win** (decided)

---

## 1. Current WHS source of truth

| Layer | Owner | Detail |
|-------|-------|--------|
| **Site WHS context** | `whs_site_profiles` | One row per `project_id` (UNIQUE); questionnaire `answers` jsonb + promoted columns + risk-engine derived fields |
| **Generated plans** | `whs_documents` | Immutable markdown snapshots from template render |
| **Induction records** | `site_inductions` | Public QR form submissions per `project_id` |
| **SWMS links (induction)** | `project_swms` → `swms_templates` | Synced from profile `applicable_swms` on save |
| **Legacy WHS ops** | `contractor_compliance`, `site_reports`, `project_swms` | WhsManager tabs — compliance, incidents, SWMS library |
| **Job spine** | `projects.job_id` → `jobs` | Profile prefill reads project + job + `project_metrics`; induction PDF filed via `fileJobRecord(jobAddress)` |

**Not in scope / not wired:** Auto-create profile on win-finalize; full WHS template pack (~24 templates); HazardCo/Deputy/Xero.

**Migrations:** `010_module6_operations.sql` (`site_inductions`, `site_reports`, …), `064_whs_engine.sql` (`whs_site_profiles`, `whs_documents`).

---

## 2. WHS profile routes

**Registrar:** `server/lib/whs/whsEngineRoutes.mjs` → `registerWhsEngineRoutes(app)` in `server/dev-api.mjs`

| Method | Route | Role gate | Purpose |
|--------|-------|-----------|---------|
| GET | `/api/whs/questionnaire` | `requireAuth` | Question definitions |
| GET | `/api/whs/projects/:projectId/profile` | `requireAuth` | Load profile + prefill + M0 facts |
| PUT | `/api/whs/projects/:projectId/profile` | `requireAuth` | Save answers → risk engine → `project_swms` sync |
| GET | `/api/whs/projects/:projectId/documents` | `requireAuth` | List generated docs |
| POST | `/api/whs/projects/:projectId/generate/:templateKey` | `requireAuth` | Render doc (**only** `project_whs_management_plan` wired) |

**Legacy WHS (compliance / incidents / register):** `server/lib/whsRoutes.mjs` via `registerModule6Routes` → `module6Routes.mjs`

| Method | Route | Role gate |
|--------|-------|-----------|
| GET | `/api/whs/:projectId/compliance` | `requireAuth` |
| POST | `/api/whs/compliance` | `requireAuth` |
| GET | `/api/whs/:projectId/inductions` | `requireAuth` |
| GET/POST | `/api/whs/:projectId/reports` | `requireAuth` |
| PATCH | `/api/whs/report/:id` | `requireAuth` |
| GET/POST | `/api/whs/swms` | `requireAuth` |

**Response convention drift:** Engine routes use `ok()`/`err()`; legacy `whsRoutes` uses raw `{ ok: true }` — **W14-DRIFT-005** (document only; not P0-C5).

---

## 3. Induction routes

**Registrar:** `server/lib/inductionRoutes.mjs` → `registerInductionRoutes(app)` in `server/dev-api.mjs`

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/induction/:projectId/info` | **None** | Project address + linked SWMS list |
| POST | `/api/induction/:projectId/submit` | **None** | Validate form → PDF → `site_inductions` insert |

**UI:** `src/pages/SiteInduction.jsx` — public route `/induct/:projectId` (no login).

---

## 4. Public induction link / token / QR flow

| Item | Behaviour | Evidence |
|------|-----------|----------|
| **URL shape** | `/induct/:projectId` — raw Supabase `projects.id` UUID | `App.jsx`, `SiteInduction.jsx` |
| **QR field** | Profile prefill sets `site_qr_induction_url` = `{APP_URL}/induct/{projectId}` | `whsEngineRoutes.mjs` GET profile |
| **Token / signed link** | **None** — no expiry, no HMAC, no one-time token | Verified from code |
| **Info leak** | Valid UUID → `{ ok, address, swms }`; invalid → 404 | `inductionRoutes.mjs` |
| **Submit binding** | Row stamped with `project_id` from path param only | `site_inductions.project_id` |

**Process intent (SOP):** Share QR/link after WHS profile saved so SWMS list is populated — **Unconfirmed / needs testing** in production.

---

## 5. Role gates

| Surface | Gate today | P0-C5 expectation |
|---------|------------|-------------------|
| WhsEngine / WhsManager UI | `ProtectedRoute` only — **any authenticated user** with URL | Admin/supervisor intended — **UI gap** |
| Engine profile GET/PUT | `requireAuth` only — **no `requireRole`** | W14-SEC-02/03 tests will expose whether employee can write |
| Public induction | No auth | By design |
| Legacy whs induction list | `requireAuth` | Staff register read |

**Existing test observation:** `w14-whs-baseline.mjs` — supervisor PUT profile **succeeds** (200). Employee PUT **not yet asserted** — likely also 200 today (**W14-SEC-03 gap candidate**).

**Recommended stance (plan only):** Test-first; add `requireRole("admin", "supervisor")` on profile PUT/GET/generate **only if** W14-SEC-03 fails and Sam approves — mirror P0-C3 Option B pattern (align UI + API), not broad WHS redesign.

---

## 6. External side effects

| Action | Side effect | Test handling |
|--------|-------------|---------------|
| Profile save | `syncProjectSwms` — may insert stub `swms_templates` + replace `project_swms` | DB-only assertion OK |
| Profile save | Marks non-approved `whs_documents` stale | DB assertion optional |
| Generate plan | Reads local markdown template; inserts `whs_documents` | No external call |
| Induction submit | `buildInductionPdfBuffer` → `fileJobRecord` (Dropbox/job records) | May create Dropbox folder under job address — use **`BLH TEST`** via `buildTestJobAddress()` |
| Induction submit | Inserts `site_inductions` | Service-role cleanup in `finally` |
| Win-finalize | **Does not** create `whs_site_profiles` | W14-API-05 / SAM-W14-001 |

---

## 7. Current gaps

| ID | Gap | Severity | P0-C5 action |
|----|-----|----------|--------------|
| **W14-DRIFT-001** | No auto profile on win | Process (intentional) | Test W14-API-05 — **shipped** |
| **W14-DRIFT-002** | Engine 1/N templates | Medium | Document only — out of P0-C5 |
| **W14-DRIFT-003** | No PDF export/approve pipeline | Medium | Out of P0-C5 |
| **W14-DRIFT-004** | SWMS PDFs often empty on induction | Medium | Gap-document in test if `pdf_path` null |
| **W14-DRIFT-005** | Legacy whsRoutes response shape | Low | Out of P0-C5 |
| **Auth gap** | Profile routes lack role gate | **Security P1** | **fixed** — W14-SEC-03 `requireRole` on PUT + generate |
| **Enumeration** | Public GET info reveals address for guessed UUID | **Security P1** | W14-SEC-01 tests pass; **W14-DRIFT-007** documents tokenised link as future |
| **UI gate** | WhsEngine not `RoleRoute` | Medium | Out of P0-C5 unless SEC-03 requires UI align |

---

## 8. Smallest safe implementation plan

**Principle:** Test-first smoke hardening only — no template pack expansion, no win-auto-seed, no Workforce/procurement/schedule/RFQ changes.

### Phase A — Tests (primary P0-C5 deliverable)

1. Create/extend `scripts/batch-a/w14-whs-baseline.mjs` + runner + npm scripts *(partially done)*.
2. Fixtures: `buildTestJobAddress({ suite: "W14", workflowId: "WHS" })`; job + project via API/service client.
3. Cleanup in `finally`: `site_inductions`, `whs_documents`, `whs_site_profiles`, `project_swms`, `projects`, `jobs`.
4. After `--write` run: `npm run test:cleanup-artifacts` (dry-run only).

### Phase B — Product changes (only if tests prove gap)

| Trigger | Smallest fix |
|---------|--------------|
| W14-SEC-03 employee PUT succeeds | Add `requireRole("admin", "supervisor")` on engine profile GET/PUT/generate *(optional UI RoleRoute)* |
| W14-SEC-01 enumeration confirmed | Document + register QA item; tokenised induction is **post-P0** |
| Induction PDF filing fails in CI | Gap-document; assert DB row even if `induction_pdf_path` null |

**Explicitly not in P0-C5:** WHS template rollout, incident/compliance test suite, portal WHS push, FieldWHS native flows.

---

## 9. Required tests (design — map to implementation)

| ID | Requirement | Route / assertion | Status in repo |
|----|-------------|-------------------|----------------|
| **W14-API-01** | Profile create/read for project | PUT + GET `/api/whs/projects/:id/profile`; row in `whs_site_profiles` | **passes** (`w14-whs-baseline.mjs`) |
| **W14-API-02** | Public induction submit | POST `/api/induction/:id/submit` without token → `site_inductions` | **passes** (named W14-API-03 in script — rename for matrix align) |
| **W14-API-03** | Submit links to correct project | Assert `project_id` + project address in PDF path context; wrong UUID → 404 on info | **passes** — cross-project negative shipped |
| **W14-SEC-01** | Public cannot enumerate projects | Invalid/random UUID → 404; no list endpoint; document UUID probe risk | **passes** — W14-DRIFT-007 future token |
| **W14-SEC-02** | Admin/supervisor manage profile | Admin + supervisor PUT 200 | **passes** |
| **W14-SEC-03** | Employee cannot alter profile | Employee PUT → expect **403** | **passes** — role gate applied |
| **W14-API-04** *(shipped extra)* | Generate management plan | POST `.../generate/project_whs_management_plan` | **passes** |
| **W14-API-05** *(shipped extra)* | Win does not auto-create profile | win-finalize → 0 profiles; manual save OK | **passes** |

**npm scripts (shipped):**

```json
"test:w14-whs-baseline": "node scripts/batch-a/run-w14-whs-baseline.mjs",
"test:w14-whs-baseline:write": "node scripts/batch-a/run-w14-whs-baseline.mjs --write"
```

---

## 10. Cleanup handling

| Rule | Detail |
|------|--------|
| **Prefix** | `BLH TEST` via `buildTestJobAddress()` only |
| **Forbidden** | `MARK`, `__BATCH_A__`, `BATCHA`, `BATCH A`, `__E2E__`, `DEBUG`, `DEBUG2`, `DEMO`, `DRYRUN` |
| **DB cleanup** | Test `finally` deletes WHS rows + project/job |
| **Dropbox** | Induction PDF may create job folder — dry-run `npm run test:cleanup-artifacts` after write tests |
| **Destructive** | Never `--confirm` during hardening unless Sam explicitly approves |

---

## 11. Exact next implementation prompt

```
/harden fix P0-C5 — extend W14 baseline tests + close SEC gaps only

1. Read docs/qa/P0_C5_WHS_PROFILE_INDUCTION_PLAN.md
2. Extend scripts/batch-a/w14-whs-baseline.mjs:
   - W14-SEC-03 employee PUT profile → expect 403 (if 200, stop and propose requireRole gate — wait for Sam unless pre-approved)
   - W14-SEC-01 invalid projectId → 404; document no list endpoint
   - W14-API-03 induction row project_id matches fixture; submit to wrong projectId does not attach to fixture
3. Rename test labels to match WORKFLOW_TEST_MATRIX IDs (API-02 = induction submit)
4. Run: npm run test:w14-whs-baseline:write && npm run build && npm run test:cleanup-artifacts (dry-run)
5. Run Batch C regression: w10, w15, w12, w11, w09, batch-a (no --confirm cleanup)
6. Update WORKFLOW_TEST_MATRIX, BUG_REGISTER (W14-SEC-03 if gate added), 30_DAY_HARDENING_TRACKER
7. Do NOT: expand WHS templates, auto-seed on win, change Workforce/procurement/schedule/RFQ/PO/win-finalize
```

---

## 12. Implementation result (2026-06-26 — SEC gap closure)

**Scope:** Narrow security + negative-test gaps only. No WHS redesign, no win-auto-seed, no Workforce/procurement/schedule/RFQ changes.

### Product changes

| Route | Before | After |
|-------|--------|-------|
| `PUT /api/whs/projects/:projectId/profile` | `requireAuth` | `requireAuth` + `requireRole("admin", "supervisor")` |
| `POST /api/whs/projects/:projectId/generate/:templateKey` | `requireAuth` | `requireAuth` + `requireRole("admin", "supervisor")` |
| `GET /api/whs/projects/:projectId/profile` | `requireAuth` | unchanged |
| `GET/POST /api/induction/:projectId/*` | public | unchanged |

**File:** `server/lib/whs/whsEngineRoutes.mjs`

### Tests

**File:** `scripts/batch-a/w14-whs-baseline.mjs` — extended from 12 → **15** assertions.

| ID | Result |
|----|--------|
| W14-SEC-03 | Employee PUT → 403; no DB mutation; employee generate → 403 |
| W14-SEC-02 | Admin + supervisor PUT → 200 |
| W14-SEC-01 | Non-existent UUID → 404; no address leak; submit 404 |
| W14-API-03 | Submit row on supplied project only; cross-project isolation |

**W14-SEC-03 reproduced before fix:** yes (employee PUT would have returned 200 under auth-only gate).

### Future hardening (documented, not implemented)

**W14-DRIFT-007** — Public induction link uses raw project UUID (`/induct/:projectId`). Tokenised induction link recommended before high-scale/public rollout.

### Verification (2026-06-26)

| Command | Result |
|---------|--------|
| `test:w14-whs-baseline:write` | **15/15 pass** |
| `npm run build` | pass |
| `test:cleanup-artifacts` | dry-run — 18 safe BLH TEST, 7 legacy review, 16 skipped; **nothing deleted** |
| `test:w10-procurement-baseline:write` | 13/13 |
| `test:w15-timesheet-auth:write` | 19/19 |
| `test:w12-schedule-auth:write` | pass |
| `test:w11-batch-po:write` | 14 pass |
| `test:w09-ops-readiness:write` | 13 pass |
| `test:batch-a` | 14 pass |
| `test:batch-a:write` | 22 pass |

**P0-C5 status:** **closed** — baseline + SEC gap closure complete.

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-26 | **SEC gap closure shipped** — requireRole gate; 15/15 tests; W14-DRIFT-007 documented |
| 2026-06-25 | P0-C5 planning note — maps W14 routes, gaps, test design; notes baseline tests already shipped |
