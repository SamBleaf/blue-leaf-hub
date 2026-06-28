---
active: true
---

# Sam Approval Required — ACTIVE (2026-06-28)

**The autonomous loop is HALTED at a Sam gate.** Wave 01A + the follow-up are complete and
reviewed; the next step (Wave 01B = product-code presentational polish) needs your approval, and
there is a **dirty-tree blocker** to clear first. `next_agent: sam`.

---

## ⛔ BLOCKER 0 — unrelated uncommitted product code in the tree (clear before 01B)

The working tree has **uncommitted product-code edits that are NOT part of the hardening loop**:

- `server/lib/scheduleRoutes.mjs` (+7 lines)
- `src/components/schedule/ScheduleSheet.jsx` (+55 lines) — a schedule editable-cell
  "commit-on-blur" refactor (different workstream, likely the Troubleshoot/other agent).

These are **not mine and not Cursor's** (Cursor's commits `4ae2b34`/earlier were clean). The
hardening loop must start each execution from a **clean tree** (orchestrator preflight), and
Wave 01B's commit must not entangle these files. **I have not touched, committed, or reverted
them.**

- **Decision needed:** their owner commits or stashes them on their own branch/commit.
- **Recommendation:** commit them separately (they look like a legitimate schedule fix), then the
  tree is clean and 01B can run.
- **Blocked task:** any Cursor execution (clean-tree preflight currently fails →
  `hardening:watch --dry-run` reports exit 2).

---

## Decision 1 — Approve Wave 01B presentational polish

- **What:** presentational-only polish to the Sales standard, **preserving** all endpoints,
  response shapes, routes, auth/role logic, calculations, mutations, integrations, schema.
- **Plan (8 items, finalized post-follow-up):**

  | Order | Module | IDs | Change | Risk |
  |------|--------|-----|--------|------|
  | 1 | AppShell | UI-NAV-001 | scrollable / "More" mobile bottom nav | low |
  | 2 | Finance | UI-FINANCE-001/002/003 | empty-state KPI copy · mobile claims cards · single FAB | low |
  | 3 | Client Portal | UI-PORTAL-001 | fix em-dash title | low |
  | 4 | CRM | UI-CRM-002 | mobile card layout for contacts | low |
  | 5 | Schedule | UI-SCHEDULE-001 | mobile toolbar overflow menu | low |
  | 6 | Workforce | UI-WORKFORCE-001 | empty-state copy | low |
  | 7 | Sales | UI-SALES-001 | KPI label/help alignment | low |
  | 8 | Design system | UI-VISUAL-001 | shared status-badge component | **med — LAST** |

- **Recommendation:** approve items **1–7**; run item **8 (shared badge)** as a separate
  sequence-last sub-batch with screenshot diffs (per your direction).
- **Risk:** low for 1–7 (isolated presentational); medium for the badge refactor (touches many
  screens) → isolated + last.
- **Blocked task:** `UI-UX-POLISH-WAVE-01B` (staged in
  [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md); runs only on approval **and** a clean tree).

## Decision 2 — Accepted-gap calls
- **UI-TENDER-001:** accept the RFQ wizard as a distinct tool surface (`ACCEPTED-GAP`), **or**
  request a presentational tender-home wayfinding banner (fold into 01B). **Recommend:** accept.
- **UI-SALES-001:** accept the "Needs action" vs "Overdue" KPI semantics, **or** the cheap label
  alignment (01B item 7). **Recommend:** label alignment.

---

## ✅ FYI — control check resolved (no decision needed)
`src/ui-review/**` is **review-only infrastructure** (gated by `VITE_UI_REVIEW_MODE`,
tree-shaken from production; no prod component imports its fixtures). Cursor's follow-up changed
only `src/ui-review/fixtures/**` + `e2e/ui-review/` + docs. **Verdict: Option 1 — safe to allow**
as a test-only path. Recorded in master plan §4 + the playbook. **Not a scope breach.**

Field UI NO-GO is **lifted** (crashes were fixture-only). **0 deploy-blocking UI bugs open.**

---

## On approval
1. Owner clears BLOCKER 0 (clean tree).
2. Sam approves Decision 1 (± 2). Then flip [CURRENT_STATE.md](./CURRENT_STATE.md) +
   [AUTONOMOUS_LOOP_STATUS.md](./AUTONOMOUS_LOOP_STATUS.md): `next_agent: cursor`,
   `approval_required: false`, `product_code_changes_allowed: true`, `fix_mode_allowed: true`,
   and set this file back to `active: false`. Cursor then runs `UI-UX-POLISH-WAVE-01B`.

## Approval gates (reminder)
While `active: true` (or `approval_required: true`), the orchestrator halts and `next_agent` is
`sam`.
