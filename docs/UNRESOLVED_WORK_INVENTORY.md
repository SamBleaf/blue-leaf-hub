# Unresolved work & plans — full inventory (2026-07-19)

Deep sweep of code (`server/lib` + `src`), all plan/status docs, and every `process.env.*_KEY/_TOKEN/_ID` integration vs `.env.example` + CLAUDE.md. Each item tagged: **NOT-DONE** (genuinely outstanding) · **PARTIAL** (half-built) · **OBSOLETE** (superseded/stale — cleanup, not build) · **VERIFY** (needs a check). To be triaged with Sam.

---

## A. Integration keys never set up (config)
> The "keys never fully set up" thread. All fail-soft, so features silently do nothing. Verify each on Railway (prod) — local `.env` ≠ prod.

| Key | Feature | Status | Note |
|---|---|---|---|
| `OPENAI_API_KEY` | **Whisper STT** (server `/api/transcribe`) + **marketing video subtitles** | NOT-DONE | Absent from `.env`, `.env.example`, CLAUDE.md. The only OpenAI dependency. See §F. |
| `MAPBOX_TOKEN` | Geocoding / maps (geoService, HubMap, Ops/Sales maps) | ✅ LIVE (doc drift only) | **VERIFIED 2026-07-19: set in prod** — `geocode_cache` has 14 rows; jobs/leads/carpentry_jobs `geo_lat` populated (8/3/4). Just undocumented in `.env.example`. Not a broken feature. |
| `GOOGLE_COST_MODEL_SHEET_ID` | Company cost model → Google Sheet | NOT-DONE | `companyCostModelRoutes.mjs`; 400s until set; undocumented. |
| `IMAP2_USER` / `IMAP2_PASS` | 2nd invoice mailbox poller | PARTIAL | `financeRoutes.mjs:1138`; 2nd poller no-ops with empty creds; undocumented. |
| `RESEND_*`, `META_*`, `GA4_*`, `GBP_*`, `GOOGLE_SEARCH_CONSOLE_*` | Resend transport + Marketing Intelligence | CONFIG DRIFT | Documented in CLAUDE.md but missing from `.env.example` scaffold. Optional/fail-soft. |

## B. Genuinely unbuilt features (NOT-DONE)
- **Marketing Command Centre Stages 2–6** — automation, publishing, paid growth, video editor: registered as **501 stubs** (`marketingCommandRoutes.mjs:85-96`). Deliberate roadmap reservations.
- **Xero bill sync — Phase 2** — only a read-only status endpoint; bill-creation-on-approval unbuilt. UI says "Phase 2 — coming soon" (`financeRoutes.mjs:1116`, `XeroPane.jsx`).
- **~22 document templates marked `planned` / "Required (not built)"** — the authoritative missing-template backlog across sales/tender/ops/WHS/finance/contract/handover/marketing (`templateCatalog.mjs:46-159`).
- **In-app password change** — "coming soon" (`ProfilePane.jsx:35`).
- **Construction (full-build) jobs → workforce pipeline forecast** — v1 pipeline is carpentry-only; construction jobs don't yet contribute forecast crew-days (highest-value deferred pipeline item; `WORKFORCE_PIPELINE_FUTURE_TODO.md:42`). *(Also captured in memory as a parked design.)*
- **Workforce Pipeline Phase 2/3 maturation** — persisted snapshots, P50/P75/P90 calibration, accuracy dashboard, scenario what-if, skills matching (`WORKFORCE_PIPELINE_FUTURE_TODO.md`).
- **Operations Sprint 4** — rich project cards w/ health badge + trade-conflict detection (CLAUDE.md:387).
- **Carpentry full stage-instance management** — current model is definitional only (`carpentryStages.mjs:10`).
- **W17-P8** — deputy-replacement hardening (final launch gate); **W17-P5b** snapshot grey-overlay follow-on.

## C. This session's own deferrals ("the one in this thread")
- **Budget Spine Phase 3 — coverage** (`docs/plans/BUDGET_SPINE_ALIGNMENT.md`): map the ~$60k / 33 unmapped material supply sub-tasks (Sam later said material has no schedule/PWA relevance → likely DE-SCOPE), persist + lock schedule **sub-task** durations, fold `site_tasks` onto the `(task_category, canonical_key)` spine.
- **Schedule↔budget join-hardening** — reconcile off the fragile `slug(category_name)` → `workforce_task_category` primary (deferred as it touches the auto-heal drift logic).

## D. Half-built / partial (PARTIAL)
- **`labourAttribution` guard helpers** (`excludeDoubleCounted`/`labourTotalForJob`) — built, **ZERO callers**. Carpentry labour is intentionally NOT yet folded into builder-job rollups (Phase 7 additive). Flagged call sites: `financeCCRoutes.mjs:444-461`.
- **`docTokens.buildHandoverTokens`** — stub with no caller, awaiting Sam's handover-pack DOCX template.
- **Finance receipt parser Tier-1 regex** — no-op (`regexResult` stays `{}`); Haiku does all parsing. "For now" pre-Haiku fast-path never built (`financeRoutes.mjs:445`).
- **Facts service Phases 1/3/5** — address derivation, portfolio Confirm Queue, WIN-time contract value; phase-gated (`factsService.mjs`). *(VERIFY which ship E2E.)*
- **Buildexact parser Phase 6** — trade-taxonomy FK convergence (additive groundwork present).
- **Cost intelligence Phase 4** — building-facts provenance (additive, phase-gated).
- **LegacyStudio** — "temporary" wrapper for the old ContentGenerator; intended for removal once the new marketing studio fully supersedes it.

## E. Obsolete / stale docs & dead scaffolding (cleanup, NOT build)
- **`KNOWN_ISSUES.md`** (last 2026-05-21) — stale; ISSUE-002/006 overtaken. Needs a reconcile pass.
- **`FUTURE_ROADMAP.md`** (2026-05-21) — Sprints 2/3 shown "Planned/Next" but shipped.
- **`W17_WORKFORCE_REMAINING_PHASE_PLANS.md`** top table — shows P2–P5 "Planned" though shipped; only P6/P7/P8 genuinely open.
- **`SCOPE_OF_WORKS` RDO "done" claim** — was false at writing, now true (P5 closed it).
- **AppShell "Coming soon" nav badge** — dead render branch; no dept sets `comingSoon:true` (`AppShell.jsx:135`).
- CLAUDE.md **Sprint 5 (client portal)** backlog — partly superseded by the separately-built Portal v2; reconcile which items remain.

## F. Transcription / Whisper — detail (Sam's focused ask)
Two separate STT implementations:
1. **✅ LIVE — Browser Web Speech API** (`useVoiceCapture.js`, en-AU) → `splitTranscriptToTasks` (Haiku). Wired into Supervisor Home, Operations, Site Diary, Field Diary, Worker Tasks, Carpentry, Leads. No key needed. **But** browser Web Speech is Chrome/desktop-reliable only — flaky/absent on Firefox + iOS Safari (falls back to typing).
2. **☠️ ORPHANED — Server Whisper** (`transcribe.mjs` + `POST /api/transcribe`, `whisper-1`). Comment: meant to be "the single STT entry point they should all route through" — never finished. **No frontend caller**; needs `OPENAI_API_KEY` (unset). → **OBSOLETE** if browser STT suffices, or **NOT-DONE better-approach** if reliable cross-device voice notes are wanted (wire `useVoiceCapture` → this route + set the key).
3. **⚠️ KEYLESS — Marketing video subtitles** (`marketingMedia.mjs` `whisper-1`; toggle `FinalAssembly.jsx:211`). Dead switch until `OPENAI_API_KEY` set. → NOT-DONE (config only).

## G. Security / data-integrity debt — VERIFIED 2026-07-19
- **ISSUE-005 — RLS: ✅ anon exposure CLOSED.** Empirical test: the raw **anon key (unauthenticated)** reads **0 rows** from employees, timesheets, timesheet_entries, carpentry_jobs, leads, budgets, allocations, charge_up_jobs, jobs, purchase_orders (invoices table not exposed at all). No anonymous data leak. *Residual (untestable without a user JWT): whether any `USING(true) TO authenticated` policy lets one logged-in worker read another's rows via a direct anon-key+JWT read — low practical risk since the app is API-mediated (service role). A full policy audit needs SQL access.* → **downgrade: not a live critical issue.**
- **ISSUE-004 — duplicated `buildexact_job_id`: ✅ non-issue.** 0 jobs currently have `buildexact_job_id` set → no duplicates possible. → **OBSOLETE.**
- **ISSUE-003 — trade-taxonomy dual system: ⚠️ REAL, ~70% converged.** `trade_categories` (37 canonical) + `subcontractors.trade` (43 free-text) coexist; `subcontractors.trade_category_id` populated **30/43** → ~13 subbies not yet linked. Genuine PARTIAL (matches Buildexact "Phase 6 convergence pending"). Low urgency.
- **Facts service: ✅ foundation ACTIVE** — `job_fact_history` 32 rows, `job_events` 33 rows (writing live). Later phases (Confirm Queue, address derivation) partial. → PARTIAL, not dead.
- **OpenAI/Whisper key: unverifiable from data** — server Whisper route is code-confirmed orphaned regardless; prod key status needs a Railway check.
