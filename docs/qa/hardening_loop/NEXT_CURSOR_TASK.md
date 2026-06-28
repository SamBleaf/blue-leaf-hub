# NEXT CURSOR TASK — ACTIVE

**Task ID:** `SOP-DOCS-WAVE-02` · **Mode:** no-code SOP rewrite + §14 backfill (docs only)
**Date staged:** 2026-06-29 · **Released:** 2026-06-29 · **Issued by:** Claude Code (Hardening Controller)

> ✅ **RELEASED (Sam, 2026-06-29).** Decisions made: **PORTAL-STACK = v2 canonical** (v1 = legacy/
> fallback, label it); **WHS-SETUP = write SOP 08-07**. State = `next_agent: cursor`,
> `approval_required: false`, `product_code_changes_allowed: false`. **Cursor may run this packet.**
> All 5 app bugs are **deferred** — **do not fix product code.**

## Objective
Close the SOP/training deploy-gate drift from Wave 01: rewrite the highest-risk stale SOPs and
backfill missing Section 14 scripts. **Docs only. No product code. Do not fix the app bugs.**

## Scope (priority order)
1. **02_sales** — rewrite 02-02…02-07 to the Pass 3A Lead command-centre + mobile tabs +
   BlueprintAgent FAB (per `SOP-DRIFT-02-SALES`).
2. **04_rfq_engine** — fix entry paths 04-02…04-09: post-send work is **Quote Tracker**
   (`/tender-manager/rfq-packages/:id`), not the Engine wizard.
3. **§14 backfill** — add TC-01..TC-05 + ≥1 feature case to **07_site_diary** (3 SOPs) and
   **10_workforce** (3 SOPs) — the two zero-compliant modules (`SOP-DRIFT-SEC14-07`, and 10).
4. **11_client_portal** — **v2 is canonical (Sam SAM-SOP-001).** New-job portal SOPs point to
   `/client-portal` + the v2 admin flow; the v1 token portal is **legacy/fallback and must be
   labelled**; every SOP where both stacks exist states which is canonical and which is legacy.
   Add the legacy-v1/v2 matrix + §14 to the legacy set (`SOP-DRIFT-SEC14-11`, High).
5. **03_tendering** — 03-03 Board/Actions/List/Scorecard chips; **08_whs** — **write SOP 08-07**
   for WHS Setup (`/operations/:projectId/whs-setup`, WhsEngine admin workflow — Sam SAM-SOP-002).
6. Update `SOP_INDEX.md` `test_status` + `SOP_CHANGELOG.md` for every change.

## Allowed files
- `docs/sops/**`, `docs/qa/**`. **Read-only** on `src/**` / `server/**`.

## Forbidden
- **No product code.** The 5 app bugs are **deferred** — do not fix them (separate Sam-gated
  Fix-Agent packet if ever needed). Marketing SOPs (18/19) stay paused.

## Stop conditions
- A needed change requires product code → log, don't fix.
- A deferred app bug turns out to be deploy-blocking → log + flag for a Fix-Agent packet, don't fix.
- Any forbidden task class → stop + `SAM_APPROVAL_REQUIRED.md`.

## Expected outputs
- Rewritten SOPs + §14 sections; `SOP_INDEX.md` / `SOP_CHANGELOG.md` updated.
- `docs/qa/SOP_DOCS_WAVE_02_RESULT.md` — per-module: what was rewritten, §14 now complete (count),
  what's still blocked (e.g. portal if undecided).
- Update BUG_REGISTER statuses for the closed `SOP-DRIFT-*` / `SOP-DRIFT-SEC14-*` items.
- Update [CURRENT_STATE.md](./CURRENT_STATE.md) + [AUTONOMOUS_LOOP_STATUS.md](./AUTONOMOUS_LOOP_STATUS.md)
  (`next_agent: claude`), append [AGENT_HANDOFF_LOG.md](./AGENT_HANDOFF_LOG.md), write
  [NEXT_CLAUDE_REVIEW.md](./NEXT_CLAUDE_REVIEW.md).

## Commit rule
Docs only: `docs(sops,qa): SOP rewrite + §14 backfill wave 02 — <modules>`. No product code.

## Final report format
`task done · SOPs rewritten · §14 backfilled (count) · SOP-DRIFT IDs closed · still-blocked
(portal?) · next agent (claude) · approval required (y/n)`.
