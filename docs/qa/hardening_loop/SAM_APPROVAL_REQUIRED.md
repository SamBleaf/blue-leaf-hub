---
active: true
---

# Sam Approval Required — ACTIVE (2026-06-29)

**Loop HALTED at a Sam gate.** SOP Wave 01 audit is reviewed (scope PASS, docs-only). There are
real app bugs (→ stop at Sam) and 2 accepted-gap decisions. **0 code deploy-blockers; SOP/training
deploy-blockers remain.** `next_agent: sam`.

---

## Decision 1 — SOP-GAP-PORTAL-STACK (the key unblocker)
- **Question:** v1 token portal (`/portal/:token` + PortalAdmin) and v2 login portal
  (`/client-portal` + PortalV2Admin) coexist. **Which is canonical for new jobs?**
- **Why it matters:** blocks the portal SOP rewrite + the **High** `SOP-DRIFT-SEC14-11`
  (`blocks-deployability: yes`). Wave 02 can't finalize the 11_client_portal SOP set without this.
- **Options:** (A) v2 canonical, v1 = legacy/sunset · (B) v1 canonical, v2 = pilot · (C) both
  supported with a documented decision rule.
- **Recommendation:** **(A) v2 canonical** (matches the portal-v2 branch direction); document v1 as
  legacy. Then Wave 02 rewrites 11-01–11-09 to v2 + a short legacy note.

## Decision 2 — SOP-GAP-WHS-SETUP
- **Question:** `/operations/:projectId/whs-setup` (WhsEngine) has no SOP.
- **Options:** (A) accept as admin-only edge (`ACCEPTED-GAP`) · (B) write SOP 08-07 in Wave 02.
- **Recommendation:** **(B) write 08-07** (cheap; closes the gap). **Do not self-accept** — your call.

## Decision 3 — Fix Agent batch for the 5 app bugs (product code → your approval)
All **Medium/Low**, **none deploy-blocking** — safe to **defer**.

| Bug ID | Sev | Summary | Recommend |
|--------|-----|---------|-----------|
| SOP-BUG-02-07 | Med | No read-only conversation history view | defer |
| SOP-BUG-05-05 | Low | Global Gantt task-click nav missing | **accept descope** (SOP already corrected) |
| SOP-BUG-07-03 | Med | Site diary edit/save + date filter missing | defer (or scope a small Fix) |
| SOP-BUG-09-JOBVIEW | Med | Finance legacy JobFinancials panel unreachable | defer |
| SOP-BUG-11-12 | Med | No v1→v2 admin link; supervisor blocked from PortalV2Admin | defer (revisit after Decision 1) |

- **Recommendation:** **defer the Fix batch** (nothing blocks deploy); revisit after Wave 02 +
  PORTAL-STACK. If you want any fixed now, name the IDs and I'll write a Sam-gated Fix-Agent packet.

## Decision 4 — Greenlight the next no-code wave (recommended immediate)
- **`SOP-DOCS-WAVE-02`** (no product code, no approval strictly required — bundled here because the
  loop is halted for Decisions 1–3): Sales Lead-Detail SOP rewrite · RFQ 04-02–04-09 nav fixes ·
  §14 backfill for 07_site_diary + 10_workforce · (after Decision 1) portal legacy/v2 matrix +
  §14. **Staged** in [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md).
- **Recommendation:** **greenlight Wave 02**; it clears the SOP/training deploy-gate blockers.

---

## On approval (what to flip)
- Record Decisions 1 & 2 in `docs/qa/SAM_DECISION_LOG.md`.
- To run Wave 02: set [CURRENT_STATE.md](./CURRENT_STATE.md) + [AUTONOMOUS_LOOP_STATUS.md](./AUTONOMOUS_LOOP_STATUS.md)
  → `next_agent: cursor`, `current_wave: SOP-DOCS-WAVE-02`,
  `current_task_file: docs/qa/hardening_loop/NEXT_CURSOR_TASK.md`, `approval_required: false`,
  keep `product_code_changes_allowed: false` (no-code), and set this file `active: false`.
- If approving a Fix-Agent batch instead/also: that's a separate product-code packet (Claude writes
  it on your go-ahead).

## Guards still in force
No deploy · no live integrations · no self-approve · Marketing paused · watcher dry-run/run-once
only (no interval). The 5 app bugs are **not** fixed and **not** accepted — awaiting your call.
