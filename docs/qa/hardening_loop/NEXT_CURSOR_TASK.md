# NEXT CURSOR TASK — ACTIVE

**Task ID:** `SOP-DOCS-WAVE-02B` · **Mode:** no-code SOP rewrite + §14 compliance (docs only)
**Date:** 2026-06-29 · **Issued by:** Cursor (Wave 02A) → continuation of the Sam-approved `SOP-DOCS-WAVE-02`

> Continuation of the **already-approved** no-code SOP wave (split for size). No new approval needed
> (docs-only). Sam decisions in force: **v2 portal canonical** (`SAM-SOP-001`); WHS 08-07 done
> (`SAM-SOP-002`). 5 app bugs **deferred — do not fix product code.**

## Objective
Finish the SOP rewrite + §14 compliance for the lead→handover journey. **Docs only.** Address the
deploy-gate SOP/training drift, biggest blocker first.

## Priority order
1. **11_client_portal (HIGH — closes `SOP-DRIFT-SEC14-11`, deploy-blocking):** make **v2 canonical**.
   - New-job portal SOPs point to `/client-portal` + v2 admin (`PortalV2Admin`); the v1 token
     portal (`/portal/:token` + `PortalAdmin`) is **legacy/fallback and must be labelled** in every
     legacy SOP (`portal_*.md`).
   - Add a **v1↔v2 matrix** (which stack, which routes, when each applies) and clear
     canonical-vs-legacy wording.
   - Backfill/normalise **§14** to the correct section number across the legacy `portal_*` set.
2. **07_site_diary (`SOP-DRIFT-SEC14-07`):** renumber the existing test script **§12 → §14**, add the
   missing **§12 Edge cases** + **§13 Owner** sections (template compliance). **07-03 content fix:**
   describe the **view-only** reality — remove/relabel the **Edit** + **date-range filter** steps as
   *not yet available* and link the deferred **SOP-BUG-07-03** (do **not** fix the app).
3. **02_sales 02-02..02-07 (`SOP-DRIFT-02-SALES`, P0):** rewrite to the Pass 3A **Lead command-centre**
   + mobile tabs + **BlueprintAgent FAB** (read `src/pages/LeadDetail.jsx` for the real UX first).
4. **04_rfq_engine 04-02..04-09:** correct entry/nav — post-send work is the **Quote Tracker**
   (`/tender-manager/rfq-packages/:id`), not the Engine wizard.
5. **10_workforce:** verify the test-script section number/compliance for the 3 SOPs; backfill §14
   only where genuinely missing.

## Method (per SOP)
Read the real component/route first (read-only `src/**`/`server/**`), then rewrite so steps match
the app; keep the full 14-section template; ensure **§14 = TC-01..TC-05 + ≥1 feature case**; bump
`sop_version` + `last_reviewed`; update `SOP_INDEX.md` `test_status`/rows + `SOP_CHANGELOG.md`.

## Allowed files
`docs/sops/**`, `docs/qa/**`. **Read-only** on `src/**` / `server/**`.

## Forbidden
- **No product code.** Do not fix the 5 deferred app bugs. No live integrations / email / RFQ / PO /
  deploy. **No Marketing SOPs** (18/19 paused).

## Stop conditions
- A change needs product code → log, don't fix.
- A deferred bug turns out deploy-blocking → log + flag for a Fix-Agent packet (Sam-gated).
- Too large again → split further (e.g. portal as 02B-i, sales as 02B-ii) and log it.
- Any forbidden task class → stop + `SAM_APPROVAL_REQUIRED.md`.

## Expected outputs
- Rewritten SOPs; §14 normalised; `SOP_INDEX.md` + `SOP_CHANGELOG.md` updated.
- `docs/qa/SOP_DOCS_WAVE_02_RESULT.md` appended with the 02B section (SOP-DRIFT IDs closed; still-blocked).
- BUG_REGISTER status updates for closed `SOP-DRIFT-*`.
- Update `CURRENT_STATE.md` + `AUTONOMOUS_LOOP_STATUS.md` → `next_agent: claude`; append
  `AGENT_HANDOFF_LOG.md`; write `NEXT_CLAUDE_REVIEW.md`.

## Commit rule
Docs only: `docs(sops,qa): SOP wave 02B — portal v2 canonical + §14 compliance + sales/RFQ nav`.

## Final report format
`task done · SOPs rewritten · §14 normalised count · SOP-DRIFT IDs closed · still-blocked · next agent claude · approval required (y/n)`.
