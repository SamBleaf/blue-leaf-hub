# NEXT CURSOR TASK — ACTIVE

**Task ID:** `SOP-DOCS-WAVE-03` · **Mode:** no-code SOP §14 compliance + accuracy (docs only)
**Date:** 2026-07-02 · **Issued by:** Claude (loop controller) → after Wave 02B review

> No new approval needed — same no-code SOP-docs family as the Sam-greenlit `SOP-DOCS-WAVE-02`.
> Wave 02B closed the deploy-gate SOP drift (`SEC14-11`, `SEC14-07`, `02-SALES`). Wave 03 sweeps the
> remaining back-office folders for the SAME compliance bar. **Marketing (18/19) stays PAUSED.**
> **5 app bugs remain deferred — do not fix product code.**

## Objective
Bring folders **12–17** to the SOP standard: every SOP follows the exact 14-section template with the
Troubleshoot Agent Test Script at **§14** (TC-01..TC-05 + ≥1 feature case), and every step matches the
real app. **Docs only.**

## Priority order (one folder per sub-step; split if large — 03-i, 03-ii, …)
1. **17_crm_mailing_list** — highest churn recently (CRM control spine 1A–1C just shipped: SOPs 02-08/02-09/19-09 exist). Verify CRM/mailing SOPs match `crmRoutes.mjs` + `CrmContacts.jsx`/`ContactDrawer.jsx`; §14 compliance.
2. **16_procurement** (16-01..16-10) — verify vs `procurementRoutes.mjs`/`Procurement.jsx`; §14.
3. **15_carpentry** (15-01..15-06) — verify vs `carpentryRoutes.mjs`/`CarpentryJobDetail.jsx` (note: worker tasks now have hold-drag reorder + transcript category edit); §14.
4. **14_cost_intelligence** — §14 + accuracy.
5. **13_subcontractors** — §14 + accuracy vs `Subcontractors.jsx`.
6. **12_admin_settings** — §14 + accuracy.

## Method (per SOP)
Read the real component/route first (read-only `src/**`/`server/**`), rewrite so steps match; keep the
full **14-section** template (canonical list in `docs/sops/SOP_MAINTENANCE.md`); test script is **§14**
and the LAST section; bump `sop_version` + `last_reviewed: 2026-07-02`; note SOP_INDEX row + SOP_CHANGELOG
deltas (the loop controller consolidates the shared index/changelog to avoid concurrent-edit conflicts).

## Allowed files
`docs/sops/**`, `docs/qa/**`. **Read-only** on `src/**` / `server/**`.

## Forbidden
- **No product code.** No live integrations / email / RFQ / PO / deploy. **No Marketing SOPs (18/19).**
- Do not touch `SOP_INDEX.md` / `SOP_CHANGELOG.md` from a parallel execution agent — return the deltas.

## Stop conditions
- Change needs product code → log, don't fix.
- A deferred bug turns out deploy-blocking → log + flag a Fix-Agent packet (Sam-gated).
- Too large → split (03-i, 03-ii, …) and log it.
- Any forbidden task class → stop + `SAM_APPROVAL_REQUIRED.md`.

## Expected outputs
- Compliant/accurate SOPs (folders 12–17); §14 normalised; SOP_INDEX + SOP_CHANGELOG updated (by controller).
- `docs/qa/SOP_DOCS_WAVE_03_RESULT.md` with drift IDs closed + still-open.
- Update `CURRENT_STATE.md` + `AUTONOMOUS_LOOP_STATUS.md` → `next_agent: claude`; append `AGENT_HANDOFF_LOG.md`.

## Carried-over items (from Wave 02B review — not this wave's job unless trivial docs)
- **Sam decision pending (non-blocking):** stashed off-wave product WIP (`git stash@{0}`) — RFQ add-recipient/
  backlog/reply/select-all revert + IMAP matcher tests. Options: drop / salvage matcher tests / restore.
- **Product-code follow-ups (deferred, Sam-gated):** dead `QuoteTracker.jsx` (redirect → `RfqPackageDetail.jsx`);
  no conversation read-view (02-07); Blueprint extended-chat pointer (02-05).
