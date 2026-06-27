# Bug-Fixing Mission Plan

**Purpose:** Coordination surface between **Troubleshoot Agent** (implementation when approved) and **Cursor forward scout** (audit/test planning).  
**Current mode:** **TEST-DISCOVERY-WAVE-01** — implementation **paused** unless Critical or Sam-approved batch.  
**Control queue:** [HARDENING_WORK_AHEAD_QUEUE.md](./HARDENING_WORK_AHEAD_QUEUE.md) · [TEST_DISCOVERY_WAVE_01.md](./TEST_DISCOVERY_WAVE_01.md)  
**Last updated:** 2026-06-27

---

## Ownership

| Role | Owns |
|------|------|
| **Troubleshoot Agent** | Approved code batches, regression runs, BUG_REGISTER closure after Sam acceptance |
| **Cursor (scout)** | Test matrix gaps, work-ahead queue, release readiness notes, doc-only batches, batch prompts |
| **Sam** | Batch approval, W18 UAT execution, open decisions in [SAM_DECISION_LOG.md](./SAM_DECISION_LOG.md) |
| **Claude / W17** | Workforce W17 — **out of scope** for both agents unless Sam redirects |

---

## Closed batches (do not reopen)

| Batch | Defects | Status |
|-------|---------|--------|
| JOB-SPINE-01 | W04-DRIFT-001, W06-DRIFT-001 | **Accepted closed** 2026-06-27 |
| W11-PO-SEC-01 | W11-DRIFT-003 | **Accepted closed** 2026-06-27 |
| DRIFT-004-DOC-01 | DRIFT-004, W06-DRIFT-004 | **Accepted gap closed** 2026-06-27 |
| W01-CONVERT-01 | W01-DRIFT-005 | **Accepted closed** 2026-06-27 |
| W03-FEE-LINK-01 | W03-DRIFT-008 | **Accepted closed** 2026-06-27 |
| OUTCOME-STAMP-01 | W02-DRIFT-001 | **Shipped** — pending Sam acceptance |
| PTSA-WARNING-01 | W03-DRIFT-002 | **Shipped** — pending Sam acceptance |

**P1 follow-up (not JOB-SPINE-01):** P1-JOBS-API-001 — Dropbox fields on server PATCH.

---

## 1. Bug mission summary

### Release posture (as of 2026-06-27)

| Surface | Gate |
|---------|------|
| **Global production** | **NO-GO** — P1-W18-04 open + gaps documented |
| **Staff internal (Batch A–C P0 scope)** | **CONDITIONAL GO** |
| **RFQ/tender matching** | **CONDITIONAL GO** — DRIFT-004 pending doc closure |
| **Ops / procurement / schedule / WHS** | **CONDITIONAL GO** — P0-C closed; gaps documented |
| **W18 internal automated UAT** | **GO** |
| **W18 client pilot** | **CONDITIONAL GO** — W18-UAT-01 not yet executed |
| **W18 production (unsupervised)** | **NO-GO** — P1-W18-04 open |

### Severity counts (open only, excluding shipped/closed)

| Severity | Count | Key IDs |
|----------|-------|---------|
| **Critical** | **0** | — |
| **High** | **8** | W01-DRIFT-005, W02-DRIFT-006, W03-DRIFT-002, W03-DRIFT-008, W05-STRUCTURAL-001, W06-DRIFT-002, W06-DRIFT-004/DRIFT-004, W15-DRIFT-003 |
| **Medium** | **~25** | W01/W02/W03/W04/W05/W06/W07/W08/W09 parking items + W13/W18 gaps |
| **Low** | **~8** | Docs, dead columns, Low score language drift |

> Note: W02-DRIFT-001 (High) shipped as OUTCOME-STAMP-01; excluded from count pending Sam closure.
> W15-DRIFT-003 is W17-owned (Claude); not touched by this agent.

### Biggest release blockers

1. **P1-W18-04** — Legacy token POST on non-v2 projects: production NO-GO gate. Sam decision required.
2. **W03-DRIFT-002** — PTSA signed without job or site_address: silent failure, no warning to staff. SAM-W03-001 decided (Option B), fix approved.
3. **W03-DRIFT-008** — `fee_proposal_id` never written; W04 dual-track handoff blind. Approved fix queue.
4. **W01-DRIFT-005** — Convert-to-job undertested; site_address UX gap. Approved fix queue.

### Biggest decision blockers

1. **P1-W18-04** — production gate (open Sam decision)
2. **SAM-W06-001** — canonical RFQ path Engine vs Package (open)
3. **SAM-W05-001** — board aggregates rfqs only vs packages (open)
4. **SAM-W03-004** — canonical PTSA signed date field (open)
5. **SAM-W01-004** — mirror CRM interactions to lead timeline (open)

### Safest next 3 batches

| Rank | Batch | Why |
|------|-------|-----|
| 1 | ~~**W11-PO-SEC-01**~~ | **closed — accepted 2026-06-27** |
| 2 | **DRIFT-004-DOC-01** | Doc-only closure; SAM-W07-002 already decided; no code risk |
| 3 | **PTSA-WARNING-01** | High handoff risk; SAM-W03-001 decided; test-first, then narrow UI + server warning |

---

## 2. Full bug queue

> Bucket key: **1** Fix now · **2** Test first then fix · **3** Needs Sam decision · **4** Defer/parking · **5** Fixed/closed

| Rank | Bug ID | Workflow | Sev | Bucket | Why it matters | Test status | Decision needed | Batch | Action |
|------|--------|----------|-----|--------|----------------|-------------|-----------------|-------|--------|
| ~~1~~ | ~~**W11-DRIFT-003**~~ | W11 PO | High | **1** | ~~Employee can issue POs~~ | W11-SEC-02 | SAM-W11-002 | **W11-PO-SEC-01** | **closed — accepted 2026-06-27** |
| 2 | **DRIFT-004 / W06-DRIFT-004** | W06/W07 RFQ | High | **2** | Email-only recipients never IMAP-matched; SAM-W07-002 decided manual-resolve only → close as accepted gap | W06-API-08 proves manual path | SAM-W07-002 **decided** (C) | **DRIFT-004-DOC-01** | Doc closure in register + RFQ SoT + workflow §22 |
| 3 | **W03-DRIFT-002** | W03 PTSA | High | **2** | PTSA signed without job/site_address; no warning to staff; SAM-W03-001 decided Option B | W03-UI-02, W03-API-07 missing | SAM-W03-001 **decided** (B) | **PTSA-WARNING-01** | Warning banner on mark-signed response; block tender stage without site_address/job_id |
| 4 | **W01-DRIFT-005** | W01 Sales | High | **2** | Convert-to-job fails at API; site_address UX gap; high drop-off risk | W01-API-08 missing | None | **W01-CONVERT-01** | Write test first; fix convert guard and site_address UX |
| 5 | **W03-DRIFT-008** | W03 PTSA | High | **2** | `fee_proposal_id` never written; W04 cannot confirm dual-track; silent handoff gap | W03-API-05b missing | None | **W03-FEE-LINK-01** | Write test first; stamp fee_proposal_id on accept/PTSA sign |
| 6 | **W02-DRIFT-006** | W02 Sales | High | **3** | Stage gate bypass at qualification level; SAM-W02-002 says advisory only — no hard block | W02-API-03b (baseline) | SAM-W02-002 **decided** advisory only | Defer hard-block | Document + add bypass logging only |
| 7 | **W05-STRUCTURAL-001** | W05 Tender | High | **3** | Board model too blunt for real tender ops; SAM-W05-006 decided no redesign during hardening | None | SAM-W05-006 **decided** (B future model) | Parking | Map + document current behaviour only |
| 8 | **W06-DRIFT-002** | W06 RFQ | High | **3** | Dual canonical paths Engine vs Package; staff confusion | W06-UI-01 | SAM-W06-001 open | Decision first | Engine primary per queue default — awaits Sam |
| 9 | **W15-DRIFT-003** | W15 Workforce | High | **4** | Deputy E2E not verified; W17-owned | W15-E2E-01 | — | W17 scope | Do not touch |
| 10 | **W13-SEC-004** | W13 Diary | High | **4** | site_diary permissive RLS; future risk when portal clients active | W13-SEC-04 probe | — | Parking | Document; migration later |
| 11 | **W01-DRIFT-006** | W01 Sales | Med | **3** | CRM interactions not on lead timeline | W01-API-05 | SAM-W01-004 open | Decision first | Mirror or link only |
| 12 | **W01-DRIFT-003** | W01 Sales | Med | **3** | Stage gates UI-only; SAM-W02-002 advisory | W01-E2E-03 | SAM-W02-002 decided advisory | Batch with W02-DRIFT-006 advisory logging | Logging only |
| 13 | **W01-DRIFT-007** | W01 Sales | Med | **3** | AI transcript writes lead fields without provenance | W01-API-07 | SAM-W02-004 open | Decision first | Wait for SAM-W02-004 |
| 14 | **W01-DRIFT-008 / W02-DRIFT-005** | W01/W02 | Med | **4** | LEAD_STAGES constant unused in 4+ places | — | None | Defer | Low-risk cleanup; no business rule; do after PTSA batch |
| 15 | **W01-SEC-003** | W01 Public | Med | **3** | Public enquiry no rate limit/honeypot | W01-SEC-03 | SAM-W01-003 open (defer) | Decision first | Document; rate limit in P1 security sprint |
| 16 | **W02-DRIFT-003** | W02 Sales | Med | **3** | qualify_score COALESCE null=0; misleading partial qualification | W02-API-01 | SAM-W02-001 open | Decision first | Wait for score display decision |
| 17 | **W02-DRIFT-004** | W02 Sales | Med | **3** | AI transcript provenance gap | W02-API-06/07 | SAM-W02-004 open | Decision first | SAM-W02-004 blocks |
| 18 | **W02-DRIFT-007** | W02 Sales | Med | **3** | Nurture/lost as stages vs outcomes; model risk | — | SAM-W02-003 open | Decision first | Document only |
| 19 | **W03-DRIFT-003** | W03 Fee | Med | **3** | FeeProposalWizard direct Supabase writes | W03-UI-01 | SAM-W03-002 open | Decision first | API-only eventually; consistency risk documented |
| 20 | **W03-DRIFT-004** | W03 Fee | Med | **3** | Split proposal template sources | — | SAM-W03-003 open | Decision first | Unify post-hardening |
| 21 | **W03-DRIFT-005** | W03 PTSA | Med | **4** | PTSA template hardcoded vs editable | — | — | Parking | No user-facing impact yet |
| 22 | **W03-DRIFT-006** | W03 PTSA | Med | **3** | Duplicate signed-date fields | — | SAM-W03-004 open | Decision first | Needs canonical field decision |
| 23 | **W03-DRIFT-007** | W03 Fee | Med | **4** | Generated proposal snapshot drift | — | — | Parking | Unconfirmed impact; defer |
| 24 | **W03-DRIFT-009** | W03 PTSA | Med | **4** | PTSA block hidden at fee_proposal stage | W03-UI-03 | — | After PTSA-WARNING-01 | Can bundle with PTSA batch |
| 25 | **W04-DRIFT-002** | W04 Jobs | Med | **4** | Fact provenance gap on job create | W04-API-01 | — | Parking | Blocked by facts service (migration 069) |
| 26 | **W04-DRIFT-003** | W04 Jobs | Med | **4** | Address dedup asymmetry | W04-API-02 | — | Parking | Risk documented; no user-visible error reported |
| 27 | **W04-DRIFT-006** | W04 Buildxact | Med | **4** | Dual buildexact_job_id jobs vs projects | W04-API-04 | — | Parking | Unconfirmed propagation |
| 28 | **W05-DRIFT-001** | W05 Tender | Med | **3** | Board/Detail direct Supabase reads | W05-SEC-01 | SAM-W05-006 decided no redesign | Parking | Risk documented; fix when board redesign approved |
| 29 | **W05-DRIFT-004** | W05 Tender | Med | **3** | Win/lose does not sync leads pipeline | W05-API-07 | SAM-W05-004 open | Decision first | SAM-W05-004 open; checklist warns |
| 30 | **W05-DRIFT-007** | W05 Tender | Med | **4** | DRIFT-014 may affect TenderDetail accept | — | — | Parking | Unconfirmed; W08 mitigated |
| 31 | **W05-DRIFT-009** | W05 Tender | Med | **4** | Won tender ops not fully proven | W05-E2E-01 | SAM-W05-005 open | Decision first | Checklist covers gap |
| 32 | **W06-DRIFT-003** | W06 RFQ | Med | **4** | SOP/UI naming mismatch Engine vs Packages | — | — | Parking | Doc-only when path decided |
| 33 | **W06-DRIFT-005** | W06 RFQ | Med | **4** | Dual outbound send paths | W06-API-05/06 | — | Parking | Threading fixed; unify post-hardening |
| 34 | **W07-DRIFT-004** | W07 RFQ | Med | **4** | Resend no mailbox Sent | — | SAM-W07-001 decided (A, Hub SoT) | Parking | Documented; no transport change |
| 35 | **W07-DRIFT-005** | W07 IMAP | Med (High) | **4** | Resend strips Message-ID; match risk | W07-API-04 | SAM-W07-004 decided (A, doc only) | Parking | Document fallbacks only |
| 36 | **W07-DRIFT-007** | W07 IMAP | Med | **4** | First IMAP poll skips backlog | W07-API-07 | SAM-W07-003 decided (plan import) | Parking | Plan one-time backlog import (no code now) |
| 37 | **W07-DRIFT-008** | W07 IMAP | Med | **4** | Manual resolve no PDF/amount | W07-API-08 | — | Parking | Acceptable if staff re-enter |
| 38 | **W07-DRIFT-009** | W07 IMAP | Med | **4** | Matcher idempotency baseline missing | MATCH-14/15 | — | Parking | Test gap only |
| 39 | **W08-DRIFT-002** | W08 Accept | Med | **4** | Received amount ≠ accepted amount | W08-API-02 | — | Parking | P0-B4 warned; documented |
| 40 | **W08-DRIFT-003** | W08 Accept | Med | **4** | Tender/Package different accept rules | W08-UI-02 | SAM-W08-002 decided (Tender primary) | Parking | Documented |
| 41 | **W08-DRIFT-005** | W08 Accept | Med | **4** | Accepted quote does not roll up to scope | W08-API-04 | — | Parking | P0-B4 gap-documented |
| 42 | **W08-DRIFT-007** | W08 Buildxact | Med | **4** | Buildxact accept sync is stub | W08-API-05 | — | Parking | Confirmed stub; no release block |
| 43 | **W08-DRIFT-008** | W08 Accept | Med | **4** | Manual resolve without amount → weak accept | W08-API-02 | — | Parking | Documented; alias W07-DRIFT-008 |
| 44 | **W09-DRIFT-002** | W09 Win | High | **4** | Package-only accepts not in win wizard | W09-API-05A-E | SAM-W09-002 decided (B warn) | Parking | P0-B2 warn-only; deferred sync |
| 45 | **W09-DRIFT-003/006** | W09 Win | High | **4** | quoted_amount skip cost_intel | W09-API-02/08 | — | Parking | P0-B4 warned |
| 46 | **W09-DRIFT-004** | W09 Win | Med | **3** | leads.stage not synced from tender win | W09-API-04 | SAM-W09-003 open | Decision first | Checklist warns; auto-sync after decision |
| 47 | **W10-DRIFT-002** | W10 Procure | Med | **4** | Dual SSoT procurement vs schedule fields | W10-API-02 | — | Parking | Deprecation tracked; no urgent fix |
| 48 | **W11-DRIFT-009** | W11 PO | Med | **4** | PO row persists when email fails; idempotency suppresses resend | W11-API follow-up | — | Parking | Do not fix in current pass |
| 49 | **W12-DRIFT-004** | W12 Schedule | Med | **4** | Cascade ignores typed dependencies | W12-API-04 | — | Parking | Confirmed; no user complaints yet |
| 50 | **W13-DRIFT-001** | W13 Diary | Med | **4** | photo_paths unused | W13-DRIFT-01 | — | Parking | Confirmed intentional for now |
| 51 | **W13-DRIFT-003** | W13 Diary | Med | **4** | Three media silos | W13-DRIFT-01 | SAM-W13-002 decided (no merge) | Parking | Confirmed intentional |
| 52 | **W13-SEC-005** | W13 Diary | Med | **4** | Employee calls AI structure (cost risk) | — | — | Parking | Low real risk; add role gate later |
| 53 | **W14-DRIFT-002** | W14 WHS | Med | **4** | WHS template coverage 1/N | W14-API-02 | — | Parking | Expand post-hardening |
| 54 | **W14-DRIFT-007** | W14 WHS | Med | **4** | Public induction UUID (no obfuscation) | W14-SEC-01 | — | Documented | Tokenised link recommended pre-scale |
| 55 | **W18-DRIFT-001** | W18 Portal | Med | **4** | Documents tab hollow | W18-API-03 | — | Parking — P1-W18-01 | After UAT |
| 56 | **W18-DRIFT-003** | W18 Portal | Med | **4** | Site diary draft → portal dead-end | W18-API-02 | — | Parking — P1-W18-02 | After UAT |
| 57 | **W18-DRIFT-004** | W18 Portal | Med | **4** | v2 admin API vs UI role mismatch | W18-UI-01 | — | Parking | UI admin-only is the gate |
| 58 | **W18-DRIFT-006** | W18 Portal | Med | **4** | Partial claim re-notify blocked | W18-API-04 | — | Parking | Needs mig 108 |
| 59 | **W18-DRIFT-007** | W18 Portal | Med | **4** | Legacy token POST non-v2 (P1-W18-04) | W18-SEC-04 | **P1-W18-04 open** | **Sam decision** | Production NO-GO |
| 60 | **W02-DRIFT-002** | W02 Sales | Low | **3** | SOP score language % vs /8 | W02-API-01 | SAM-W02-001 open | Decision first | Fix SOP wording when decided |
| 61 | **W02-DRIFT-008** | W02 Sales | Low | **4** | Scorecard weighted ≠ qualify score | — | — | Parking | Docs-only drift |
| 62 | **W02-DRIFT-009** | W02 Sales | Low | **4** | Architect tender skips qualification UI | — | — | Parking | Intentional variant; document |
| 63 | **W03-DRIFT-001** | W03 PTSA | Low | **4** | ptsa_scope_notes dead column | — | — | Parking | Schema cleanup post-hardening |
| 64 | **W04-DRIFT-004** | W04 Jobs | Low | **4** | buildexact_job_id not set at conversion | — | — | Parking | Later manual/webhook |
| 65 | **W05-DRIFT-002** | W05 Tender | Low | **4** | Archive tender no server API | — | SAM-W05-002 open | Decision first | Low urgency |
| 66 | **W05-DRIFT-006** | W05 Tender | Low | **4** | Win emails split across 2 API calls | W09-API-01 | — | Parking | Document pattern; no functional bug |
| 67 | **W06-DRIFT-007** | W06 RFQ | Low | **4** | Dual coverage calculators | W06-UI-02 | — | Parking | Defer post-P0 |
| 68 | **W09-DRIFT-005** | W09 Win | Med | **4** | Partial cost_intel from accepted trades | W09-API-02 | — | Parking | Per-trade skip documented |
| 69 | **W09-DRIFT-008** | W09 Win | Low | **4** | Win outcome emails split (2 API calls) | W09-API-01 | — | Parking | Pattern documented |
| 70 | **W15-DECISION-FUTURE** | W15 Workforce | Low | **4** | Supervisor approval deferred | — | SAM-W15-001 decided B | Parking | Revisit after crew assignment exists |
| 71 | **W18-DRIFT-005** | W18 Portal | Low | **4** | Portal not auto-enabled on win | W18-API-01 | — | Parking — P1-W18-05 | Manual invite path works |
| 72 | **P1-JOBS-API-001** | RfqEngine | Med | **4** | Dropbox link fields browser-patched | — | — | P1 | JOB-SPINE-01 accepted caveat; no expand |

---

## 3. Decision queue

| Decision ID | Bug IDs blocked | Question | Options | Recommended default | Risk if deferred |
|-------------|-----------------|----------|---------|---------------------|------------------|
| **P1-W18-04** | W18-DRIFT-007 | Legacy token POST on non-v2 projects — disable, JWT, or SOP? | A) Hard-disable all legacy POSTs · B) Require JWT on legacy POSTs · C) SOP + monitor legacy-only | **C** SOP + monitor during hardening; **A** for unsupervised prod | Production NO-GO; residual anonymous POST surface |
| **SAM-W11-002** | W11-DRIFT-003 | Require admin role on `/api/po/issue`? | A) Yes — add `requireRole("admin")` · B) Keep `requireAuth` only | **A — yes** (already in approved queue) | Non-admin staff can issue purchase orders |
| **SAM-W06-001** | W06-DRIFT-002 | Engine vs Package canonical RFQ path? | A) Engine primary — Package post-send snapshot · B) Package Detail primary · C) Merge | **A** — Engine primary; document Package as secondary | Dual-path staff confusion; SOP training gap |
| **SAM-W05-001** | W05-DRIFT-003 | Tender Board aggregate rfqs only or also rfq_packages? | A) rfqs only, document · B) Merge both · C) Package-first | **A** document first; **B** eventually | Board under-reports package-path progress |
| **SAM-W03-004** | W03-DRIFT-006 | Canonical PTSA signed date field? | A) `ptsa_signed_at` · B) `pretender_signed_date` · C) Both with clear roles | **A — `ptsa_signed_at`** | Reporting split; two dates may diverge |
| **SAM-W01-004** | W01-DRIFT-006 | Mirror CRM interactions to lead timeline? | A) Yes mirror · B) No — keep separate · C) Link only, no duplicate rows | **C — link only** | CRM and lead timeline disconnected; staff may miss context |
| **SAM-W05-004** | W05-DRIFT-004 | Auto-sync leads.stage on tender win/lose? | A) Yes on win/lose · B) Manual only · C) Win only | **A eventually; doc gap first** | Won lead still shows `tender` stage in pipeline |
| **SAM-W09-003** | W09-DRIFT-004 | Auto-sync leads.stage from tender win? | A) Yes when lead_id set · B) Manual only · C) Win only | **A eventually; doc gap first** | Same as W05-DRIFT-004 — cross-ref |
| **SAM-W02-001** | W02-DRIFT-002/003 | Qualifying score display: `/8`, %, or both? | A) `/8` internally, fix SOP · B) % only · C) Both | **A — `/8`; fix SOP wording** | SOP says % while UI shows /8 — staff confusion |
| **SAM-W02-003** | W02-DRIFT-007 | Nurture/lost: keep as stages or split to outcome field? | A) Keep as stages · B) Split outcome field | **A during hardening; revisit post-release** | Mixed pipeline/outcome reporting in same column |
| **SAM-W02-004** | W01-DRIFT-007 / W02-DRIFT-004 | AI transcript provenance: activity log, field-level, or no change? | A) Simple activity log · B) Structured field-level · C) No change | **A as smallest-safe interim; B eventually** | Applied AI suggestions leave no per-field audit trail |
| **SAM-W03-002** | W03-DRIFT-003 | FeeProposalWizard: API-only or allow direct Supabase writes? | A) API-only · B) Direct OK · C) Hybrid during hardening | **A eventually; C interim** | Bypasses audit, server validation; no immediate data loss |
| **SAM-W03-003** | W03-DRIFT-004/005 | Unify PTSA template with fee proposal system? | A) Yes, unified · B) Keep embedded PTSA · C) Unify post-hardening | **C** | Consistency risk only; no immediate function break |

---

## 4. Batch plan (next 3 batches)

---

### Batch 1 — W11-PO-SEC-01

**Included bugs:** W11-DRIFT-003 (SAM-W11-002)  
**Excluded:** All other W11 bugs (W11-DRIFT-009 must not be touched); W12/W13/W14/W15; W17; W18

**Why this batch now:**  
One-route security win. The recommended default (admin-only) is agreed in the work-ahead queue. Baseline test infrastructure already exists in `scripts/batch-a/w11-batch-po.mjs`. No schema change. No UI change. No business workflow change.

**SAM note:** SAM-W11-002 is still marked `open` in the decision log. **Sam must confirm "yes, Option A"** before this batch begins. The queue has pre-positioned it as approved — this plan asks Sam to make it official.

**Files likely affected:**

| File | Change |
|------|--------|
| `server/lib/module4Routes.mjs` | Line 577: add `requireRole("admin")` to `POST /api/po/issue` |
| `scripts/batch-a/w11-batch-po.mjs` | Add W11-SEC-02: non-admin token → 403 assertion |

**Tests to write/update:**

- **W11-SEC-02** (new): Employee-token POST to `/api/po/issue` returns 403
- **W11-SEC-02b** (optional): Supervisor-token same check if supervisor role exists

**Regression gate:**
```bash
npm run test:w11-batch-po:write
npm run test:batch-a:write
npm run build
npm run test:cleanup-artifacts   # dry-run only
```

**Stop conditions:**

- `requireRole` import not present → add import (already imported via `requireAuth.mjs` pattern, confirm)
- Any W11/W15/W17 route touched beyond `/api/po/issue` → stop
- Build fails → stop and report

**Expected report:** Single-route guard added. W11-SEC-02 pass. Regression green. W11-DRIFT-003 closed.

---

### Batch 2 — DRIFT-004-DOC-01

**Included bugs:** DRIFT-004, W06-DRIFT-004  
**Excluded:** All product code; W07 matcher; W06 send path

**Why this batch now:**  
SAM-W07-002 is **decided** (Option C: manual-resolve only). The bug register and source-of-truth docs still show these as `open`, creating confusion. This is a doc-only closure — no code change, no schema change.

**Files likely affected:**

| File | Change |
|------|--------|
| `docs/qa/BUG_REGISTER.md` | Close DRIFT-004 and W06-DRIFT-004 as accepted manual-resolve gap |
| `docs/qa/RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH.md` | §8 note — email-only recipients: manual-resolve only; no auto-match |
| `docs/qa/workflows/06_RFQ_PACKAGE_SCOPE_EXTRACTION.md` | §22 — confirm gap accepted |
| `docs/qa/workflows/07_RFQ_SEND_QUOTE_MATCHING.md` | §22 — confirm gap accepted |

**Tests to write/update:**

- No new product test required
- Optionally add a W06-API-08 note confirming manual-resolve path is the SoT

**Regression gate:**
```bash
npm run build   # verifies no import errors from doc-only changes
```

**Stop conditions:**

- Any product code temptation → stop. This is docs only.

**Expected report:** Two bug entries closed as accepted. SoT doc updated. No code changed.

---

### Batch 3 — PTSA-WARNING-01

**Included bugs:** W03-DRIFT-002 (+ optionally W03-DRIFT-009 if trivially bundleable)  
**Excluded:** W03-DRIFT-003 (Supabase direct writes — SAM-W03-002 open); W03-DRIFT-004/006 (open decisions); W01-DRIFT-005 (separate batch)

**Why this batch now:**  
SAM-W03-001 is **decided** (Option B): PTSA signed may be stored; app must show hard warning and block tender/job handoff until site_address/job_id resolved. Currently the code at line 720-722 of `salesRoutes.mjs` silently swallows the `convertLeadToJob` skip — no warning reaches the frontend. The `provisioning.jobId` is already returned but the frontend ignores it.

**Test-first requirement:** Write W03-UI-02 and W03-API-07 before touching product code.

**Files likely affected:**

| File | Change |
|------|--------|
| `server/lib/salesRoutes.mjs` | ~line 770: include warning in response when provisioning.jobId is null (site_address missing) |
| `src/pages/LeadDetail.jsx` | ~line 1231: detect provisioning.jobId null → show hard orange warning banner; block tender stage advance |
| `scripts/batch-a/` (new) | `w03-ptsa-warning.mjs` — W03-API-07: assert mark-signed returns warning when no site_address |

**Tests to write/update:**

- **W03-API-07** (new): POST mark-signed without site_address → 200 ok + `provisioning.siteAddressWarning: true`; no 500
- **W03-UI-02** (new E2E or manual): After mark-signed with no address → UI shows warning banner; tender stage advance blocked

**Regression gate:**
```bash
npm run test:w03-ptsa-warning:write   # new script
npm run test:batch-a:write
npm run build
npm run test:cleanup-artifacts   # dry-run
```

**Stop conditions:**

- Any schema change required → stop and report to Sam
- Any W17/W18 file touched → stop
- Attempting to fix W03-DRIFT-003 (fee proposal Supabase writes) → stop, separate decision needed
- Linter fails → fix before committing

**Expected report:** Warning returned from mark-signed when site_address missing. Frontend shows hard banner. Tender stage advance guarded. W03-DRIFT-002 closed (or partially closed if tender gate needs additional stage-gate batch).

---

## 5. Recommendation

**Implement W11-PO-SEC-01 first.**

It is the narrowest-possible code change (one line + one import adjustment on a single route), has a clear and confirmed security justification, uses existing test infrastructure, and touches zero business logic or UI. It will close the only outstanding "parking — P0-C candidate" security item from Batch C. It does not interfere with the PTSA or convert work planned in batches 2 and 3.

**Sam must confirm SAM-W11-002 = Option A (yes, admin-only)** before the agent begins. The decision log still shows it as `open`.

---

## Approved queue (Troubleshoot Agent — implement when Sam says go)

| Priority | Batch | Type | Sam decision required |
|----------|-------|------|-----------------------|
| 1 | **W11-PO-SEC-01** | code + test | SAM-W11-002 → Option A |
| 2 | **DRIFT-004-DOC-01** | doc only | None (SAM-W07-002 already decided) |
| 3 | **PTSA-WARNING-01** | test + code | None (SAM-W03-001 already decided B) |
| 4 | **W01-CONVERT-01** | test + code | None |
| 5 | **W03-FEE-LINK-01** | test + code | None |

## Scout queue (Cursor — no code without Sam)

| Priority | Batch | Type |
|----------|-------|------|
| 1 | **DRIFT-004-DOC-01** | doc (can be done by scout or agent) |
| 2 | **RELEASE-READINESS-01** | doc |
| 3 | Test matrix rows for W01-API-08, W03-UI-02, W11-SEC-02 | test plan |

## Parked

| Item | Reason |
|------|--------|
| W18-UAT-01 | Manual checklist accepted — await staff execution |
| W18 product fixes | No fixes from UAT assumptions |
| W17 Workforce | Claude-owned — do not touch |
| W02-DRIFT-006 hard-block | SAM-W02-002 advisory only |
| W05-STRUCTURAL-001 redesign | SAM-W05-006 no redesign during hardening |

---

## Regression gate (all code batches)

```bash
npm run test:batch-a:write
npm run build
npm run test:cleanup-artifacts   # dry-run only — never --confirm
```

Plus batch-specific: `test:w11-batch-po:write`, `test:w03-ptsa-warning:write`, `test:w02-qualification:write`, etc.

**Note:** Restart API (`node server/dev-api.mjs` or nodemon) after `salesRoutes.mjs` / route changes if tests fail on stale server.

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | Full triage pass — bug queue, decision queue, 3-batch plan, severity counts updated |
| 2026-06-27 | Initial mission plan |
