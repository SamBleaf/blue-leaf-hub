# NEXT CURSOR TASK

**Task ID:** `SOP-MODULE-AUDIT-WAVE-01` · **Mode:** no-code audit + docs (SOPs are docs)
**Date issued:** 2026-06-29 · **Issued by:** Claude Code (Hardening Controller)
**Why this wave:** UI lane is done (0 deploy-blocking UI bugs; modules LOCKED/CONDITIONAL-accepted).
The largest genuinely-uncovered, **no-code, no-approval** deployability surface is SOP-vs-module
drift — it advances the deploy gate ("SOP drift fixed or accepted") and roadmap P3 (training).
Method: [../SOP_TO_MODULE_AUDIT_PLAN.md](../SOP_TO_MODULE_AUDIT_PLAN.md).

> **Sam can redirect:** if you'd rather run **P0 E2E re-verification** next instead, say so and
> Claude swaps this packet. **UI-VISUAL-001 full badge rollout (01C)** is product-code + Low →
> deferred; needs separate Sam approval, only if justified.

## Objective
For each SOP in the lead→handover journey, walk the **expected employee script** against the
**actual** screens/routes/APIs and log drift. **No product code. No fixes to product code.**

## Scope (this wave — staff lead→handover journey)
Audit these SOP folders, in order:
`02_sales` → `03_tendering` → `04_rfq_engine` → `05_operations` → `06_scheduling` →
`07_site_diary` → `08_whs` → `09_finance` → `10_workforce` → `11_client_portal`.
(If this is too large for one run, split into `SOP-MODULE-AUDIT-WAVE-01A` [02–06] and `-01B`
[07–11] and log the split — do not silently truncate.)

**Excluded this wave:** `18_marketing_agent`, `19_marketing_intelligence` (**Marketing paused
until merge**); `12–17` (later wave).

## Per SOP
1. Identify the SOP source + its `SOP_INDEX.md` row + `test_status`.
2. Write/confirm the expected employee script (plain numbered steps).
3. Map the screens/routes/APIs from [../WORKFLOW_OWNERSHIP_MATRIX.md](../WORKFLOW_OWNERSHIP_MATRIX.md);
   confirm each route/screen still exists in the tree (read-only).
4. Compare expected vs actual; note every mismatch.
5. Log drift to [../BUG_REGISTER.md](../BUG_REGISTER.md) with a `Type:` of `SOP-DRIFT` /
   `TRAINING-GAP` / (a normal bug if the **app** is wrong) / `ACCEPTED-GAP` candidate, plus
   `blocks-deployability (y/n)`.
6. Confirm SOP **Section 14** (Troubleshoot Agent Test Script) exists with ≥ TC-01..TC-05 + one
   feature case; a gap is a `SOP-DRIFT` finding.
7. **If the SOP is wrong (app right):** fix the SOP text (docs), update `SOP_INDEX.md` `test_status`
   + add a `SOP_CHANGELOG.md` entry.
8. **If the app is wrong:** **do not fix it** — log the bug for the Fix Agent.

## Allowed files
- `docs/sops/**` (SOP text fixes + INDEX + CHANGELOG), `docs/qa/**` (findings, result doc,
  handoff). **Read-only** on `src/**` / `server/**`.

## Forbidden
- **No product code** (`src/**`, `server/**`, migrations). No integrations / email / RFQ / PO /
  deploy. Do not decide a gap is "accepted" — that's Sam (log as ACCEPTED-GAP **candidate**).
- Do not audit Marketing SOPs (paused).

## Stop conditions
- A finding needs a product fix → log it, don't fix.
- Any [forbidden task class](../HARDENING_WATCH_ORCHESTRATOR_SPEC.md#5-forbidden-autonomous-task-classes)
  → stop + write `SAM_APPROVAL_REQUIRED.md`.
- Dirty tree with unrelated work → stop.

## Expected outputs
- `docs/qa/SOP_MODULE_AUDIT_WAVE_01_RESULT.md` — per-module: SOP coverage (yes/partial/none) ·
  §14 present (y/n) · drift count by class · ACCEPTED-GAP candidates for Sam.
- BUG_REGISTER findings; SOP text fixes + `SOP_INDEX.md`/`SOP_CHANGELOG.md` updates.
- Update [CURRENT_STATE.md](./CURRENT_STATE.md) + [AUTONOMOUS_LOOP_STATUS.md](./AUTONOMOUS_LOOP_STATUS.md)
  (`next_agent: claude`), append [AGENT_HANDOFF_LOG.md](./AGENT_HANDOFF_LOG.md), write
  [NEXT_CLAUDE_REVIEW.md](./NEXT_CLAUDE_REVIEW.md).

## Commit rule
Docs only: `docs(qa,sops): SOP-vs-module audit wave 01 — <folders covered>`. No product code.

## Final report format
`task done · SOPs audited · drift findings by class · ACCEPTED-GAP candidates · §14 gaps ·
blockers · next agent (claude) · next task file · approval required (y/n)`.
