# Sam Decision Log

**Purpose:** Track business decisions discovered during workflow mapping. Workflow docs reference these IDs; do not treat recommendations as implemented until Status = `decided`.

**Related:** [WORKFLOW_MAP_MASTER.md](./WORKFLOW_MAP_MASTER.md), [BUG_REGISTER.md](./BUG_REGISTER.md)

---

| ID | Workflow | Decision Needed | Options | Recommended Default | Status | Date |
|----|----------|-----------------|---------|-------------------|--------|------|
| SAM-W01-001 | W01 | Should all lead creation paths create `lead_activities`? | A) Yes — unified "Lead created" on manual, website, CRM convert · B) No — only manual · C) Website/CRM only | **A — yes** | open | 2026-06-22 |
| SAM-W01-002 | W01 | Website enquiries: use `name` only, or split into `first_name`/`last_name`? | A) Keep `name` + shared display helper · B) Split on ingest · C) Require both fields on form | **A — keep `name`, add `displayLeadName()` later** | open | 2026-06-22 |
| SAM-W02-001 | W02 | Qualifying score display: `/8`, percentage, or both? | A) `/8` only (fix SOP) · B) Percentage only · C) Both | **A — `/8` internally; percentage optional later** | open | 2026-06-22 |
| SAM-W02-002 | W02 | Stage gates: server-enforced or advisory during hardening? | A) Server-enforce `GATE_REQUIREMENTS` · B) Advisory + diagnostic logging · C) UI-only (status quo) | **B — advisory + diagnostic logging during hardening** (do not hard-block yet; log/flag bypasses; test current behaviour; enforce only if Sam decides later) | **decided** | 2026-06-24 |
| SAM-W02-003 | W02 | Nurture/lost model: keep as stages or split to outcome/status? | A) Keep as stages · B) Split outcome field | **A during hardening — document drift; revisit later** | open | 2026-06-22 |
| SAM-W02-004 | W02 | AI transcript provenance: activity log, field-level provenance, or no change? | A) Simple activity log · B) Structured field-level · C) No change | **B eventually; A as smallest-safe interim** | open | 2026-06-22 |
| SAM-W03-001 | W03 | PTSA signed allowed if job creation fails (missing `site_address`)? | A) Block sign until address · B) Allow signed, hard warning, block tender handoff · C) Allow signed, no block | **B — signed can be stored; block tender/job handoff until site_address/job_id resolved** | **decided** | 2026-06-24 |
| SAM-W03-002 | W03 | Fee proposal creation: API-only or allow direct Supabase writes? | A) API-only · B) Direct Supabase OK · C) Hybrid during hardening | **A eventually; document direct Supabase as consistency risk during mapping** | open | 2026-06-24 |
| SAM-W03-003 | W03 | PTSA template via same system as fee proposals? | A) Yes, unified template system · B) No, keep embedded PTSA · C) Unify post-hardening | **C — yes eventually; no consolidation during hardening unless tests require** | open | 2026-06-24 |
| SAM-W03-004 | W03 | Canonical signed date for PTSA? | A) `ptsa_signed_at` · B) `pretender_signed_date` · C) Both with clear roles | **Choose one canonical; map other as legacy/display if needed** | open | 2026-06-24 |
| SAM-W04-001 | W04 | Allow "Address pending" jobs into RFQ/tender workflow? | A) Block before RFQ package · B) Warn only · C) Allow (status quo) | **A — block or hard-warn before RFQ package / tender handoff** | **decided** | 2026-06-24 |
| SAM-W05-001 | W05 | Tender Board aggregate from `rfqs` only or also `rfq_packages`/`rfq_recipients`? | A) `rfqs` only (document) · B) Merge both in board API · C) Package-first board | **Document current state first; eventually aggregate both (B)** | open | 2026-06-22 |
| SAM-W05-002 | W05 | Should archive be reversible and audited? | A) Yes — API + audit log · B) Keep frontend Supabase · C) Archive = status only, no audit | **Yes — reversible and audited** | open | 2026-06-24 |
| SAM-W05-003 | W05 | Should delete be allowed for tender jobs with RFQs/quotes/packages? | A) Block when packages exist · B) Admin-only hard delete · C) Delete always allowed | **Archive preferred; hard delete only for mistaken draft/test jobs; document/test rfq_packages behaviour first** | **decided** | 2026-06-24 |
| SAM-W05-004 | W05 | When tender won/lost, auto-update linked lead stage? | A) Yes on win/lose · B) Manual only · C) Win only | **Yes eventually; document current gap first (W05-DRIFT-004)** | open | 2026-06-24 |
| SAM-W05-005 | W05 | Minimum operations handoff after win? | A) Project row only · B) Project + readiness checklist · C) Full W09 scope | **Project + visible readiness checklist first (W05-DRIFT-009)** | open | 2026-06-24 |
| SAM-W05-006 | W05 | Should Tender Board remain a simple jobs.status board, or become a true tender phase board? | A) Keep simple jobs.status board · B) Add tender_phase field later · C) Make RFQ package status drive board status | **B — future tender_phase preferred; no Tender Board redesign during 30-day hardening** | **decided** | 2026-06-24 |
| SAM-W01-003 | W01 | Public enquiry spam/rate limiting priority? | A) Rate limit + honeypot now · B) Document gap, defer · C) CAPTCHA | **B — document gap; rate limit in P1 security sprint** | open | 2026-06-22 |
| SAM-W01-004 | W01 | Mirror CRM interactions onto lead timeline when `converted_lead_id` set? | A) Yes · B) No — keep separate · C) Link only, no duplicate rows | **Open — needs Sam input** | open | 2026-06-22 |
| SAM-W06-001 | W06 | Canonical RFQ path: Engine wizard vs Package Detail vs merge? | A) Engine primary — package is post-send snapshot · B) Package Detail primary · C) Merge single flow | **A — Engine primary; Package Detail review/control only; no unification during hardening** | **decided** | 2026-06-27 |
| SAM-W07-001 | W07 | Should RFQ outbound audit rely on Hub correspondence log only, or must RFQs also appear in mailbox Sent folder? | A) Hub correspondence SoT · B) Gmail/SMTP so Sent shows RFQs · C) Resend + BCC/archive to mailbox | **A — Hub correspondence SoT during hardening; mailbox Sent not guaranteed while Resend active** | **decided** | 2026-06-25 |
| SAM-W07-002 | W07 | Email-only package recipients: extend IMAP matcher or manual-only? | A) Match on `rfq_recipients.email` · B) Require stub subcontractor · C) Manual resolve only | **C — manual-resolve only during hardening; do not extend matcher yet** | **decided** | 2026-06-25 |
| SAM-SOP-001 | W11/W18 | Portal stack: which is canonical for new jobs — v1 token portal or v2 login portal? (`SOP-GAP-PORTAL-STACK`) | A) v2 canonical, v1 legacy/fallback · B) v1 canonical · C) both, with a rule | **A — v2 (`/client-portal` + v2 admin) canonical; v1 token portal = legacy/fallback, must be labelled; SOPs state which is canonical where both exist** | **decided** | 2026-06-29 |
| SAM-SOP-002 | W14 | WHS Setup (`/operations/:projectId/whs-setup`, WhsEngine) has no SOP — accept gap or document? (`SOP-GAP-WHS-SETUP`) | A) Accept admin-only edge · B) Write SOP 08-07 | **B — write SOP 08-07 (no-code docs work; admin setup workflow)** | **decided** | 2026-06-29 |
| SAM-W07-003 | W07 | First IMAP poll skips inbox backlog — accept or import? | A) Accept skip · B) One-time backlog import · C) Start cursor at 0 | **B — add/plan controlled one-time backlog import; do not start cursor at 0 permanently** | **decided** | 2026-06-25 |
| SAM-W07-004 | W07 | Resend Message-ID strategy for quote matching | A) Document fallbacks only · B) Custom header · C) Gmail for RFQs | **A — document fallbacks only during hardening; no transport change; B/C after Batch B review** | **decided** | 2026-06-25 |
| SAM-W08-001 | W08 | Minimum safe acceptance rule before tender win? | A) `quote_amount > 0` on every accepted trade · B) Allow win with quoted_amount only · C) Block win until package sync | **Decided — see notes below** | **decided** | 2026-06-25 |
| SAM-W08-002 | W08 | Canonical accept surface for staff training? | A) Tender Detail only · B) Package Detail only · C) Both documented | **Decided — see notes below** | **decided** | 2026-06-25 |
| SAM-W08-003 | W08 | Sync Tender accept to rfq_recipients automatically? | A) Yes on PATCH rfq · B) Manual cross-check only · C) Defer to path merge | **Decided — see notes below** | **decided** | 2026-06-25 |
| SAM-W09-001 | W09 | Minimum safe won-job checklist before ops starts? | A) Project row only · B) Project + visible readiness checklist · C) Auto-seed schedule/procurement/WHS | **B — project + post-win checklist banner; no auto-seed during hardening** | **decided** | 2026-06-25 |
| SAM-W10-001 | W10 | Auto-generate procurement on win? | A) Yes · B) Manual only · C) On financial lock only | **B — manual + financial lock path documented** | open | 2026-06-25 |
| SAM-W11-001 | W11 | Fix batch PO projectId in hardening? | A) Yes P0-C1 · B) Defer | **A — smallest client fix** | **decided — P0-C1 shipped** | 2026-06-25 |
| SAM-W11-002 | W11 | Require admin role on `/api/po/issue`? | A) Yes · B) Keep requireAuth only | **A — align with procurement issue-po** | **decided — W11-PO-SEC-01 accepted closed 2026-06-27** | 2026-06-25 |
| SAM-W12-001 | W12 | Auto-generate schedule on win? | A) Yes · B) Manual only | **B — manual during hardening** | open | 2026-06-25 |
| SAM-W14-001 | W14 | Auto-create WHS profile on win? | A) Yes · B) Manual setup | **B — manual WHS setup; W14-API-05 confirms** | **decided** | 2026-06-25 |
| SAM-W15-001 | W15 | Allow supervisor timesheet approve? | A) Yes — fix API · B) Admin only — fix UI | **B — admin-only approve; UI gated 2026-06-25** | **decided** | 2026-06-25 |
| SAM-W15-002 | W15 | Deputy cutover go-live criteria? | A) E2E green · B) Parallel run sign-off · C) Defer | **A + B before decommission** | open | 2026-06-25 |
| SAM-W09-002 | W09 | Package-only accepted quotes at win time? | A) Block win until rfqs mirror · B) Warn only · C) Ignore | **B — warn prominently; document gap (W09-DRIFT-002)** | **decided** | 2026-06-25 |
| SAM-W09-003 | W09 | Auto-sync leads.stage on win? | A) Yes when lead_id set · B) Manual only · C) Win only, not lose | **A eventually; document gap first (W09-DRIFT-004)** | open | 2026-06-25 |
| SAM-W22-001 | W22 | CRM unsubscribe semantics: global vs strict per-list consent? | A) Global suppression (any unsubscribe stops all lists — Spam Act safe) · B) Strict per-list consent | **A — global suppression** (W22-SEC-001 fix shipped 2026-06-28) | **decided** | 2026-06-28 |
| **SAM-MKT-001** | Marketing | Marketing Command Centre Run A — parked until post P0/P1 hardening | A) Proceed Run A during freeze · B) **Park Run A until post-hardening** · C) Cancel rebuild | **B — park Run A** | **decided (parked)** | 2026-06-27 |
| SAM-HUB-001 | HUB-QA | Build a cross-Hub Role Preview / QA Console instead of scattering per-module preview buttons? | A) Central admin-only read-only console in Settings → Developer Tools · B) Keep ad-hoc per-module previews · C) Do nothing | **A — record as future tool ([HUB_QA_ROLE_PREVIEW_CONSOLE.md](./HUB_QA_ROLE_PREVIEW_CONSOLE.md)); read-only; NOT real auth; parked, do NOT build during W17; requires a separate explicit Sam approval naming the phase to start** | **decided (record + defer)** | 2026-06-26 |

---

## Decided notes (2026-06-27 — SAM-W06-001)

| ID | Sam decision |
|----|--------------|
| SAM-W06-001 | **Option A approved:** RFQ Engine is the **primary creation/send path** during hardening. Package Detail is **review/control only**. Do **not** unify or redesign the two paths during this hardening phase. Document operating model for staff and agents. |

---

| ID | Sam decision |
|----|--------------|
| SAM-W09-001 | Ops readiness checklist (Option B/C) shipped as P0-B5 — read-only banner + shared helper; no auto-seed. |

## Decided notes (2026-06-25 — W08 acceptance)

| ID | Sam decision |
|----|--------------|
| SAM-W08-001 | Minimum safe accept before win: every accepted trade must have `rfqs.quote_amount > 0`, staff-confirmed. Cross-check package recipients where linked. PDF recommended where available. |
| SAM-W08-002 | Canonical win acceptance surface during hardening: **Tender Detail**. Package Detail remains the comparison/workbench surface. Do not merge surfaces during hardening. |
| SAM-W08-003 | Tender accept → package recipient sync fix is **deferred**. During hardening, document manual cross-check where package recipients are linked. |

## Decided notes (2026-06-25 — W07 acceptance)

| ID | Sam decision |
|----|--------------|
| SAM-W07-001 | RFQ outbound audit SoT during hardening is Hub `correspondence`. Mailbox Sent is not guaranteed while Resend is active. |
| SAM-W07-002 | Email-only package recipients are manual-resolve only during hardening. Do not extend IMAP matcher yet. |
| SAM-W07-003 | First IMAP poll backlog: add/plan a controlled one-time backlog import option. Do not start cursor at 0 permanently. |
| SAM-W07-004 | Resend Message-ID strategy during hardening: document fallbacks only. Do not change mail transport yet. Custom header / Gmail-send options after Batch B review. |

## Decided notes (2026-06-24 — Batch A review)

| ID | Sam decision |
|----|--------------|
| SAM-W02-002 | Stage gates remain advisory + diagnostic logging during hardening. Do not hard-block yet. |
| SAM-W03-001 | PTSA signed may be stored if job creation fails, but app must show hard warning and block tender/job handoff until `site_address` / `job_id` resolved. |
| SAM-W04-001 | Address pending jobs must be blocked or hard-warned before RFQ package / tender handoff. |
| SAM-W05-003 | Archive preferred for tenders with RFQs/packages/quotes. Hard delete only for mistaken draft/test jobs, after linked `rfq_packages` behaviour is documented/tested. |
| SAM-W05-006 | Future `tender_phase` model preferred; no Tender Board redesign during 30-day hardening sprint. |

**P0 fixes approved for test skeletons:** P0-A1 through P0-A6 (implementation order: A5 → A6 → A3 → A4 → A1 → A2).

**P0-A5 completed 2026-06-24:** Test baseline only — rfqs-only limitation documented; no Tender Board product fix.

**Block 1 (P0-A5 + P0-A6) completed 2026-06-24:** Low-risk containment — rfqs-only documented; job-delete returns 409 when RFQ packages/quotes linked.

**Block 2 (P0-A3 + P0-A4) completed 2026-06-24:** W04 handoff safety — Address pending blocked before RFQ; extraction jobs link lead at create.

---

## Batch B parking (pre-confirmed — no implementation)

| ID | Finding | Repo check | Detail |
|----|---------|------------|--------|
| W06-DRIFT-001 | persistRfqs bypasses server job create | **fixed** — JOB-SPINE-01 | [BUG_REGISTER](./BUG_REGISTER.md) |
| W06-PARK-001 | API camelCase vs UI snake_case (alias W06-DRIFT-008) | **fixed** | W06-UI-02 pass |
| W06-DRIFT-002 | Package created after engine sends | **confirmed — accepted operating model** | SAM-W06-001 Option A decided 2026-06-27 |
| W07-DRIFT-001 | Package send `sent_message_id` | **partially fixed** | same |
| W07-DRIFT-002 | Email-only recipients not IMAP-matchable | **confirmed** | same |
| W07-DRIFT-003 | Inbound quote → package propagation | **partially fixed** | same |
| W07-DRIFT-004 | Resend — no mailbox Sent | **confirmed** | same |
| W07-DRIFT-005 | Resend strips Message-ID | **confirmed** | same |
| W07-DRIFT-006 | Ambiguous sender match | **confirmed** | W07 map |
| W07-DRIFT-007 | First IMAP poll skips backlog | **confirmed** | SAM-W07-003 |
| W07-DRIFT-008 | Manual resolve no PDF/amount | **confirmed** | W07 map |
| W07-DRIFT-009 | Matcher idempotency baseline | **confirmed** | W07 map |
| W08-DRIFT-001 | Accept requires quote_amount not quoted_amount | **confirmed** | W08 map / DRIFT-014 |
| W08-DRIFT-004 | Tender accept does not sync package | **confirmed** | W08 map |
| SAM-W06-001 | Canonical RFQ path (Engine vs Package) | **decided** — Option A | W06 map |
| SAM-W07-001 | Correspondence SoT vs mailbox Sent | **decided** | Hub correspondence SoT |
| SAM-W07-002 | Email-only recipient matching | **decided** | Manual-resolve only |
| SAM-W07-003 | IMAP backlog on first poll | **decided** | Plan one-time backlog import |
| SAM-W07-004 | Resend Message-ID strategy | **decided** | Document fallbacks only |

| SAM-W08-001 | Minimum accept before win | **decided** | W08 acceptance 2026-06-25 |
| SAM-W08-002 | Canonical accept surface | **decided** | Tender Detail win path; Package workbench |
| SAM-W08-003 | Sync Tender accept → package | **decided** | Deferred; manual cross-check during hardening |

**Mapping order:** W06 ✅ → W07 ✅ → W08 ✅ accepted → W09 ✅ mapped. No fixes until Batch B reviewed.

---

## W18 production gate (2026-06-26 audit)

| ID | Workflow | Question | Options | Status |
|----|----------|----------|---------|--------|
| **P1-W18-04** | W18 | Legacy token POST endpoints on **non-v2** projects — deprecate, require login, or SOP-only? | A) Hard-disable all legacy POSTs · B) Require JWT on legacy POSTs · C) SOP + monitor legacy-only projects | **decided (pilot + hardening)** — **C** for hardening; **JWT/invite primary** for pilot; legacy **read-only / not for contractual actions**; **A** still required for unsupervised production | **decided** | 2026-06-27 |

**Note:** W18 supervised client pilot **approved with controls** — see SAM-W18-PILOT-01 below.

---

## Hardening fix / UAT approvals (2026-06-27)

| ID | Scope | Sam decision | Status | Date |
|----|-------|--------------|--------|------|
| **SAM-DISC-002-APPROVE** | DISC-002 / W03 finance accept → `leads.fee_proposal_id` parity | **Approved** — narrow Claude fix batch (shared `stampLeadFeeProposalLink` + both accept routes). Fix shipped as DISC-002-FINANCE-FEE-LINK-01; **accepted closed** after W03-API-05c green (batch-a 37/0). | **decided — closed** | 2026-06-27 |
| **SAM-W18-UAT-01** | W18-UAT-EXEC-01 manual client portal pilot | **Accepted CONDITIONAL PASS** — API 2026-06-27; browser pilot **CONDITIONAL PASS** 2026-06-27 ([W18_STAFF_BROWSER_PILOT_RESULT_20260627.md](./W18_STAFF_BROWSER_PILOT_RESULT_20260627.md)) | **decided — conditional pass** | 2026-06-27 |
| **SAM-W18-PILOT-01** | W18 supervised client pilot (`W18-SUPERVISED-CLIENT-PILOT-01`) | **Approved with controls — WAITING FOR VIABLE REAL JOB.** Do not execute yet. Delayed until: contract signed, job active in Hub, client relationship confirmed, Sam final go-ahead + consent. **Candidate:** first signed building contract (subject to Sam approval). No `__E2E_`/BLH TEST/demo substitute. Pack: [W18_SUPERVISED_CLIENT_PILOT_EXECUTION_PACK.md](./W18_SUPERVISED_CLIENT_PILOT_EXECUTION_PACK.md) | **decided — approved, on hold** | 2026-06-27 |
| **SAM-PORTAL-CROSSROLE** | W18 portal-admin read scope | **Admin: yes.** **Supervisor: yes, if project-related.** **Employee: no portal-admin overview by default.** **Client: own portal only.** **No-auth: no.** Code alignment deferred to future approved fix batch. | **decided (policy)** | 2026-06-27 |

**Not approved in this batch:** DISC-WIN-01 (win-finalize cost_intelligence idempotency), BLH-E2E-001 (Ops Gantt `_DELETED` filter), W18 product fixes without UAT/pilot findings.

---

## Decided notes (2026-06-27 — Marketing Command Centre Run A parking)

**Decision title:** Marketing Command Centre Run A — parked until post P0/P1 hardening

| ID | Sam decision |
|----|--------------|
| **SAM-MKT-001** | **Run A is not approved** during the current 30-day hardening / Go-Live P0/P1 release-readiness freeze. Marketing Command Centre rebuild remains **planned, not cancelled**. |

**Reason:** Run A includes new module work, UI routing changes, planner/template work, migration work, and shared wiring files (`App.jsx`, `Marketing.jsx`, `dev-api.mjs`). This conflicts with the hardening freeze and risks entangling with active P0/P1 stabilisation.

**Status:** Parked.

**Future start conditions** (all required before reconsidering Run A):

- P0/P1 hardening checkpoints complete  
- Shared files committed and quiet  
- Clean branch can be cut from the correct base  
- Sam explicitly approves the Marketing Run A start phase  
- Sam confirms whether migration **122** is still the correct next file number (re-check highest migration)  
- Run A security scope reduced to **baseline verification** (`npm run test:qa-sec-baseline` / QA-001) — **not** auth middleware changes  

**Approved now:** Docs only.

**Not approved during freeze:**

- Claude Run A  
- Product code  
- Route changes  
- Migration 122 (`122_marketing_command_centre_mvp.sql`)  
- Security middleware edits (`dev-api.mjs`)  
- Marketing UI rebuild / broad refactor  
- W17 / W18 changes  
- Commits / deploys  

**Security note:** `/api/marketing` and `/api/intelligence` are already admin-gated via blanket middleware in `server/dev-api.mjs`. Run A security workstream superseded by QA-001 during freeze.

**Planning refs:** [MARKETING_RUN_A_FREEZE_PARKING_RESULT.md](../planning/MARKETING_RUN_A_FREEZE_PARKING_RESULT.md) · [MARKETING_RUN_A_B_HANDOFF_READINESS.md](../planning/MARKETING_RUN_A_B_HANDOFF_READINESS.md)

**Branch / checkpoint update (2026-06-27, later same day):** Several SAM-MKT-001 reopen conditions are now *mechanically* satisfied — recorded for when Sam considers reopening (this does **not** change the parked decision):

- ✅ Go-Live **P0 + P1 commits landed** (`8fe2603` stabilise hardening sprint · `f656d63` external-seam live-fire) — working tree is **clean** (0 modified / 0 untracked).
- ✅ Branch **`marketing-run-a`** created + pushed to `origin`, cut from the clean `portal-v2` integration tip. **Note:** it is a *child of `portal-v2`* (48 commits ahead of `main`, 0 behind), **not** an independent branch off `main` — when merged it carries the whole portal-v2 stack; `main` auto-deploys to prod, so keep Run A → staging only.
- ✅ Migration number **re-checked**: highest on disk is `121`; **`122_marketing_command_centre_mvp.sql` remains the correct next number** (not created).
- ⛔ **Still required to reopen Run A:** explicit Sam approval of the Run A start phase — **H1** (handoff sign-off) + **H2** (authorise migration 122). A clean branch + clean tree do **not** constitute approval.

Ref: [MARKETING_RUN_A_BRANCH_DOC_ALIGNMENT_RESULT.md](../planning/MARKETING_RUN_A_BRANCH_DOC_ALIGNMENT_RESULT.md)

---

## Decided notes (2026-06-27 — W18 supervised pilot)

| ID | Sam decision |
|----|--------------|
| SAM-W18-PILOT-01 | Supervised client pilot approved **with controls — on hold**. Do not invite real client yet. Execute when first signed contract is active in Hub and Sam confirms. Candidate: first building contract. Production unsupervised remains NO-GO. |
| SAM-PORTAL-CROSSROLE | Operating policy above; API may still admit employee until fix batch — staff must not use employee portal-admin overview in production workflow. |
| P1-W18-04 | Pilot: JWT primary; legacy token not for contractual actions. Hardening: C (SOP + monitor). Unsupervised prod: still requires hardening (option A). |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | **SAM-MKT-001 branch update:** `marketing-run-a` branch created; P0/P1 commits landed + tree clean; migration 122 re-confirmed next. Run A **still parked** pending H1/H2 ([MARKETING_RUN_A_BRANCH_DOC_ALIGNMENT_RESULT.md](../planning/MARKETING_RUN_A_BRANCH_DOC_ALIGNMENT_RESULT.md)) |
| 2026-06-27 | **SAM-MKT-001:** Marketing Command Centre Run A **parked** until post P0/P1 hardening; docs-only update ([MARKETING_RUN_A_FREEZE_PARKING_RESULT.md](../planning/MARKETING_RUN_A_FREEZE_PARKING_RESULT.md)) |
| 2026-06-27 | **W18 pilot timing:** SAM-W18-PILOT-01 **on hold** — approved with controls; wait for signed contract + active Hub job + Sam final go-ahead |
| 2026-06-27 | **W18 pilot:** SAM-W18-PILOT-01 supervised client pilot **approved with controls**; SAM-PORTAL-CROSSROLE decided; P1-W18-04 pilot policy (JWT primary). Pack: `W18_SUPERVISED_CLIENT_PILOT_EXECUTION_PACK.md` |
| 2026-06-27 | Sam approval — DISC-002 accepted closed; W18-UAT-EXEC-01 approved to proceed |
| 2026-06-27 | SAM-W11-002 accepted closed — W11-PO-SEC-01 |
| 2026-06-27 | Forward scout — work-ahead queue; DRIFT-004 doc-closure queued (SAM-W07-002 decided) |
| 2026-06-26 | P1-W18-04 registered as open production gate (cross-workflow audit); W18-UAT-01 parked note |
| 2026-06-25 | SAM-W08-001–003 marked decided (W08 acceptance) |
| 2026-06-25 | W08 mapped — SAM-W08-001–003 added |
| 2026-06-25 | SAM-W07-001–004 marked decided (W07 acceptance) |
| 2026-06-25 | W07 mapped — SAM-W07-002/003/004 added |
| 2026-06-25 | Batch B parking lot refined (code-verified); SAM-W07-001 unchanged |
| 2026-06-25 | SAM-W06-001 added (W06 map) |
| 2026-06-24 | SAM-W07-001 parking; P0-A5 complete note |
| 2026-06-24 | SAM-W02-002, SAM-W03-001, SAM-W04-001, SAM-W05-003, SAM-W05-006 marked decided; P0-A1–A6 approved for skeletons |
| 2026-06-24 | SAM-W05-006 + W05-STRUCTURAL-001 |
| 2026-06-24 | SAM-W05-002–005 added; SAM-W05-001 recommendation clarified |
| 2026-06-24 | SAM-W02-002 clarified: advisory only during hardening; W01/W02 cross-check doc cleanup |
| 2026-06-22 | SAM-W02-003, SAM-W02-004 added; SAM-W02-002 recommendation clarified |
