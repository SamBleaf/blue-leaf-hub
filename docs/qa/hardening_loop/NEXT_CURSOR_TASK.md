# NEXT CURSOR TASK

**Task ID:** `UI-UX-WAVE-01A-FOLLOWUP` · **Mode:** no-code diagnosis + test-only coverage
**Date issued:** 2026-06-28 · **Issued by:** Claude Code (Hardening Controller)
**Why now:** This work needs **no Sam approval** (safe autonomous classes) and de-risks the
Wave 01B plan, which is queued separately for Sam's approval. Do **not** start 01B polish here.

## Objective
Resolve the three classification unknowns from Wave 01A and close the CRM coverage gap, so the
01B plan and the deploy-blocker list are correct before any product code is touched.

## Preflight
- `git branch --show-current` → `portal-v2`; `git status --short` → clean (or only loop docs).
- `npm run hardening:watch -- --dry-run` → expect READY, next: cursor.

## Tasks

### 1. Root-cause UI-FIELD-001 / UI-FIELD-002 (READ-ONLY diagnosis)
- Read the Field WHS + Field Diary components and the UI-Review route/fixture that feeds them
  (`e2e/ui-review/**`, the `/field/whs` + `/field/diary` review-mode data path).
- Determine: is `projects.map/find is not a function` caused by the **UI-Review fixture** passing
  a non-array, or by the **component** assuming an array the live API may not return?
- **If fixture-only:** fix the fixture (test-only, allowed), re-run `npm run test:ui-review`,
  update evidence + lock matrix, and **downgrade** UI-FIELD-001/002 (not a real deploy blocker).
- **If component bug:** **DO NOT fix it.** Record the root cause + the exact file/line, keep
  severity High + deploy-blocking, and mark for **Fix Agent under Sam approval**.
- Either way, write the verdict into BUG_REGISTER (update the two entries' Status).

### 2. Diagnose UI-PORTAL-002 (READ-ONLY)
- Determine whether a pending client selection is supposed to surface in the portal **action
  queue** (a behaviour/data-feed gap → Fix Agent under Sam) or whether the greeting/action-card
  mismatch is **copy only** (→ 01B). Record the verdict; **do not fix.**

### 3. Close UI-CRM-001 — CRM coverage (TEST-ONLY)
- Add CRM / Relationships / contacts (+ mailing-list settings) routes to the UI-Review harness
  (`e2e/ui-review/routes.mjs`) with fixtures, using the **existing** UI-Review fixture mechanism.
- **If rendering CRM in review mode requires a product-code change** (e.g. CrmDashboard has no
  review-mode data path), **STOP and log** — do not change product code; flag for Sam.
- Re-run `npm run test:ui-review`; capture desktop + mobile CRM screenshots; update
  [../ui_review/UI_SCREEN_EVIDENCE_INDEX.md](../ui_review/UI_SCREEN_EVIDENCE_INDEX.md) and set the
  CRM row in [../ui_review/UI_MODULE_LOCK_MATRIX.md](../ui_review/UI_MODULE_LOCK_MATRIX.md)
  (LOCKED/CONDITIONAL/NO-GO). Resolve/close UI-CRM-001 accordingly.

### 4. (Optional, test-only) Disambiguate empty vs thin data
- Enrich the workforce + finance UI-Review fixtures so empty-state vs populated-state is
  unambiguous, confirming UI-FINANCE-001 / UI-WORKFORCE-001 are copy/empty-state issues (01B) and
  not data-load bugs. Test-only.

## Allowed files
- `e2e/ui-review/**`, `e2e/tests/visual/**` (fixtures/routes — test-only)
- `docs/qa/ui_review/**`, `docs/qa/BUG_REGISTER.md`, `docs/qa/hardening_loop/**`

## Forbidden
- **No product code:** `src/**`, `server/**`, `supabase/migrations/**`. If any task *requires* it
  → **stop + log**, do not change it.
- No 01B presentational polish (that waits for Sam's approval of the 01B plan).
- No live integrations / email / RFQ / PO / deploy.

## Stop conditions
- A diagnosis concludes a **component/behaviour fix** is required → log it, set the item to
  "Fix Agent — pending Sam approval", **do not fix**.
- CRM coverage needs a product-code change → stop + log.
- Any [forbidden task class](../HARDENING_WATCH_ORCHESTRATOR_SPEC.md#5-forbidden-autonomous-task-classes).

## Expected outputs
- BUG_REGISTER: updated statuses for UI-FIELD-001/002, UI-PORTAL-002, UI-CRM-001 (+ any new test-only fixture notes).
- ui_review: evidence index + lock matrix updated (CRM assessed; Field re-classified).
- Update [CURRENT_STATE.md](./CURRENT_STATE.md) + [AUTONOMOUS_LOOP_STATUS.md](./AUTONOMOUS_LOOP_STATUS.md)
  (set `next_agent: claude`), append [AGENT_HANDOFF_LOG.md](./AGENT_HANDOFF_LOG.md), write
  [NEXT_CLAUDE_REVIEW.md](./NEXT_CLAUDE_REVIEW.md).

## Commit rule
Docs + test-only fixtures only: `docs(qa): Wave 01A follow-up — Field diagnosis + CRM coverage`.
**No product code in this commit.**

## Final report format
`task done · files changed · tests/screenshots run · Field verdict (fixture|component) · Portal
verdict (copy|behaviour) · CRM lock status · blockers · next agent (claude) · next task file ·
approval required (y/n)`.

## In parallel (Sam, not blocking this task)
The **Wave 01B presentational polish plan** is in `SAM_APPROVAL_REQUIRED.md` (prepared) +
[../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md](../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md) §6,
awaiting Sam's one approval. 01B does not start until then.
