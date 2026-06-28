---
active: false
---

# Sam Approval Required — (inactive)

**No approval is currently required.** The loop is running (`next_agent: cursor`, no-code Wave 02).
An agent overwrites this with `active: true` + details when a gate is hit; while active (or
`approval_required: true` in [CURRENT_STATE.md](./CURRENT_STATE.md)) the orchestrator halts.

---

## ✅ Resolved — SOP Wave 01 gate (Sam, 2026-06-29)

- **SAM-SOP-001 / SOP-GAP-PORTAL-STACK — DECIDED:** **Portal v2 canonical** for new jobs
  (`/client-portal` + v2 admin). v1 token portal = **legacy/fallback, must be labelled**; SOPs
  state which is canonical where both stacks exist. (Logged in `SAM_DECISION_LOG.md`.)
- **SAM-SOP-002 / SOP-GAP-WHS-SETUP — DECIDED:** **write SOP 08-07** for `/operations/:projectId/whs-setup`
  (WhsEngine) as an admin setup workflow (no-code docs).
- **5 app bugs — DEFERRED:** SOP-BUG-02-07 · -05-05 · -07-03 · -09-JOBVIEW · -11-12 kept logged +
  triaged; **no Fix-Agent product-code batch approved.** Re-raise individually as a specific
  Fix-Agent approval packet only if one becomes deploy-blocking.
- **`SOP-DOCS-WAVE-02` — GREENLIT** (no-code). Released to Cursor via
  [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md). State flipped: `next_agent: cursor`,
  `approval_required: false`, `product_code_changes_allowed: false`.

## Guards still in force
No product code · no live integrations · no deploy · no self-approve · Marketing paused · watcher
dry-run/run-once only (interval not enabled).

## Template (fill when a new gate is hit)
- **Decision needed / Options / Recommendation / Risk / Exact blocked task / Raised by / Date.**
