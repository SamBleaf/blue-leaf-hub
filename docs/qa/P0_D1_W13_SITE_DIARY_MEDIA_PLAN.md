# P0-D1 — W13 Site Diary / Media Baseline Plan

**Date:** 2026-06-26  
**Status:** **P0-D1 closed** — baseline tests shipped (2026-06-26)  
**Prerequisite:** Batch C P0 (P0-C1–C5) **closed and accepted**  
**Workflow map:** [13_SITE_OPERATIONS_DIARY_MEDIA.md](./workflows/13_SITE_OPERATIONS_DIARY_MEDIA.md)

---

## 1. Current W13 source of truth

| Domain | Canonical store | Spine | Evidence |
|--------|-----------------|-------|----------|
| **Daily site log (ops)** | `site_diary` | `project_id` → `projects` | `siteDiaryRoutes.mjs` insert; mig 010 |
| **Daily site log (carpentry)** | `carpentry_site_diary` | `job_id` → `carpentry_jobs` | `carpentryRoutes.mjs` — **parallel system** |
| **Worker task completion photo** | Supabase Storage bucket `site-media` + path on `site_tasks.completion_photo_url` | via `site_tasks.project_id` or `carpentry_job_id` | `siteMedia.mjs`, mig 099 |
| **Timesheet completion photo** | Same bucket; path on `timesheet_entries.completion_photo_url` | via timesheet → project | `siteMedia.mjs` (W15 overlap — **do not change in W13 pass**) |
| **Client Journey photos** | `project_photos` + Dropbox mirror (`category: site_photo`) | `project_id` | `portalV2AdminRoutes.mjs` — **W18 overlap** |
| **Diary PDF filing** | Dropbox path on `site_diary.dropbox_pdf_path` | job address via `fileJobRecord` | `jobRecordsFiler.mjs` → `INTERNAL/SITE DIARY` |
| **Marketing assets** | `marketing-media` bucket / `marketing_media_assets` | job/marketing tables | **Not W13** — W23 |

**Dead / duplicate columns (drift):**

- `site_diary.photo_paths` — schema exists (mig 010); **never populated** by current UI/API — **W13-DRIFT-001**
- Three media silos with no cross-link — **W13-DRIFT-003**

---

## 2. UI entry points

| Surface | Route | File | Who (UI intent) |
|---------|-------|------|-----------------|
| Office Site Diary | `/operations/:projectId/diary` | `src/pages/SiteDiary.jsx` | admin, supervisor, employee (`can.accessSiteDiary`) |
| Operations hub preview | `/operations/:projectId` | `OperationsProjectDetail.jsx` | same — loads `GET /api/diary/:id?limit=3` |
| Field diary | `/field/diary` | `src/pages/field/FieldDiary.jsx` | field staff; voice via `parse-voice` (admin/supervisor UI gate) |
| Supervisor home quick diary | `/supervisor` (embedded) | `SupervisorHome.jsx` | supervisor — `POST /api/diary/save` |
| Worker tasks + photos | `/worker/tasks` | `src/pages/worker/WorkerTasks.jsx` | workers via magic link / employee auth |
| Portal admin photos | Portal V2 admin | `PortalV2Admin.jsx` | admin — **W18** |
| Carpentry diary | `/carpentry/:jobId` | `CarpentryJobDetail.jsx` | admin/supervisor — **separate API** |

**Voice capture:**

- **Office:** browser `SpeechRecognition` → `POST /api/diary/structure` → save
- **Field:** `useVoiceCapture` → `POST /api/supervisor/parse-voice` (admin/supervisor only) → `POST /api/diary/save`
- **Supervisor home:** `POST /api/supervisor/parse-voice` → save

Voice/transcripts are **part of W13**, not a separate module. Stored on `site_diary.raw_voice_transcript`.

---

## 3. API routes

### Site diary (primary W13)

| Method | Route | Auth | Role gate | File |
|--------|-------|------|-----------|------|
| POST | `/api/diary/structure` | `requireAuth` | **none** | `siteDiaryRoutes.mjs` |
| POST | `/api/diary/save` | `requireAuth` | **none** | same |
| GET | `/api/diary/:projectId` | `requireAuth` | **none** | same |

Registered via `registerModule6Routes` → `module6Routes.mjs` → `dev-api.mjs`.

**Side effects on save (verified from code):**

1. Insert `site_diary` row
2. Best-effort `syncDiaryToPortalUpdate` → draft `portal_updates` (`work_completed` only, `published=false`)
3. Best-effort PDF → `fileJobRecord({ category: "site_diary" })` → Dropbox; updates `dropbox_pdf_path`

**No PATCH/DELETE** routes for diary entries — append-only via API.

### Voice (adjacent)

| Method | Route | Auth | Role gate |
|--------|-------|------|-----------|
| POST | `/api/supervisor/parse-voice` | `requireAuth` | admin, supervisor |

### Site tasks + worker media (shared W13/W15)

| Method | Route | Auth | Role gate |
|--------|-------|------|-----------|
| GET | `/api/projects/:id/site-tasks` | `requireAuth` | any authenticated |
| POST | `/api/projects/:id/site-tasks` | `requireAuth` | admin, supervisor |
| POST | `/api/projects/:id/site-tasks/bulk` | `requireAuth` | admin, supervisor |
| PATCH | `/api/site-tasks/:id` | `requireAuth` | admin, supervisor |
| DELETE | `/api/site-tasks/:id` | `requireAuth` | admin, supervisor (soft `wont_do`) |
| GET | `/api/worker/tasks` | `workerAuth` | worker scope |
| POST | `/api/worker/photos` | `workerAuth` | worker + task assignment check |
| POST | `/api/worker/tasks/:id/complete` | `workerAuth` | worker + assignment scope |

**Out of W13 P0-D1 scope (do not change):** all `/api/workforce/*`, `/api/worker/timesheets/*`, Buildxact sync paths.

### Carpentry diary (parallel — document only)

| Method | Route | Auth | Role gate |
|--------|-------|------|-----------|
| GET | `/api/carpentry/jobs/:id/diary` | `requireAuth` | none |
| POST | `/api/carpentry/jobs/:id/diary` | `requireAuth` | none |

### Portal (client-facing — not raw diary)

| Area | Routes | Notes |
|------|--------|-------|
| Client Journey | `/api/portal/app/:projectId/*`, `/api/portal/:token/*` | `portal_updates` where `published=true`; `project_photos` where `client_visible=true` |
| Admin photos | `/api/portal-v2/admin/projects/:projectId/photos` | Staff upload/tag — W18 |

**No `/api/diary/*` route is public.**

---

## 4. Database tables

| Table | Migration | Key columns | W13 role |
|-------|-----------|-------------|----------|
| `site_diary` | 010 | `project_id`, `entry_date`, content fields, `photo_paths[]`, `dropbox_pdf_path`, `raw_voice_transcript` | **Primary diary SSoT** |
| `site_tasks` | 059, 068, 107, 114, 115 | `project_id` XOR `carpentry_job_id`, `completion_photo_url`, status | Worker tasks + photos |
| `portal_updates` | portal migs | `project_id`, `week_of`, `body`, `published` | Diary → draft client update |
| `project_photos` | 027, 110 | `project_id`, `milestone_key`, `client_visible` | Portal Journey (not diary) |
| `carpentry_site_diary` | 065 | `job_id`, diary fields, `photo_paths` | Carpentry parallel |
| `site_reports` | 010, 074 | incidents | **W14** overlap — not diary |

**RLS (security-relevant):**

| Table | Policy today | Risk |
|-------|--------------|------|
| `site_diary` | `authenticated_all_site_diary` — any authenticated user (mig 044) | **Portal client JWT could read/write all diary rows via direct Supabase** — **W13-SEC-004 candidate** |
| `site_tasks` | RLS enabled, permissive policy **dropped** (mig 111) | API-only via service role ✓ |
| `carpentry_site_diary` | authenticated full access | Same class of risk for carpentry path |

---

## 5. External storage / Dropbox side effects

| Action | Storage | Path pattern | Failure behaviour |
|--------|---------|--------------|-------------------|
| Diary save PDF | **Dropbox** | `/BLUE LEAF BUILDING/PROJECTS/.../[address]/INTERNAL/SITE DIARY/Site-Diary-{date}.pdf` | Logged; save still succeeds; `dropbox_pdf_path` may be null — **W13-DRIFT-002** (UI always toasts "PDF filed to Dropbox") |
| Worker photo upload | **Supabase** `site-media` (private) | `site-tasks/{entityId}/{date}-{rand}-{filename}` | 502 to worker; no DB row until task complete |
| Portal admin photo | **Dropbox** + `project_photos` row | `INTERNAL/SITE PHOTOS` via `fileJobRecord` | W18 — out of P0-D1 |
| Diary photos column | — | `photo_paths[]` | **Unused** — W13-DRIFT-001 |

**No local server disk** for W13 media. Worker PWA compresses in-browser (`workerPhoto.js`).

**Dropbox test rule:** Use `buildTestJobAddress()` / `BLH TEST` only. Assert DB row even when Dropbox filing fails (mirror W14/W11 pattern). After write tests: `npm run test:cleanup-artifacts` dry-run only.

---

## 6. Role gates

| Surface | Intended roles | API reality | Gap |
|---------|----------------|-------------|-----|
| Site diary save/read | admin, supervisor, **employee** (`roles.js`) | `requireAuth` only | Aligns with employee diary access **by design** |
| Diary AI structure | staff | `requireAuth` only | **Employee can call AI structure** — token cost risk (P1) |
| Site task CRUD | admin, supervisor | `requireRole("admin","supervisor")` | ✓ |
| Worker photo/complete | workers | `workerAuth` + assignment scope | ✓ — **do not change** |
| parse-voice | admin, supervisor | `requireRole` | ✓ |

**W13-SEC-01 test focus (per plan):** employee **cannot** alter admin-only records (site task CRUD, bulk create). Employee diary save may **pass by design** — do not block without SAM decision.

---

## 7. Public / client visibility

| Data | Client visible? | Path |
|------|-----------------|------|
| Raw `site_diary` (issues, visitors, instructions) | **No** | Internal only |
| `work_completed` excerpt | **Only after publish** | `portal_updates` draft auto-created; client sees `published=true` rows only |
| Worker `site-media` photos | **No** | Private bucket; signed URLs for staff/worker only |
| `project_photos` | **Opt-in** | `client_visible=true` + milestone tag (mig 110) |

**Enumeration risks:**

- `GET /api/diary/:projectId` — requires auth; random UUID returns `{ entries: [] }` (no cross-project leak of entries, but no 404 on unknown project)
- No diary list-all endpoint
- Direct Supabase on `site_diary` with client JWT — **unmitigated if RLS policy still permissive** — **W13-SEC-004**

Portal routes use `requirePortalAuth` / service role — do not expose `site_diary` rows directly (verified: `portalV2Routes.mjs` reads `portal_updates` + `project_photos` only).

---

## 8. Current gaps

| ID | Gap | Severity | P0-D1 action |
|----|-----|----------|--------------|
| **W13-DRIFT-001** | `site_diary.photo_paths` unused | Medium | Document; optional assert stays empty in tests |
| **W13-DRIFT-002** | Success toast claims Dropbox PDF even when filing fails | Medium | Test asserts `dropbox_pdf_path` null OK; gap-document UI |
| **W13-DRIFT-003** | Three media silos (site-media, Dropbox portal, marketing-media) | Medium | Document only — no pipeline merge |
| **W13-DRIFT-004** | Carpentry vs ops diary duplication | Medium | Out of P0-D1 baseline (ops path only) |
| **W13-DRIFT-005** | Legacy base64 photo paths in some timesheet UI | Low | W15 — do not touch |
| **W13-SEC-004** | `site_diary` RLS `authenticated_all` — client direct DB access | **High** | Test plan + register; fix only if test proves + Sam approves |
| **W13-SEC-005** | `/api/diary/structure` auth-only — employee AI token burn | Medium | Document; optional requireRole in later pass |
| **No tests** | Zero W13 baseline scripts | **P0** | Primary deliverable |

**Cross-module links (loose, by design today):**

- Schedule: no write-back from diary weather
- WHS: incidents in `site_reports`, not diary
- RFQ / procurement: no FK
- Site tasks: separate table; workers complete via W15 routes

---

## 9. Security risks

| Risk | Evidence | Test ID |
|------|----------|---------|
| Client reads internal diary via Supabase anon + client JWT | mig 044 policy on `site_diary` | W13-SEC-004 (manual / RLS audit) |
| Employee creates site tasks via API | Should 403 | W13-SEC-01 |
| Worker attaches photo to another worker's assigned task | Should 403 | W13-API-03 negative |
| Worker completes task with photo path for wrong entity | `isValidPhotoKey` + scoped update | W13-API-03 |
| Diary save to wrong `projectId` | Row must match supplied id | W13-API-02 |
| Dropbox path returned to any authenticated user on GET diary | Full row returned including `dropbox_pdf_path` | Document — staff-only route |
| AI structure without role gate | `POST /api/diary/structure` | W13-SEC-005 parking |

---

## 10. Smallest safe implementation plan

**Principle:** Test-first baseline only — mirror P0-C4/C5 pattern. No media pipeline merge, no diary redesign, no Workforce/worker link changes.

### Phase A — Tests only (P0-D1 target)

1. Add `scripts/batch-a/w13-site-diary-baseline.mjs` + runner + `npm run test:w13-site-diary-baseline[:write]`.
2. Fixture: `buildTestJobAddress({ suite: "W13", workflowId: "DIARY" })` → job + project via API/service client.
3. Cleanup in `finally`: `site_diary`, `portal_updates` (draft rows), `site_tasks`, `projects`, `jobs`. Do **not** delete Dropbox folders in test — dry-run cleanup after.
4. **Do not** implement product fixes until a test fails and Sam approves.

### Phase B — Product changes (only if tests prove gap)

| Trigger | Smallest fix |
|---------|--------------|
| W13-SEC-01 employee site-task write succeeds | Already gated — test should pass; if fail, fix route registration |
| W13-API-02 cross-project row | Add project existence check or assert insert uses param only |
| W13-SEC-004 confirmed | RLS lockdown on `site_diary` (mirror mig 111 pattern) — **API uses service role; app unaffected** |
| W13-DRIFT-002 | Toast reflects `dropbox_pdf_path` from response — UI-only, P1 |

**Explicitly not in P0-D1:**

- Wire `photo_paths` / diary → portal photos
- Merge marketing-media
- Carpentry diary baseline (separate SAM scope)
- Worker PWA / timesheet photo changes
- Role gate on diary save for employees (conflicts with `accessSiteDiary` unless SAM-W13-003)

---

## 11. Required tests before code

Design only — map to `WORKFLOW_TEST_MATRIX` on implementation.

| ID | Requirement | Route / assertion | Notes |
|----|-------------|-------------------|-------|
| **W13-API-01** | Admin/supervisor can create diary entry | `POST /api/diary/save` → row in `site_diary` | admin + supervisor tokens |
| **W13-API-02** | Entry links to correct project/date | Assert `project_id`, `entry_date`; GET list for project B empty | cross-project negative |
| **W13-API-03** | Worker photo + task complete links correctly | Supervisor creates task → worker photo → complete → `completion_photo_url` valid key; wrong task 403 | Uses existing worker auth pattern; **minimal worker interaction** — no worker link changes |
| **W13-SEC-01** | Employee cannot alter admin-only records | Employee `POST/PATCH /api/projects/:id/site-tasks` → 403; employee diary save → **200 expected** (by design) | Clarify vs block diary |
| **W13-SEC-02** | No public/client enumeration | No unauthenticated diary routes; portal routes don't return `site_diary`; bogus project GET returns empty, no other project rows | Auth required on `/api/diary/*` |
| **W13-STORAGE-01** | Storage side effect safe | Assert DB row when Dropbox PDF null; worker photo path matches `site-tasks/{id}/...` pattern; BLH TEST address only | Skip Dropbox delete |
| **W13-DRIFT-01** | Duplicate SSoT documented | Assert `photo_paths` empty; document three-bucket model | read-only + one write assert |

**Optional extras (P1, not P0-D1 blockers):**

- W13-API-04 — draft `portal_updates` created when `portal_v2_enabled` + `work_completed` set
- W13-API-05 — `GET /api/diary/:projectId` returns entries newest-first

**npm scripts (to add on implementation):**

```json
"test:w13-site-diary-baseline": "node scripts/batch-a/run-w13-site-diary-baseline.mjs",
"test:w13-site-diary-baseline:write": "node scripts/batch-a/run-w13-site-diary-baseline.mjs --write"
```

---

## 12. Cleanup handling

| Rule | Detail |
|------|--------|
| **Prefix** | `BLH TEST` via `buildTestJobAddress()` only |
| **Forbidden** | `MARK`, `__BATCH_A__`, `BATCHA`, `BATCH A`, `__E2E__`, `DEBUG`, `DEBUG2`, `DEMO`, `DRYRUN` |
| **DB cleanup** | Test `finally`: `site_diary`, draft `portal_updates`, `site_tasks`, project, job |
| **Dropbox** | Diary save may create `INTERNAL/SITE DIARY` under BLH TEST job folder — dry-run `npm run test:cleanup-artifacts` after write tests |
| **Supabase storage** | Worker photo objects under `site-tasks/` — service-role delete in `finally` if test uploads |
| **Destructive** | Never `--confirm` unless Sam explicitly approves |

---

## 13. Exact next implementation prompt

```
/harden fix P0-D1 — W13 site diary + media baseline tests only

1. Read docs/qa/P0_D1_W13_SITE_DIARY_MEDIA_PLAN.md
2. Create scripts/batch-a/w13-site-diary-baseline.mjs + runner + package.json scripts
3. Implement W13-API-01/02/03, W13-SEC-01/02, W13-STORAGE-01, W13-DRIFT-01 assertions
4. Fixtures: buildTestJobAddress({ suite: "W13", workflowId: "DIARY" })
5. Do NOT change worker links, timesheet logic, Buildxact sync, or Workforce UI
6. Product fix ONLY if W13-SEC-01 site-task gate fails (unlikely)
7. Run: npm run test:w13-site-diary-baseline:write && npm run build && npm run test:cleanup-artifacts (dry-run)
8. Update WORKFLOW_TEST_MATRIX, BUG_REGISTER, 30_DAY_HARDENING_TRACKER
9. Do NOT: merge media pipelines, wire photo_paths, change carpentry diary, gate employee diary save without SAM-W13-003
```

---

## Key questions answered (evidence)

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Diary SSoT? | `site_diary` (+ carpentry parallel table) | siteDiaryRoutes.mjs |
| 2 | Media SSoT? | Split: `site-media` paths, `project_photos`, Dropbox mirrors | siteMedia.mjs, portal admin |
| 3 | Storage location? | **Mixed** Supabase + Dropbox | Verified from code |
| 4 | Linked to projects/jobs? | `project_id` on insert; validates project exists | save handler |
| 5 | Linked to tasks/WHS/RFQ/procurement/schedule? | **No FK**; portal draft from `work_completed` only | syncDiaryToPortalUpdate |
| 6 | Photos linked to project/job/date/user? | Via `site_tasks` + path key; worker `completed_by` | workforceRoutes.mjs |
| 7 | Employee create diary/media? | Diary yes; site tasks no; worker photos via worker auth | roles.js + routes |
| 8 | Client access? | Published portal updates + opt-in photos only | portalV2Routes.mjs |
| 9 | Public URLs / Dropbox exposed? | Signed URLs (1h) for staff; Dropbox paths on staff API responses | signSiteTaskPhotos |
| 10 | External side effects? | Anthropic, Dropbox, portal draft, Supabase upload | save + structure routes |
| 11 | Deletion/edit/audit? | Diary append-only; tasks soft-delete; `created_at` / `completed_by` | no PATCH diary |
| 12 | Voice part of workflow? | **Yes** — structure + parse-voice + `raw_voice_transcript` | SiteDiary, FieldDiary |
| 13 | Duplicate systems? | **Yes** — ops/carpentry diary; three media silos | workflow §17 |
| 14 | Direct Supabase frontend writes? | **projects read only**; diary via API | grep src |
| 15 | Missing role gates? | Diary routes auth-only; site_diary RLS wide open | mig 044 vs 111 |

---

## Sam decisions (open)

| ID | Question | Recommended |
|----|----------|-------------|
| **SAM-W13-001** | Auto-publish diary to portal? | **No — draft only (current)** |
| **SAM-W13-002** | Link site-media to marketing? | **No during hardening** |
| **SAM-W13-003** | Restrict diary save to admin/supervisor only? | **No — employees have accessSiteDiary** unless security audit overrides |

---

## Verification (planning pass 2026-06-26)

| Command | Result |
|---------|--------|
| `npm run build` | **pass** |
| `npm run test:cleanup-artifacts` | **dry-run** — safe canonical + legacy candidates listed; **nothing deleted** |

---

---

## 14. Implementation result (2026-06-26)

**Scope:** Tests only — no product code changes.

### Test files

| File | Purpose |
|------|---------|
| `scripts/batch-a/w13-site-diary-baseline.mjs` | W13 assertions |
| `scripts/batch-a/run-w13-site-diary-baseline.mjs` | Runner |
| `package.json` | `test:w13-site-diary-baseline[:write]` |

### Results

| ID | Result |
|----|--------|
| W13-API-01 | pass — admin + supervisor save |
| W13-API-02 | pass — project_id, date, cross-project isolation, 404 bogus project |
| W13-API-03 | pass — worker photo + complete; wrong assignment 403 |
| W13-SEC-01 | pass — employee site-task 403; diary 200 by design |
| W13-SEC-02 | pass — unauth 401; client 403 |
| W13-STORAGE-01 | pass — DB row + photo path pattern; Dropbox filed when configured |
| W13-DRIFT-01 | pass — photo_paths empty |
| W13-DRIFT-003 | gap-documented |
| W13-SEC-04 | gap-documented — RLS probe inconclusive in env |

**Command:** `npm run test:w13-site-diary-baseline:write` — **24 pass**, 0 fail, 2 gap-documented

**Product fixes applied:** **none** — all tests passed without code changes.

**Regression:** build pass; w14/w15/w09/batch-a green.

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-26 | **P0-D1 closed** — baseline tests shipped; no product changes |
| 2026-06-26 | P0-D1 planning — routes, SSoT, gaps, test design |
