# Audit Triage & Fix Plan — reconciling `AUDIT_REPORT_2026-06-14.md` against current code

> **Date:** 2026-06-15
> **Purpose:** The 3-session audit report (`docs/AUDIT_REPORT_2026-06-14.md`) was largely run **before** this week's Workforce→Buildexact rewrite (name-based Work Order push) and the GST fix. This doc reconciles it against the code as it stands today, closes the stale findings, corrects two overstated severities, records two decisions, and leaves a prioritized backlog of what's genuinely open.
> **Status:** PLAN ONLY — nothing here is executed yet. Pick items by wave.
> **Verification key:** ✅ verified in code today · 🔎 per audit, verify at fix time.

---

## A. Already fixed / obsolete — CLOSE these (do not re-fix)

The audit's two "critical launch blockers" are dead. The Workforce module is launch-shaped; its remaining risk is validation, not these bugs.

| Audit ID | Audit severity | Status today | Evidence |
|---|---|---|---|
| BUG-W01 — Worker PWA needs Supabase login | 🔴 Blocker | ✅ **Fixed** | `workerAuth` (workforceRoutes.mjs:826) accepts `?token=`/`x-worker-token`; only falls back to `requireAuth` with no token. Magic-link works, no account. |
| BUG-BX01 — "No Buildexact employee ID" blocks sync | 🔴 Critical | ✅ **Obsolete** | Push is name-based: `ensureBuildexactContact` (:129) + `createPurchaseOrder` (:208). Employee ID is optional metadata. |
| BUG-BX02 — Mass Fill project selector empty | 🔴 Critical | ✅ **Fixed** | Now calls `/api/operations/projects` (confirmed in Session 3). |
| BUG-BX03 / BX06 — silent project→job skip | 🟠 High | ✅ **Fixed** | `resolveBuildexactJobIdForTimesheet`: job_id → project→job → `buildexact_job_sync` mirror → address match; writes `buildexact_sync_error` on miss. |
| BUG-W03 — cost column "—" | 🟡 Med | ✅ **Fixed** | Approvals shows `~$ hours×rate`. |
| BUG-W04 — carpentry dropdown trailing "—" | 🟡 Med | ✅ **Fixed** | Label includes address fallback. |
| BUG-W05 — no DELETE timesheet endpoint | 🔵 Low | ✅ **Fixed** | `DELETE /api/workforce/timesheets/:id` (workforceRoutes.mjs:572), cascades to entries. |
| BUG-BX05 — `updateJobLabourBudget` stub | 🟡 Med | ✅ **Not a bug** | Intentional no-op (would double-count vs Finance CC live read). Documented at workforceRoutes.mjs:254 (BX05 note). |
| (Sam-raised) labour line missing GST | — | ✅ **Fixed 2026-06-15** | `isTaxFree:false` on the Work Order create — GST now applies like Deputy. Verified live (test WO read back `orderTax:10`, then deleted). |

---

## B. Corrected severities — audit overstated two "HIGH" Finance bugs

| Audit ID | Audit severity | Corrected | Why |
|---|---|---|---|
| BUG-P5-2 — Director WIPAA stale `contract_value` read (jobFinanceRoutes.mjs:863) | 🔴 High | **Dead code** | ✅ `registerJobFinanceRoutes` is commented out (dev-api.mjs:781, "DEREGISTERED — fully shadowed"). Handler unreachable. Fix = delete the dead file (W1-09). |
| BUG-P5-1 — fee schedule stale read (financeCCRoutes.mjs:857) | 🔴 High | **Low — consistency** | ✅ Reads `original_contract_value \|\| contract_value`. Only the *fallback* to the stale column is a risk, and claim schedules are original-contract based. Route through `contractValueOf` for consistency (W1-08). |

---

## C. Decisions recorded (2026-06-15)

- **BUG-LIFECYCLE-1 (auto-create project on job win) → WONTFIX / by design.** Every tendered project is run through Buildexact first, so the Operations project is created via the Buildexact sync path (module4Routes.mjs:318). Keeping the current workflow. Close it.
- **BUG-A2 (camelCase across the API boundary in `workforceRoutes` + `salesRoutes`) → FLAGGED, undecided.** It's a CLAUDE.md Law violation but works today (frontend reads snake_case). **Recommendation: a separate, scoped sprint** — fix the server (`rowsToCamel`) *and* every frontend reader, one module at a time with a manual smoke test, because the blast radius spans both ends of the boundary. Not a casual inline fix. See "Flagged / deferred" below.

---

## D. Prioritized backlog — genuinely open

### Wave 1 — Quick wins (low risk, ~1 session, mostly 1-file each)

| ID | Sev | Module | File:line (🔎 verify) | Fix |
|---|---|---|---|---|
| W1-01 BUG-CRM-1 | Low | CRM | crmRoutes.mjs ~555 | On contact→lead convert, `referred_by_contact_id` is set to the contact's **own** id. Set it to `contact.referred_by_contact_id` instead (preserve the referral chain). |
| W1-02 BUG-FACTS-001 | Med | Knowledge Core | FactField.jsx + factsService | Confirm Queue "Dismiss" is client-only → dismissed facts reappear on reload. Add `POST /api/facts/job/:jobId/:key/dismiss` (set status `dismissed`) + wire the button. |
| W1-03 BUG-DELTA6-01 | Med | RFQ | rfqPackageRoutes.mjs (create/update) | Never stamps `trade_category_id` (col exists since mig 081). Import `resolveTradeCategoryId` from buildexactParser.mjs and stamp after insert. |
| W1-04 BUG-RFQ-001 | Low | RFQ | rfqPackageRoutes.mjs:460, :574 | Two handlers call `res.json()` directly → raw DB errors can leak. Route through `apiResponse.mjs` (`ok`/`err`). |
| W1-05 BUG-DELTA6-02 | Low | RFQ | module4Routes.mjs:661–672 | PO `trade_category_id` is a post-insert update (crash between = NULL). Move it into the insert payload. |
| W1-06 BUG-DELTA7-01 | Low | Workforce | workforceRoutes.mjs:611 | `carpentry-job` PATCH sets `carpentry_job_id` without clearing `job_id` → dual-attributed rows. Null the other side (or warn) to protect the double-count guard. |
| W1-07 BUG-P5-3 | Low | WHS | whs/whsMergeFields.mjs:65 | Reads `job.contract_value` directly (unmaintained post-mig-079). Use `getCanonicalContractValue`. |
| W1-08 BUG-P5-1 | Low | Finance | financeCCRoutes.mjs:857 | Route fee schedule contract value through `contractValueOf` instead of `original_contract_value \|\| contract_value`. |
| W1-09 (P5-2) | — | Finance | jobFinanceRoutes.mjs | Delete the dead, deregistered file (or leave with a header note). Removes the stale-read footgun entirely. |
| W1-10 API stability | Med | Infra | dev-api.mjs | Add `process.on('unhandledRejection')` + `('uncaughtException')` logging guards (server crashed once mid-audit with no log). |

### Wave 2 — Validation (do after Wave 1, or now)
- **Re-run the Workforce Launch Audit** with the refreshed prompt (`docs/agent_knowledge/WORKFORCE_LAUNCH_AUDIT_PROMPT.md`). The blockers are gone, so this should yield a clean GO/NO-GO and validate the magic-link, GST (`isTaxFree:false`), Work Order push, contact reuse, and carpentry category alignment end-to-end.

### Wave 3 — Config (Sam, not code)
- **BUG-015** — set `API_BASE_URL` in Railway so `/api/buildexact/status` webhook URL isn't `http://127.0.0.1:8787/...` in production.

### Wave 4 — Data quality / minor (optional)
- **BUG-TM01** — duplicate tender entries for the same address (e.g. four "21 Folk(e)stone" variants). Add normalised-address dedup on tender create. Med.
- **BUG-F01** — `/api/finance/invoices` returns HTML (route not registered). Low — only matters if an SOP/integration references that path; otherwise remove the reference.

---

## E. Flagged / deferred (need a decision or their own sprint)

| ID | Sev | What | Recommendation |
|---|---|---|---|
| BUG-A2 | High (debt) | `workforceRoutes` + `salesRoutes` return snake_case across the API boundary (Law violation) | **Separate scoped sprint** — server `rowsToCamel` + every frontend reader, one module at a time with smoke tests. Decision pending (Sam unsure). |
| BUG-A1 | Med (debt) | ~110 raw `error.message` responses remain (down from ~175); concentrated in financeRoutes, authRoutes, carpentryRoutes | Chip away opportunistically; not a discrete sprint. |
| BUG-N4 | Partial | Reconcile read/write split: webhook writes `projects.buildexact_job_id`, reconcile reads `jobs` first with a legacy fallback | Works today. Unify the write path to `jobs` when touching reconcile next. |
| BUG-ADDR-TIER / FACTS-002 / CRM-2 | Low | Provenance/RLS niceties (system-vs-manual source labelling; permissive RLS gated at route level) | Cosmetic/defense-in-depth; batch into a Knowledge-Core polish pass. |

---

## F. Suggested execution order (when you're ready)
1. **Wave 2 first** is defensible too — a clean re-audit confirms the rewrite and may reprioritize the rest.
2. Otherwise: **Wave 1 quick wins** (one PR), then **Wave 2 re-audit**, then **Wave 3 config**, leaving **A2/A1** as their own scoped work.

Nothing here touches the Workforce launch blockers because there aren't any left — they were fixed before this audit's ink dried.
