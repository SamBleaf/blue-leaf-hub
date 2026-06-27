# Workflow 13 — Site Operations / Site Diary / Media

**Status:** Mapped (2026-06-25) — documentation only  
**Related:** [12_SCHEDULING_CRITICAL_PATH_EOT.md](./12_SCHEDULING_CRITICAL_PATH_EOT.md), [14_WHS_INDUCTIONS_SWMS_INCIDENTS.md](./14_WHS_INDUCTIONS_SWMS_INCIDENTS.md), [BATCH_C_REVIEW_PACK.md](../BATCH_C_REVIEW_PACK.md)

**Starts after:** W09 — active `projects` row  
**Hands off to:** W18 (portal updates/photos), W23 (marketing media — separate pipeline)

---

## 1. Business purpose

Capture **daily site activity**: structured diary entries, voice→AI structuring, site tasks for workers, completion photos. Supports client updates and internal record-keeping.

**Verified from SOP/docs:** `docs/sops/07_site_diary/` (07-01–07-03)

---

## 2. Start trigger

| Trigger | Surface |
|---------|---------|
| Supervisor writes diary | `/operations/:projectId/diary` |
| Field staff diary | `/field/diary` |
| Worker completes site task | `/worker/tasks` + photo upload |
| **NOT on win** | No auto diary seed |

---

## 3. End state

| End state | Store |
|-----------|-------|
| Diary entry saved | `site_diary` row |
| PDF filed (optional) | Dropbox via `jobRecordsFiler` |
| Portal draft update | `portal_updates` (unpublished) |
| Task completed | `site_tasks.status` + `completion_photo_url` |
| Photos | `site-media` bucket paths |

---

## 4. Primary users

| User | Surface |
|------|---------|
| Supervisor / admin | Office SiteDiary |
| Field supervisor | FieldDiary, FieldTasks |
| Site workers | Worker PWA tasks + photos |
| Client (indirect) | Portal Journey via published updates/photos |

---

## 5. Current UI surfaces

| Screen | Route | File |
|--------|-------|------|
| Site Diary | `/operations/:projectId/diary` | `SiteDiary.jsx` |
| Operations hub preview | `/operations/:projectId` | `OperationsProjectDetail.jsx` (3 entries) |
| Field diary | `/field/diary` | `FieldDiary.jsx` |
| Worker tasks | `/worker/tasks` | `WorkerTasks.jsx` |
| Portal admin photos | Portal admin | `PortalV2Admin.jsx` |
| Carpentry diary | `/carpentry/:jobId` | `CarpentryJobDetail.jsx` (parallel spine) |

---

## 6. Backend routes / APIs

| Route | File | Purpose |
|-------|------|---------|
| `POST /api/diary/structure` | `siteDiaryRoutes.mjs` | AI structure transcript |
| `POST /api/diary/save` | same | Insert entry, PDF, portal sync |
| `GET /api/diary/:projectId` | same | List entries |
| `POST /api/supervisor/parse-voice` | `supervisorRoutes.mjs` | Field voice parse |
| `GET/POST /api/projects/:id/site-tasks` | `workforceRoutes.mjs` | Site tasks CRUD |
| `POST /api/worker/photos` | `workforceRoutes.mjs` | `site-media` upload |
| `POST /api/worker/tasks/:id/complete` | same | Task + photo |
| Portal photos | `portalV2AdminRoutes.mjs` | Journey media |

---

## 7. Database tables

| Table | Migration | Spine |
|-------|-----------|-------|
| `site_diary` | 010 | `project_id` |
| `site_tasks` | 059, 068, 107, 114, 115 | `project_id` XOR `carpentry_job_id` |
| `site_reports` | 010, 074 | Incidents overlap W14 |
| `project_photos` | 027, 110 | Portal Journey |
| `portal_updates` | portal migrations | Diary → draft client update |
| `carpentry_site_diary` | 065 | Separate carpentry spine |

**Note:** `site_diary.photo_paths` exists in schema but **not populated** by current UI — **W13-DRIFT-001**.

---

## 8. External integrations

| Integration | Role |
|-------------|------|
| **Anthropic** | Diary structure AI |
| **Dropbox** | Diary PDF, portal photos, WHS incident photos |
| **Supabase Storage `site-media`** | Worker task/timesheet photos |
| **`marketing-media`** | **Separate** — marketing Content Studio only |
| **Portal v2** | Draft updates from diary text |

---

## 9. Source of truth

| Fact | Store |
|------|-------|
| Daily site log | `site_diary` |
| Worker to-do | `site_tasks` |
| Task completion photo | `site-media` path on `site_tasks` |
| Client Journey photos | `project_photos` + Dropbox |
| Marketing assets | `marketing_media_assets` — **not W13** |

---

## 10. Happy path

1. Supervisor opens Site Diary → voice or type → AI structure → save.
2. Entry → `site_diary` + PDF to Dropbox + draft `portal_updates`.
3. Supervisor creates site tasks → workers see on PWA → complete with photo.
4. Admin uploads/tags portal photos for client Journey.
5. Ops hub shows diary preview + site task counts.

---

## 11. Failure paths

| Failure | Evidence |
|---------|----------|
| Dropbox PDF fail | UI still shows success toast — **W13-DRIFT-002** |
| No project_id on media | Upload routes require project context |
| Diary photos unused | `photo_paths` column dead — **W13-DRIFT-001** |
| Three media silos | No cross-link site-media ↔ portal ↔ marketing |

---

## 12. Manual workarounds

- Upload portal photos separately for client Journey (diary photos not wired).
- Use Dropbox folders directly if PDF filing fails.
- Carpentry jobs use carpentry diary path, not ops `site_diary`.

---

## 13. Cross-module dependencies

| Module | Link |
|--------|------|
| W09 | `project_id` from win |
| W12 | Schedule alerts reference site timing; diary weather not fed back |
| W14 | `site_reports` incidents separate from diary |
| W15 | Site tasks + worker photos in workforce routes |
| W18 | Portal drafts and photos |
| W21 | Carpentry parallel diary/tasks |

---

## 14. Data ownership

| Table | W13 owns |
|-------|----------|
| `site_diary` | Diary entries |
| `site_tasks` | Shared with W15 (workforce routes) |
| `project_photos` | Shared with W18 |

---

## 15. Current tests

| Test | Status |
|------|--------|
| E2E site diary | **missing** |
| SOP 07-* | untested |

---

## 16. Missing tests

| ID | Purpose |
|----|---------|
| W13-API-01 | diary save creates row |
| W13-API-02 | portal draft sync |
| W13-API-03 | worker photo upload + task complete |
| W13-API-04 | project_id required on site tasks |
| W13-E2E-01 | diary → portal draft visible in admin |

---

## 17. Confirmed drift items

| ID | Risk |
|----|------|
| **W13-DRIFT-001** | `site_diary.photo_paths` unused |
| **W13-DRIFT-002** | Success toast when Dropbox PDF fails |
| **W13-DRIFT-003** | Three media silos (site-media, Dropbox, marketing-media) |
| **W13-DRIFT-004** | `supervisor_tasks` ≠ `site_tasks` naming confusion |
| **W13-DRIFT-005** | Worker timesheet photos still base64 path in some UI |

---

## 18. Unconfirmed risks

- PII in voice transcripts retention.
- Portal draft auto-publish expectations vs manual review.

---

## 19. P0 candidates

| Item | Notes |
|------|-------|
| W13-API-01 save baseline | No tests |
| Fix Dropbox failure toast | Small UX fix — P1 |

---

## 20. P1/P2 candidates

| Item | Priority |
|------|----------|
| Wire diary photos → portal Journey | P2 |
| Unify media pipeline docs | P1 |
| Field vs office diary parity | P2 |

---

## 21. Sam decisions needed

| ID | Question | Recommended |
|----|----------|-------------|
| **SAM-W13-001** | Auto-publish diary to portal or always draft? | **Draft — current behaviour** |
| **SAM-W13-002** | Link site-media to marketing library? | **No during hardening** |

---

## 22. Recommended hardening stance

Map and test diary save + site task photo path. Do not merge media pipelines during hardening. Document three-bucket model for staff.

---

## 23. Next safe action

W13-API-01 skeleton after P0-C approval.

---

## Key questions answered

| Question | Answer |
|----------|--------|
| Diary storage? | `site_diary` on `project_id` |
| Who creates? | Supervisors (office/field); workers do tasks not diary |
| Photos linked to jobs? | Via `project_id` on tasks; diary photos column unused |
| Marketing connection? | **No direct link** — separate `marketing-media` |
| Site issues tracked? | Diary `issues` field; WHS incidents in W14 `site_reports` |
| Connected to schedule/WHS? | **Loose** — ops alerts only; weather in diary not schedule input |
| Missing project_id? | Routes require project context for ops path |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | W13 mapped — Batch C |
