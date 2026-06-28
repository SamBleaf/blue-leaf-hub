# NEXT CURSOR TASK (STAGED — DO NOT RUN UNTIL UNLOCKED)

**Task ID:** `SOP-DOCS-WAVE-02` · **Mode:** no-code SOP rewrite + §14 backfill (docs only)
**Date staged:** 2026-06-29 · **Issued by:** Claude Code (Hardening Controller)

> ⛔ **GATED.** Staged, not active. Start only when [SAM_APPROVAL_REQUIRED.md](./SAM_APPROVAL_REQUIRED.md)
> is resolved and [CURRENT_STATE.md](./CURRENT_STATE.md) shows `next_agent: cursor`,
> `current_wave: SOP-DOCS-WAVE-02`, `approval_required: false`. (No product-code approval needed —
> this is no-code — but the loop is halted for Sam's PORTAL-STACK + WHS-SETUP decisions.)

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
4. **11_client_portal** — **only after Sam's PORTAL-STACK decision (Decision 1).** Add the
   legacy-v1/v2 matrix + §14 to the legacy set per the canonical choice (`SOP-DRIFT-SEC14-11`,
   High). **If PORTAL-STACK is undecided, SKIP step 4 and log it as still-blocked.**
5. **03_tendering** — 03-03 Board/Actions/List/Scorecard chips; **08_whs** — write 08-07 WHS-Setup
   SOP **iff** Sam chose Decision 2 = (B).
6. Update `SOP_INDEX.md` `test_status` + `SOP_CHANGELOG.md` for every change.

## Allowed files
- `docs/sops/**`, `docs/qa/**`. **Read-only** on `src/**` / `server/**`.

## Forbidden
- **No product code.** No app-bug fixes (those are a separate Sam-gated Fix-Agent packet).
- Do not write portal step 4 if PORTAL-STACK is undecided. Marketing SOPs (18/19) stay paused.
- Do not mark any ACCEPTED-GAP as accepted (that's Sam).

## Stop conditions
- A needed change requires product code → log, don't fix.
- PORTAL-STACK undecided → skip step 4, note it.
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
