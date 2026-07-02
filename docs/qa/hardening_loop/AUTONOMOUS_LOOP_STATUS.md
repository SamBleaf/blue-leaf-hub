---
loop_enabled: true
next_agent: cursor
current_wave: SOP-DOCS-WAVE-03
current_task_file: docs/qa/hardening_loop/NEXT_CURSOR_TASK.md
fix_mode_allowed: false
product_code_changes_allowed: false
approval_required: false
live_integrations_allowed: false
deploy_allowed: false
max_iterations_this_session: 3
expected_branch: portal-v2
---

# Autonomous Loop — Status

> Machine-readable state above must match [CURRENT_STATE.md](./CURRENT_STATE.md). Human mirror below.

| Field | Value |
|---|---|
| **Loop number** | 7 (SOP Wave 02A + 02B done → 03) |
| **Current wave** | `SOP-DOCS-WAVE-03` — no-code SOP compliance, folders 12–17 |
| **Wave 02B delivered** | portal v2-canonical (+matrix, SEC14-11) · site-diary §14/view-only (SEC14-07) · sales Pass 3A (02-SALES) · RFQ nav · workforce §14 — all §14-normalised. Commits `14b681b`, `d6e49da` |
| **03 scope** | 12_admin_settings · 13_subcontractors · 14_cost_intelligence · 15_carpentry · 16_procurement · 17_crm_mailing_list — §14 compliance + accuracy vs real components |
| **Deferred (logged)** | SOP-BUG-02-07 · -05-05 · -07-03 · -09-JOBVIEW · -11-12 (no Fix Agent). New from 02B (product, logged): dead `QuoteTracker.jsx`; no conversation read-view; Blueprint extended-chat pointer |
| **Fix mode allowed?** | No |
| **Sam approval required?** | No (no-code wave); Yes to escalate any deferred bug to Fix Agent |

**Guards:** product code OFF · live integrations OFF · deploy OFF · Marketing (18/19) paused · watcher
dry-run/run-once only. **Executed via Sonnet background agents under Claude (loop controller) review**
(no Cursor/Claude CLI needed). **Iteration budget:** 3 — Wave 02B consumed 1; 2 remain this session.

**Note (2026-07-02):** an entangled off-wave product-code WIP (RFQ add-recipient / backlog / reply /
select-all revert + IMAP matcher tests) was found uncommitted and **quarantined to `git stash@{0}`**
(would have regressed 4 live features). Awaiting Sam: drop / salvage matcher tests / restore.
