---
active: false
---

# Sam Approval Required

**Status:** `active: false` — **the loop is NOT halted.** A no-code/test-only follow-up
(`UI-UX-WAVE-01A-FOLLOWUP`) runs next and needs no approval. The decisions below are **prepared
for Sam to action asynchronously**; they gate **Wave 01B (product-code polish)**, which will not
start until approved. (Set `active: true` only when a step is genuinely blocked.)

---

## PREPARED (pending Sam) — Wave 01B + decisions

### Decision 1 — Approve Wave 01B presentational polish plan
- **Decision needed:** approve the presentational-only 01B polish across the listed modules.
- **Plan:** [../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md](../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md) §6
  (AppShell nav · Finance empty-states/mobile/FAB · Portal title · Schedule mobile toolbar ·
  Workforce copy · Sales KPI label · Design-system badge last).
- **Recommendation:** **Approve** items 1–6; treat item 7 (shared badge component, UI-VISUAL-001)
  as a separate, sequence-last sub-batch given its blast radius.
- **Risk:** low for 1–6 (isolated presentational); medium for the badge refactor (touches many
  screens) — hence sequenced last with screenshot diffs.
- **Blocked task if not approved:** `UI-UX-POLISH-WAVE-01B` (Cursor presentational execution).

### Decision 2 — Field / Portal code fixes (conditional)
- **Decision needed:** if the follow-up diagnosis confirms UI-FIELD-001/002 (and/or
  UI-PORTAL-002) are **component/behaviour bugs**, approve a **Fix Agent** packet for those
  specific IDs (High; deploy-blocking for supervisor field journeys).
- **Recommendation:** approve a smallest-safe Fix Agent packet **after** the verdict is in.
- **Risk:** leaving Field WHS/Diary crashing blocks supervisor field use.

### Decision 3 — Accepted-gap calls
- **UI-TENDER-001:** accept the RFQ wizard as a distinct tool surface (no module-home KPI strip),
  **or** request a presentational wayfinding banner (01B). **Recommend:** accept as `ACCEPTED-GAP`.
- **UI-SALES-001:** accept the "Needs action" vs "Overdue" KPI semantics as intended, **or** 01B
  label alignment. **Recommend:** 01B label alignment (cheap clarity win).

---

## How approval works
While `active: true` (or `approval_required: true` in [CURRENT_STATE.md](./CURRENT_STATE.md)),
**the orchestrator halts** and `next_agent` becomes `sam`. An agent overwrites this file with
`active: true` + the template below when a step is genuinely blocked.

## Template (fill when active)

- **Decision needed:** <one line>
- **Options:** <A / B / C>
- **Recommendation:** <which + why>
- **Risk:** <what could go wrong each way>
- **Exact blocked command/task:** <the precise step that cannot proceed without approval>
- **Raised by:** <agent> · **Date:** <date> · **Related bug IDs / wave:** <…>

## Approval gates (reminder)
Fixing Critical/High without an approved bug ID · production data · live integrations · sending
email · RFQ send · PO generation · Buildxact/Xero sync · Dropbox write flow · schema migration ·
auth/security logic change · finance calculations · payroll/timesheet approval logic ·
client-portal invite / real-client pilot · deploy · destructive command · broad refactor ·
route/table rename · accepted-gap closure · business-workflow decision · **starting UI Wave 01B
polish (needs the 01A module-polish plan approved).**
