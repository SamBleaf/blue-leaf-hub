# Workflow 12 — Scheduling / Critical Path / EOT

**Status:** Mapped (2026-06-25) — documentation only  
**Related:** [10_PROCUREMENT_PLANNING_REGISTER.md](./10_PROCUREMENT_PLANNING_REGISTER.md), [09_TENDER_WIN_OPERATIONS_HANDOFF.md](./09_TENDER_WIN_OPERATIONS_HANDOFF.md), [BATCH_C_REVIEW_PACK.md](../BATCH_C_REVIEW_PACK.md)

**Starts after:** W09 — `projects` row exists  
**Hands off to:** W10 (procurement dates), W13 (site tasks timing), W18 (portal schedule view)

---

## 1. Business purpose

Manual **construction programme** per project: generate, edit, baseline, typed dependencies, critical path display, EOT claims, procurement lead-time on tasks, PDF export/analysis.

**Verified from SOP/docs:** `docs/sops/06_scheduling/` (06-01–06-08, untested)

---

## 2. Start trigger

| Trigger | Surface |
|---------|---------|
| Staff opens Schedule Manager | `/operations/:projectId/schedule` |
| User clicks Generate | `POST /api/schedule/generate` |
| **NOT on win** | No auto `schedule_tasks` — **W12-DRIFT-001** |

---

## 3. End state

| End state | Artefact |
|-----------|----------|
| Active programme | `schedule_tasks` rows for `project_id` |
| Baseline locked | `baseline_*` dates + `projects.schedule_baseline_locked_at` |
| EOT applied (optional) | `schedule_eot` + shifted task dates |
| Procurement linked | W10 items with `related_schedule_task_id` |

---

## 4. Primary users

| User | Role |
|------|------|
| Admin / supervisor | Generate, edit, baseline, EOT |
| Employee | View schedule (UI); **API write gap** — W12-DRIFT-002 |
| Client | Read-only schedule % via portal |

---

## 5. Current UI surfaces

| Screen | Route | File |
|--------|-------|------|
| ScheduleManager | `/operations/:projectId/schedule` | `ScheduleManager.jsx` |
| Gantt / Sheet / Delays / Dep Map | Tabs | `src/components/schedule/*` |
| Operations hub alerts | `/operations/:projectId` | Schedule health + links |
| Global Gantt | `/operations` | `OperationsList.jsx` |

---

## 6. Backend routes / APIs

**Primary:** `server/lib/scheduleRoutes.mjs` (via `module6Routes.mjs`)

| Area | Key routes |
|------|------------|
| Generate | `POST /api/schedule/generate` |
| CRUD | `GET/POST/PATCH/DELETE /api/schedule/:projectId/task*` |
| Baseline | `POST .../baseline/lock`, `DELETE .../baseline` |
| EOT | `GET/POST/PATCH /api/schedule/:projectId/eot`, `POST .../eot/:id/apply` |
| Ripple | `POST .../ripple-check` |
| Templates | `/api/schedule/templates` |
| AI | `/analyse`, `/task-advice` |
| Procurement tasks view | `GET .../procurement` |

**Operations:** `operationsRoutes.mjs` — global tasks, trade conflicts, project health.

---

## 7. Database tables

| Table | Migration | Notes |
|-------|-----------|-------|
| `schedule_tasks` | 010, 011, 025, 026, 037, 072, 085 | Primary task store; soft delete |
| `schedule_eot` | 025 | EOT claims |
| `schedule_templates` | 014 | Template library |
| `projects.schedule_baseline_locked_at` | 025 | Baseline lock |

**Dependencies:** Typed deps in `task_dependencies` JSONB (026); legacy `depends_on uuid[]`.

**No separate `task_dependencies` table.**

---

## 8. External integrations

| Integration | Role |
|-------------|------|
| **Anthropic** | AI schedule generate + analysis |
| **Buildxact estimates** | Hints, line matching |
| **Dropbox** | Analysis/Gantt PDF export |
| **Procurement (W10)** | Cascade sync on date changes |
| **Mail** | Milestone/reminder emails (`scheduleReminders.mjs`) |
| **Portal** | Read schedule completion % |

**Weather:** EOT reason code `"weather"` in UI; site diary weather (W13) **not** auto-wired to schedule.

---

## 9. Source of truth

| Fact | Store |
|------|-------|
| Task dates & deps | `schedule_tasks` |
| Typed dependencies | `task_dependencies` JSONB (**Verified from SOURCE_OF_TRUTH.md**) |
| Critical path (UI) | Client `computeCriticalPath()` in `scheduleUtils.js` |
| Critical path (persisted) | `is_critical_path` at generate — **may disagree with UI** |
| EOT claims | `schedule_eot` |
| Order-by (materials) | `procurement_items` — not `schedule_tasks.order_by_date` (085 deprecates) |

---

## 10. Happy path

1. W09 win → open Schedule Manager.
2. Set start date → Generate (AI → categories → template fallback).
3. Review Gantt/Sheet/Dep Map; lock baseline.
4. Edit tasks; ripple preview; apply date shifts.
5. Procurement regenerate (W10) picks up task dates.
6. On delay → Delays tab → raise EOT → approve → apply shift.

---

## 11. Failure paths

| Failure | Evidence |
|---------|----------|
| No AI key | Falls back to template/categories |
| Regenerate | Soft-deletes prior tasks (`deleted_at`) |
| Cyclic deps | Ripple may infinite loop — **W12-DRIFT-003** |
| Typed deps on save | Server cascade FS-only via `depends_on` — **W12-DRIFT-004** |
| EOT apply | Shifts **all** tasks bluntly — **W12-DRIFT-005** |
| Employee API write | `requireAuth` only — **W12-DRIFT-002** |

---

## 12. Manual workarounds

- Regenerate schedule after major scope change (accepts soft-delete history).
- Manually fix tasks when ripple wrong for typed deps.
- Re-run W10 generate after schedule moves.
- Use Sheet view when Gantt performance slow.

---

## 13. Cross-module dependencies

| Module | Link |
|--------|------|
| W09 | `project_id`, `accepted_trades` as generate input |
| W10 | `related_schedule_task_id`, staleness trigger 097 |
| W11 | PO `scheduled_completion` |
| W13 | Site diary weather not linked |
| W18 | Portal schedule badge |

---

## 14. Data ownership

| Table | W12 owns |
|-------|----------|
| `schedule_tasks` | Full CRUD |
| `schedule_eot` | EOT lifecycle |
| `schedule_templates` | Template library |
| `procurement_items` dates | **Updates via cascade** — W10 owns register |

---

## 15. Current tests

| Test | Status |
|------|--------|
| `scripts/test-critical-paths.mjs` | Partial smoke |
| E2E schedule | **missing** |
| Adversarial audit | Schedule auth, ripple, EOT documented |

---

## 16. Missing tests

| ID | Purpose |
|----|---------|
| W12-API-01 | Generate creates tasks for project |
| W12-API-02 | Baseline lock/reset |
| W12-API-03 | EOT raise → approve → apply |
| W12-API-04 | Ripple-check typed deps |
| W12-API-05 | Procurement cascade on task move |
| W12-SEC-01 | Employee cannot PATCH tasks via API |

---

## 17. Confirmed drift items

| ID | Risk |
|----|------|
| **W12-DRIFT-001** | No schedule on win (W09-DRIFT-007) |
| **W12-DRIFT-002** | Schedule API auth — employee can write |
| **W12-DRIFT-003** | Ripple cycle guard missing |
| **W12-DRIFT-004** | Server cascade ignores typed deps |
| **W12-DRIFT-005** | EOT apply shifts all tasks |
| **W12-DRIFT-006** | Dual critical path implementations |
| **W12-DRIFT-007** | Legacy schedule procurement fields vs W10 register |

---

## 18. Unconfirmed risks

- AI-generated durations for unusual project types.
- Global Gantt performance at 20+ active projects.
- Client portal schedule % when tasks empty.

---

## 19. P0 candidates

| Item | Notes |
|------|-------|
| W12-SEC-01 role gate on writes | Security |
| W12-API-01 generate baseline test | No coverage |
| Ops readiness "schedule started" flag | P0-B5 |

---

## 20. P1/P2 candidates

| Item | Priority |
|------|----------|
| Typed-dep server cascade | P1 |
| EOT selective apply | P2 |
| Critical path single implementation | P2 |
| Weather → schedule link | P2 |

---

## 21. Sam decisions needed

| ID | Question | Recommended |
|----|----------|-------------|
| **SAM-W12-001** | Auto-generate schedule on win? | **No during hardening** |
| **SAM-W12-002** | EOT apply: all tasks vs downstream only? | **Document current; refine P2** |

---

## 22. Recommended hardening stance

Test generate + baseline + EOT lifecycle before ripple/critical-path refactors. Add API role gates. Do not auto-seed schedule on win.

---

## 23. Next safe action

W12-API-01 skeleton after P0-C approval.

---

## Key questions answered

| Question | Answer |
|----------|--------|
| Where stored? | `schedule_tasks`, `schedule_eot` |
| Initial schedule? | Manual `POST /api/schedule/generate` |
| Dependencies enforced? | **Partial** — typed in UI; server cascade FS/`depends_on` only |
| Lead times → procurement? | Cascade + W10 register |
| Weather used? | EOT reason only; not auto-adjust |
| EOT tracked? | **Yes** — Delays tab + `schedule_eot` |
| Critical path? | **Visual + computed** — dual implementations |
| Date changes after POs? | Manual coordination; reminders may fire |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | W12 mapped — Batch C |
