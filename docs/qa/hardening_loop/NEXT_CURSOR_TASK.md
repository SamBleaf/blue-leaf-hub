# NEXT CURSOR TASK — ACTIVE (queued for next session)

**Task ID:** `SOP-DOCS-WAVE-04` · **Mode:** no-code SOP §14 compliance + accuracy (docs only)
**Date:** 2026-07-02 · **Issued by:** Claude (loop controller) → after Wave 03 review
**Session note:** the 3-iteration budget was SPENT completing Waves 02B + 03. **Do not auto-run — resume next session.**

> Same no-code SOP-docs family as the Sam-greenlit `SOP-DOCS-WAVE-02/03`. No new approval needed.
> Waves 02B + 03 closed the deploy-gate SOP drift and brought folders 02/04/07/08(07)/10/11/12–17 to the
> 14-section template. Wave 04 finishes the remaining folders. **Marketing 18/19 stays PAUSED (Sam-gated).**
> **5 original + ~8 new app bugs remain deferred — do not fix product code.**

## Objective
Bring the SOP folders NOT yet swept to the same bar: 14-section template with the Troubleshoot Agent
Test Script at **§14** (TC-01..TC-05 + ≥1 feature case), every step matching the real app. **Docs only.**

## Scope (one folder per sub-step; split if large — 04-i, 04-ii, …)
- **00_getting_started · 01_global_navigation** — login/nav SOPs; verify vs `AppShell.jsx` + auth.
- **03_tendering** — verify vs the tender pages/routes (note RFQ SOPs already done in 04_rfq_engine; avoid overlap).
- **05_operations** — vs `OperationsProjectDetail.jsx` + schedule/ops routes.
- **06_scheduling** — vs `ScheduleManager.jsx` (Gantt/Sheet/Delays/Dep Map) + schedule routes.
- **09_finance** — vs the finance pages/routes (invoice inbox, approvals, director portfolio).
- **residual 08_whs** — any 08 SOP beyond 08-07 not yet §14-normalised.

## Method (per SOP)
Read the real component/route first (read-only `src/**`/`server/**`); rewrite so steps match; keep the
full **14-section** template (canonical list in `docs/sops/SOP_MAINTENANCE.md`); test script is **§14** and
LAST; bump `sop_version` + `last_reviewed`; return SOP_INDEX + SOP_CHANGELOG deltas (controller consolidates).

## Allowed / Forbidden
Allowed: `docs/sops/**`, `docs/qa/**`. Read-only `src/**`/`server/**`. **No product code · no live
integrations · no deploy · no Marketing (18/19).** Parallel agents must NOT edit `SOP_INDEX.md` /
`SOP_CHANGELOG.md` — return deltas.

## Stop conditions
Needs product code → log, don't fix. Deferred bug turns deploy-blocking → flag Fix-Agent packet (Sam-gated).
Too large → split + log. Forbidden class → stop + `SAM_APPROVAL_REQUIRED.md`.

## Expected outputs
Compliant/accurate SOPs; §14 normalised; SOP_INDEX + SOP_CHANGELOG updated (by controller);
`SOP_DOCS_WAVE_04_RESULT.md`; state files → `next_agent: claude`; append `AGENT_HANDOFF_LOG.md`.

## Open items for Sam (from Waves 02B + 03 — not this wave's job)
- **Unpause Marketing SOPs (18/19)?** — needed before those folders can be swept.
- **Fix-Agent batch for the deferred product bugs?** Highest-signal: New-Contact form collects
  `consentToEmail`/`consentSource` that `POST /api/crm/contacts` silently ignores; `pretender_estimates`
  insert has no idempotency guard (duplicate rows); dead `QuoteTracker.jsx` (redirect → `RfqPackageDetail.jsx`).
