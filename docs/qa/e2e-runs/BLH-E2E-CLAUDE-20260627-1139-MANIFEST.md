# BLH E2E — Claude Second-Pass Verification — Manifest

**Run ID:** `BLH-E2E-CLAUDE-20260627-1139`
**Date:** 2026-06-27 (Adelaide)
**Mission:** `/harden e2e CLAUDE-SECOND-PASS-E2E-VERIFY-01`
**Role:** Second-pass E2E verifier + bug-fix planner — independently re-verify the first pass, challenge findings, reproduce/refute bugs, find missed issues, prepare exact fix batches. **No product code changes; no commits; no deploys.**
**Target:** `http://localhost:8787` (running dev build — new code not fully deployed)

## First-pass ("Cursor"→Claude) report under review
- `docs/qa/E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md`
- `docs/qa/e2e-runs/BLH-E2E-20260627-1041-MANIFEST.md`
- (Note: chat attributed the first pass to "Cursor"; it was actually run by Claude — same operator, treated here as the prior pass to independently challenge.)

## Phase 0 — Preflight
| Check | Result |
|-------|--------|
| `git` branch | `portal-v2` · +3 ahead of origin/main · 48 modified · 190 untracked |
| `GET /api/health` | ✅ 200 |
| app root `/` | ✅ 200 (Blue Leaf Hub) |
| Browser tooling | ✅ Claude-in-Chrome "Browser 1" (macOS) connected, tab live |
| Admin auth | e2e-admin session inject (base64 round-trip) — **node-minted token verified 200** |
| Mail transport | ⚠️ PRODUCTION (Resend + SMTP/IMAP/Gmail) → no real sends |
| Buildxact/Dropbox/Xero | ⚠️ keys configured → no real external side-effects |
| Environment | dev/localhost; simulate-only for all external phases |

**Auth/race note:** the regression suite (`test:batch-a:write` / `test:hardening-regression:write`) calls `ensureE2EUsers`, which rotates the e2e-admin auth user mid-run and invalidates browser sessions. The live browser walkthrough is therefore **deferred until the regression suite completes** (clean state), then a fresh session is injected. Node-minted tokens confirmed the server auth is healthy.

## Source-of-truth doc set (verified present)
WORKFLOW_MAP_MASTER, WORKFLOW_OWNERSHIP_MATRIX, RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH, TENDER_EMAIL_TEST_PLAN, BUG_REGISTER (1774L), WORKFLOW_TEST_MATRIX, 30_DAY_HARDENING_TRACKER, RELEASE_READINESS, SAM_DECISION_LOG, TEST_DISCOVERY_WAVE_01, HARDENING_TEST_COVERAGE_FORWARD_SCOUT, TEST_REGRESSION_SUITE_01, HARDENING_WORK_AHEAD_QUEUE, docs/qa/workflows/01–15+18. **Missing at docs/qa/:** SOP_INDEX.md, TEMPLATE_MASTER_AUDIT.md (workflow checking docs/sops/).

## Test dataset (realistic-but-fake, run-ID tagged)
- **Client:** Amelia Hartley · `amelia.hartley+BLH-E2E-CLAUDE-20260627-1139@example.test` · 0412 555 019 · Architect referral
- **Project:** `BLH E2E CLAUDE TEST — Norwood Alteration & Addition — BLH-E2E-CLAUDE-20260627-1139` · 14 Jarrah Street, Norwood SA 5067 · $950,000 · 32 weeks
- **Trades (ex GST):** Carpentry $86,500 · Concrete $74,250 · Windows $118,900 · Roofing $42,700 · Electrical $36,800 · Plumbing $44,200

## Records / files / artefacts
| Type | Name / ID | Phase | Cleanup | Result |
|------|-----------|-------|---------|--------|
| Lead "Amelia Hartley" | `cbdeb3aa-e1d2-4c51-8668-dc5e11b00c0c` (email run-id) | 2 (browser create) | DB delete | ✅ deleted |
| Lead "Lost Test" | `e24ed803-67a7-4791-b2cc-71abaef8e210` (outcome-stamp lost probe) | 4 (API) | DB delete | ✅ deleted |
| Jobs/projects | none (convert gate held → no job, no Dropbox) | 5 | n/a | none created |
| External (mail/Dropbox/PO/BX) | none fired (safe-only) | all | n/a | none |
| Analysis workflows | `wf_21f71014-c0d` (SOT intake, 10 agents), `wf_0b458253-4f2` (code-verify, 9 agents) | — | n/a | read-only, kept |
| Docs | this manifest + `E2E_CLAUDE_SECOND_PASS_BLH-E2E-CLAUDE-20260627-1139.md` | — | kept | left for review |

## Findings (full detail in the second-pass report)
- **Confirmed product defects:** DISC-002 (HIGH — finance accept doesn't stamp leads.fee_proposal_id), DISC-WIN-01 (med — win-finalize dup cost_intelligence), BLH-E2E-001 (low-med — `_DELETED` projects in active Ops Gantt; **22** rows, `projects.deleted_at` col absent).
- **Reconciled:** W12-SEC-01 **REFUTED** (already gated; employee→403 live + standalone 14/14); OUTCOME-STAMP-01 fully verified (positive+idempotent); OBS-1 confirmed harness artifact (clean 401); OBS-3 downgraded (trivial cache, not "resolved"); W04-DRIFT-005 already implemented.
- **New test-infra finding:** BLH-E2E-CLAUDE-001 — aggregated `hardening-regression:write` false-fails (W09/W10/W12/W13/W18-invite) due to `ensureE2EUsers` user-rotation race (same race that dropped browser auth). Not product regressions.
- **Sam decision:** PORTAL-CROSSROLE (employee/supervisor can read client overview; W18-locked).

## Cleanup steps + result
- ✅ **DONE.** Resolved leads by `email ILIKE '%BLH-E2E-CLAUDE-20260627-1139%'` → 2 matches (Amelia + Lost-probe), deleted children + leads. Re-query after = **0** leads, **0** jobs (verified).
- No external artefacts (no convert/Dropbox/email/PO fired). Regression's own `BATCHA …` artefacts (207, listed by cleanup dry-run) **left intentionally** — not this run's; `--confirm` forbidden.
- Scope strictly run-ID. No global cleanup, no `--confirm`. **Left for review:** this manifest + second-pass report.
- **Left intentionally (not this run's, not safe to delete): `_tmp_burst.mjs`** in repo root — a mail-burst script (`sendPlainMail` ×N, would send REAL emails). Untagged, owner unknown (parallel agent/session). Flagged here per the "leave + record" rule; recommend its owner remove it (it is a live-mail hazard if run).
