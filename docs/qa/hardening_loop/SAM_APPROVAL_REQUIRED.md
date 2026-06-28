---
active: false
---

# Sam Approval Required — (inactive)

**No approval is currently required.** The loop is running (`next_agent: cursor`). An agent
overwrites this file with `active: true` + details when a step hits a gate; while active (or
`approval_required: true` in [CURRENT_STATE.md](./CURRENT_STATE.md)) the orchestrator halts.

---

## ✅ Resolved — Wave 01B approval (Sam, 2026-06-29)

- **BLOCKER 0 cleared:** the unrelated schedule edits were committed by their owner
  (`d7dbd3e fix(schedule): commit-on-blur refactor`) → clean tree.
- **Wave 01B approved:** presentational plan **items 1–7**; **shared badge (UI-VISUAL-001) runs
  sequence-last** as its own sub-batch after items 1–7 pass screenshots.
- **UI-TENDER-001:** **ACCEPTED-GAP** — RFQ wizard may remain a distinct tool surface without a
  full module-home KPI strip.
- **UI-SALES-001:** proceed with the **cheap label-clarity fix** as part of 01B (item 7).
- **Guards:** presentational-only — no behaviour / API / auth / schema / calc / mutation / RFQ /
  PO / Buildxact / Xero / Dropbox / Gmail / Resend / WHS / workforce-logic / client-portal-access
  / schedule-logic changes. Marketing paused until `marketing-run-a` merges. Watcher dry-run
  only. Live integrations + deploy disabled.
- **Released:** state flipped to `next_agent: cursor`, `approval_required: false`,
  `product_code_changes_allowed: true` (presentational scope). Cursor runs
  [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md) without a new prompt.

---

## Control verdict on record (FYI)
`src/ui-review/**` = review-only (gated by `VITE_UI_REVIEW_MODE`, tree-shaken from prod) →
**allowed test-only path** (master plan §4 + playbook).

---

## Template (fill when a new gate is hit)
- **Decision needed:** <one line> · **Options:** <A/B/C> · **Recommendation:** <which + why>
- **Risk:** <…> · **Exact blocked command/task:** <…> · **Raised by:** <agent> · **Date:** <…>

## Approval gates (reminder)
Fixing Critical/High without an approved bug ID · production data · live integrations · sending
email · RFQ send · PO generation · Buildxact/Xero sync · Dropbox write flow · schema migration ·
auth/security logic change · finance calculations · payroll/timesheet approval logic ·
client-portal invite / real-client pilot · deploy · destructive command · broad refactor ·
route/table rename · accepted-gap closure · business-workflow decision.
