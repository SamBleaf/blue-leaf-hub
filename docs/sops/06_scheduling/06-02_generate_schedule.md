---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 06-02: Generate a Schedule with AI

**Module:** Operations → Schedule Manager  
**SOP ID:** 06-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (project managers)

## 2. When to use it
When a project is accepted and you need to create the initial construction schedule. Also when you want to regenerate the schedule after major project changes.

**Warning:** Regenerating a schedule replaces the current one. All existing tasks are soft-deleted and replaced with the new generated tasks. Do not regenerate if the baseline is locked or the project is under construction — use SOP 06-03 to edit existing tasks instead.

## 3. What this does
Sends the project details to an AI (Claude) to generate a structured construction schedule. The AI uses:
- Project type (new build, renovation, extension)
- Accepted trades from the RFQ (if available)
- Buildexact job data (if linked and available)
- Default schedule templates (if no project-specific data available)

Returns a set of tasks grouped by construction phase with start dates, durations, and dependencies pre-calculated from the given start date.

## 4. Before you start
- The project must exist in the system
- Know the desired construction start date (slab/site prep start, not the contract signed date)
- Check whether the project has accepted trades from the RFQ — the AI uses these to refine the task list
- If the baseline is currently locked, unlock it first (SOP 06-04) before regenerating

## 5. Step-by-step process

1. Navigate to Operations → Schedule for the project
2. If no schedule exists yet, a **Generate Schedule** prompt or button will be visible
3. If a schedule exists and you want to regenerate: click **Regenerate** or **New schedule** — confirm you want to replace when prompted
4. Fill in:
   - **Start date** — the construction start date (YYYY-MM-DD or DD/MM/YYYY both accepted)
5. Click **Generate**
6. The AI processes the request (5–20 seconds typical)
7. The new schedule appears in the Gantt view
8. Review the tasks — check phases, durations, and the practical completion date look reasonable
9. Adjust individual tasks as needed (SOP 06-03)
10. Once satisfied, lock the baseline (SOP 06-04)

## 6. What happens next
After generation:
- 30–60 tasks appear grouped across pre-construction, site prep, slab, frame, roofing, lock-up, rough-in, insulation, wall lining, painting, fitout, floor coverings, and completion phases
- Each task has a phase, start date, end date, duration in days, and dependencies (e.g. Lock-up depends on Roofing)
- Practical completion date is calculated automatically from the start date and total build duration
- The previous schedule's tasks are soft-deleted (`deleted_at` set); they are not permanently removed

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Using the contract date instead of the build start date | Confusion about dates | The start date for schedule generation is the date groundworks or site prep begins — not when the contract is signed |
| Regenerating after baseline is locked | Wanting to try again | If the baseline is locked, unlock it first (SOP 06-04) or use the edit tools (SOP 06-03) to adjust specific tasks |
| Not reviewing the output | Trusting AI too much | The AI is a starting point. Always review — check that the PC date is realistic and durations are reasonable for your trades |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "startDate must be YYYY-MM-DD" error | Enter the date in YYYY-MM-DD format (e.g. 2026-07-01) |
| Generation takes > 30 seconds | Check network connection. AI generation is typically 5–15 seconds. If slower, it may be retrying. |
| Generated schedule has generic tasks (not trade-specific) | The project may not have accepted trades linked. Check the RFQ and ensure trades are accepted before regenerating. |
| Practical completion date seems too short or too long | The default template durations are estimates. Adjust task durations in the Sheet view (SOP 06-03) |

## 9. Related modules
- [Schedule Manager overview](06-01_schedule_overview.md) — SOP 06-01
- [Edit a schedule](06-03_edit_schedule.md) — SOP 06-03
- [Lock a baseline](06-04_baseline_lock.md) — SOP 06-04

## 10. Screenshot placeholders
- [ ] Generate Schedule button / panel (before generation)
- [ ] Start date input field
- [ ] Gantt view immediately after a successful generation
- [ ] Example of a generated task list in Sheet view

## 11. Automation notes
- API: `POST /api/schedule/generate` with `{ projectId, startDate, overrides? }`
- Soft-deletes existing tasks: sets `schedule_tasks.deleted_at = now()`
- Sources (in priority order): 1) Buildexact schedule hints if job is linked, 2) accepted trades from `projects.accepted_trades`, 3) default schedule template, 4) hardcoded legacy template
- `schedule_version` increments on every generation (allows history if needed)
- AI generation via `scheduleClaudePlan.mjs` — uses `claude-sonnet-4-6` model

## 12. Edge cases and limits
- The `startDate` field is required — submitting without it returns a 400 validation error
- If the project has no accepted trades and no Buildexact link, the AI falls back to a generic new-build template
- Regeneration while the baseline is locked is allowed by the server but will overwrite baseline dates — always unlock baseline before regenerating
- Very short start dates (e.g. in the past by more than 1 year) may produce unexpected PC dates — always validate the output

## 13. Owner of the process
Admin  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A project exists (does not need a schedule yet)
- [ ] Know the project ID and a valid future start date

### Test cases

**TC-01 — Generate schedule (happy path)**
1. Navigate to Operations → Schedule for a project
2. Click Generate Schedule
3. Enter start date = two weeks from today (YYYY-MM-DD format)
4. Click Generate
5. Expected: schedule appears in Gantt within 20 seconds
6. Expected: at minimum 10 tasks visible, grouped across phases
7. Expected DB: `schedule_tasks` rows with `project_id` = this project's ID and `deleted_at IS NULL`
- [ ] Pass  [ ] Fail

**TC-02 — Start date required**
1. Click Generate Schedule
2. Leave start date blank
3. Click Generate
4. Expected: validation error — no API call sent, or API returns "startDate required"
- [ ] Pass  [ ] Fail

**TC-03 — Schedule version increments on regenerate**
1. Note the current `schedule_version` in DB before the test
2. Regenerate the schedule (confirm overwrite when prompted)
3. Expected DB: old tasks have `deleted_at` set; new tasks have `schedule_version = old_version + 1`
4. Expected: old tasks are NOT permanently deleted — they have a `deleted_at` timestamp
- [ ] Pass  [ ] Fail

**TC-04 — Generated tasks have required fields**
1. After generating, check DB: `SELECT id, phase, start_date, end_date, duration_days, name FROM schedule_tasks WHERE project_id = '<id>' AND deleted_at IS NULL`
2. Expected: all rows have non-null `phase`, `start_date`, `end_date`, `duration_days`, `name`
- [ ] Pass  [ ] Fail

**TC-05 — Practical completion date is logical**
1. Generate a schedule with `start_date = today`
2. Expected: PC (last task `end_date`) is at least 6 months in the future for a new build
3. Expected: PC is not before start date
- [ ] Pass  [ ] Fail

**Feature case — Regenerate replaces tasks, does not duplicate**
1. Generate a schedule (note the task count)
2. Regenerate with a different start date
3. Expected: the Gantt shows a fresh set of tasks only — no duplicates from the first generation
4. Expected DB: first-generation tasks have `deleted_at` set; new tasks have `deleted_at IS NULL`
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Schedule generates without error
- [ ] Correct number of tasks and phases
- [ ] Old tasks soft-deleted (not hard-deleted)
- [ ] All task fields populated
- [ ] PC date is logical relative to start date
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
