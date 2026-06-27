# Cross-Workflow Audit — Acceleration Pack

**Date:** 2026-06-26  
**Mode:** `/harden audit cross-workflow-release-readiness-fast-sweep`  
**Scope:** Read-only audit + narrow QA doc updates. **No product code, schema, route, or UI changes.**

**Primary sources:** [WORKFLOW_MAP_MASTER.md](./WORKFLOW_MAP_MASTER.md) · [BUG_REGISTER.md](./BUG_REGISTER.md) · [SAM_DECISION_LOG.md](./SAM_DECISION_LOG.md) · [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md) · [30_DAY_HARDENING_TRACKER.md](./30_DAY_HARDENING_TRACKER.md) · [W18_CLIENT_PORTAL_RELEASE_READINESS_REVIEW.md](./W18_CLIENT_PORTAL_RELEASE_READINESS_REVIEW.md) · `docs/qa/workflows/*.md`

**W18 UAT:** [W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md](./W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md) **accepted and parked** — pending manual execution (W18-UAT-01). Do not re-plan unless Sam returns checklist results.

**W17 exclusion:** No W17 Workforce files or Claude-owned W17 docs touched in this audit.

---

## 1. Audit summary

### Overall release posture

| Surface | Gate | Rationale |
|---------|------|-----------|
| **Batch A (W01–W05)** | **CONDITIONAL GO** | Mapping complete; P0-A1–A6 shipped; batch-a regression green. **11 open High** sales/tender handoff drifts remain; many matrix rows still `missing` despite partial regression pass. |
| **Batch B (W06–W09)** | **CONDITIONAL GO** | P0-B1–B5 shipped; matcher + accept/win tests green. **DRIFT-004** (email-only recipients) open High — SAM-W07-002 decided manual-resolve only (doc, not auto-match). |
| **Batch C (W10–W15)** | **CONDITIONAL GO** | P0-C1–C5 + P0-D1 closed with baseline tests. W16 not in workflow map master index. |
| **Batch D W18 Client Portal** | **CONDITIONAL GO** (pilot) · **NO-GO** (prod) | Automated tests green (SEC-04, API-01, UI-01, P0 suite). **W18-UAT-01** not executed. Prod blocked by P1-W18-04, documents SOP, win→portal enablement. |
| **Global** | **CONDITIONAL GO** | Staff/internal workflows usable with documented gaps. Unsupervised client production **NO-GO**. |

**Open Critical defects:** **0** (all historical Critical entries fixed or closed — QA-001, DRIFT-001, DRIFT-010).

**Open High defects:** **11** (see §2).

### Biggest blockers

1. **W18 production rollout** — P1-W18-04 (legacy anonymous POST on non-v2 projects), documents exposure SOP (W18-DRIFT-001), win→auto-enable portal (W18-DRIFT-005), **W18-UAT-01** manual smoke not run.
2. **Sales → tender handoff integrity** — W04-DRIFT-001 / W06-DRIFT-001 (browser Supabase job insert bypasses server dedup/normalisation); W03-DRIFT-008 (`fee_proposal_id` never written); W01-DRIFT-005 / W03-DRIFT-002 (convert/PTSA without `site_address`).
3. **DRIFT-004 email-only recipients** — High; SAM-W07-002 decided manual-resolve only — needs register closure as documented acceptance, not silent drift.
4. **Documentation drift** — [RELEASE_READINESS.md](./RELEASE_READINESS.md) **does not exist**; [WORKFLOW_MAP_MASTER.md](./WORKFLOW_MAP_MASTER.md) stops at W15 (W18 mapped in `workflows/18_*` but not indexed); tracker line 50 still lists DRIFT-010 as open (fixed 2026-06-25); test matrix summary counts dated 2026-06-22 understate current pass rate.
5. **Sam decisions without default** — SAM-W01-004 (CRM → lead timeline mirror) blocks CRM handoff fix design.

### Fastest safe next batch

**Batch JOB-SPINE-01 (test-first → smallest fix):** Write W04-API-02 + W06-API-03 regression tests for `persistRfqs` / RfqEngine direct Supabase job insert; then route job creation through `POST /api/jobs` only. Sam default: align with SOURCE_OF_TRUTH jobs spine. **Excludes** SAM-W06-001 canonical path merge and DRIFT-004 email-only scope.

---

## 2. Critical / High open defects

| ID | Workflow | Severity | Why it matters | Existing test coverage | Missing test coverage | Recommended next action | Fix now / defer / needs Sam |
|----|----------|----------|----------------|------------------------|----------------------|-------------------------|----------------------------|
| W01-DRIFT-005 | W01 | High | Convert-to-job fails or skips when `site_address` missing; UI gate checks `job_id` not address | W01-API-02 pass (website chain); convert path undertested | W01-API-08 convert requires `site_address` | Write W01-API-08; align UI gate with server validation | **Fix now** (after test) |
| W02-DRIFT-001 | W02 | High | `won_at` / `lost_at` / `lost_reason` never stamped — reporting and handoff blind | None dedicated | W02-API-04 | Write W02-API-04; smallest PATCH handler stamp | **Fix now** (after test) |
| W02-DRIFT-006 | W02 | High | Stage gate bypass — qualification consequences (shared with W01-DRIFT-003) | W02-API-03 gap-documented (advisory) | W02-API-03 enforcement or logging baseline | Per **SAM-W02-002**: log/flag bypasses; no hard-block yet | **Defer hard-block** · **Fix now** logging/tests |
| W03-DRIFT-002 | W03 | High | PTSA signed without job when `site_address` missing | Partial via mark-signed flow | W03-UI-02 warning visibility | Per **SAM-W03-001**: warning-only UX test + doc | **Fix now** (warning UX test) |
| W03-DRIFT-008 | W03 | High | `fee_proposal_id` never written; dual-track handoff unclear | W03-API-05 pass | W03-API-05 extended linkage assertion | Write assertion test; smallest write on accept/sign | **Fix now** (after test) |
| W04-DRIFT-001 | W04 | High | RfqEngine `persistRfqs` inserts job via browser Supabase — skips dedup, facts, normalisation | W04-API-02 **missing** | W04-API-02 | **Batch JOB-SPINE-01** — test then route via API | **Fix now** (after test) |
| W05-STRUCTURAL-001 | W05 | High (design) | Tender Board model may be too blunt for real ops | W05-API-03/08 pass (delete/archive) | Product design review | Document in W05 map; no code until Sam reviews model | **Needs Sam decision** |
| W06-DRIFT-001 | W06 | High | Same as W04-DRIFT-001 — persistRfqs bypass | W06-API-03 **missing** | W06-API-03 | Alias **Batch JOB-SPINE-01** | **Fix now** (after test) |
| W06-DRIFT-002 | W06 | High | Dual canonical paths (Engine vs Package Detail) | W06-API-07 pass (shape); path unification untested | W06-E2E-01 full flow | Document per **SAM-W06-001**; defer merge | **Needs Sam decision** (SAM-W06-001) |
| W06-DRIFT-004 | W06 | High | Email-only recipients have no `rfqs` row | W06-API-08 **missing** | W06-API-08, RFQ-20 | Per **SAM-W07-002**: document manual-resolve; close DRIFT-004 as accepted gap | **Defer fix** · **doc now** |
| DRIFT-004 | W07 | High | Email-only invites invisible to IMAP matcher | MATCH-04 variant **missing**; manual resolve tested | RFQ-20, MATCH-04 variant | Same as W06-DRIFT-004 — document + register closure | **Defer fix** · **doc now** |

---

## 3. Open Sam decisions blocking progress

| Decision ID | Workflow | Why it blocks progress | Recommended default | Risk if deferred |
|-------------|----------|------------------------|---------------------|------------------|
| **SAM-W06-001** | W06 | Blocks unifying Engine vs Package Detail send/create flows | **A** — Engine primary; package = post-send snapshot (document both) | Continued dual-path drift; staff confusion |
| **SAM-W05-001** | W05 | Blocks Tender Board aggregation fix (`rfqs` vs packages) | **B eventually** — document current `rfqs`-only first | Board under-reports package-only activity |
| **SAM-W01-004** | W01 | No default — blocks CRM interaction → lead timeline design | **C** — link only, no duplicate rows (smallest-safe) | CRM and lead timelines stay disconnected |
| **SAM-W03-004** | W03 | Blocks canonical PTSA signed date field choice | **A** — `ptsa_signed_at` canonical | Reporting splits across two date fields |
| **SAM-W05-002** | W05 | Archive reversibility + audit | **Yes** — API + audit (already stated) | Silent archive via frontend Supabase persists |
| **P1-W18-04** | W18 | Legacy token POST on non-v2 projects — prod security/SOP | Deprecate + SOP for remaining B/C POSTs on legacy-only projects | Residual anonymous POST surface on legacy projects |
| **SAM-W02-002** | W02 | Decided — advisory logging, not hard-block | **B** applied | Low — tests can proceed without enforcement |
| **SAM-W07-002** | W07 | Decided — email-only manual-resolve only | Manual queue | Low if documented; High if staff expect auto-match |

**Count blocking safe fixes (no decided default or prod gate):** **5** — SAM-W06-001, SAM-W05-001, SAM-W01-004, SAM-W03-004, P1-W18-04.

---

## 4. Test coverage gaps

Prioritised gaps where tests should be written **before** product fixes.

| Workflow | Missing test | Suggested test ID | Type | Write before fix? |
|----------|--------------|-------------------|------|------------------|
| W01 | Convert requires `site_address` | W01-API-08 | api | **Yes** |
| W02 | Outcome stamps on won/lost | W02-API-04 | api | **Yes** |
| W02 | Gate bypass logging baseline | W02-API-03 (extend) | api/regression | **Yes** |
| W03 | PTSA signed without job warning | W03-UI-02 | e2e/api | **Yes** |
| W03 | `fee_proposal_id` linkage | W03-API-05 (extend) | api | **Yes** |
| W04/W06 | persistRfqs uses server job path | W04-API-02, W06-API-03 | api/regression | **Yes** |
| W06 | Email-only recipient manual path | W06-API-08 | api | **Yes** (doc acceptance) |
| W07 | Email-only no auto-match | RFQ-20 | api/integration | **Yes** (doc acceptance) |
| W05 | Win/lose lead sync gap documented | W05-API-07 | api | No (SAM-W05-004 deferred write) |
| W18 | Manual pilot smoke | W18-UAT-01 | manual | **Yes** (execution, not automation) |
| Batch A | W01-API-04–07, W02-API-01–07, W03-API-01–04 still `missing` in matrix | per matrix | api/e2e | Partial — many covered by batch-a:write but matrix stale |

**Mapped but undertested workflows:** W02 (skeleton), W03 (skeleton), W05 (many matrix rows still `missing` despite API pass rows), W16 (no workflow map file), W17 (excluded from this audit).

---

## 5. Release readiness gate

| Gate | Verdict |
|------|---------|
| **Staff daily operations (Batch A–C)** | **CONDITIONAL GO** — P0 fixes shipped; open High handoff bugs documented; regression suites green for shipped P0 scope |
| **RFQ/tender email matching** | **CONDITIONAL GO** — P0-B1–B5 + matcher green; DRIFT-004 accepted manual path pending doc closure |
| **W18 client portal — internal UAT** | **GO** — automated suite green |
| **W18 client portal — client pilot** | **CONDITIONAL GO** — pending **W18-UAT-01** manual execution |
| **W18 client portal — production (unsupervised)** | **NO-GO** — P1-W18-04, documents SOP, win→portal, Sam sign-off |
| **Global production rollout** | **NO-GO** |

---

## 6. Recommended next fix batch (propose only — do not implement)

### Batch name: **JOB-SPINE-01**

**Goal:** Close W04-DRIFT-001 + W06-DRIFT-001 with regression proof — jobs created only via `POST /api/jobs`.

| Item | Detail |
|------|--------|
| **Included defects** | W04-DRIFT-001, W06-DRIFT-001 |
| **Excluded defects** | W06-DRIFT-002 (SAM-W06-001), DRIFT-004/W06-DRIFT-004 (SAM-W07-002 doc-only), W05-STRUCTURAL-001, all W17 items, W18 prod P1 items |
| **Files likely affected** | `src/pages/RfqEngine.jsx` (persistRfqs job insert), possibly `server/lib/jobsApiRoutes.mjs` (guard/validation only if needed) |
| **Tests required** | `scripts/batch-a/w04-persist-rfqs-job-spine.mjs` (new), `w06-persist-rfqs-job-spine.mjs` (new); register as W04-API-02, W06-API-03 |
| **Regression gate** | `npm run test:batch-a:write` · `npm run test:w06-shape:write` · `npm run build` · `npm run test:cleanup-artifacts` (dry-run) |

### Alternate batch (if Sam prefers security quick win): **W11-PO-SEC-01**

| Item | Detail |
|------|--------|
| **Included** | SAM-W11-002 default A — `requireRole("admin")` on `POST /api/po/issue` |
| **Tests** | Extend W11-SEC baseline |
| **Excluded** | Procurement generation logic, W17, W18 |

---

## 7. Closed without test evidence (spot check)

| Item | Register status | Evidence gap | Action |
|------|-----------------|--------------|--------|
| DRIFT-011 | open — document | No automated test (ops procedure) | **Doc-only** — not a false close |
| W08-DRIFT-004 | parking — mitigated | W08-API-03 **pass** in matrix | OK — has test |
| W09-DRIFT-004 | mitigated | W09-API-04 in ops-readiness suite | OK — has test |
| W06-DRIFT-008 | fixed | W06-UI-02 pass | OK |
| Tracker DRIFT-010 | listed open in tracker §50 | Fixed in register 2026-06-25 | **Tracker corrected** in this audit |

---

## 8. Documentation-only drift (not production blockers)

- `RELEASE_READINESS.md` missing — use this pack + W18 review until `/harden review` creates it
- `WORKFLOW_MAP_MASTER.md` missing W16–W18 index rows (W18 file exists)
- `WORKFLOW_TEST_MATRIX.md` summary counts stale (2026-06-22)
- Batch A matrix rows still `missing` while batch-a:write passes overlapping cases

---

## 9. JOB-SPINE-01 closure (2026-06-27 — accepted)

| Item | Result |
|------|--------|
| Batch | **JOB-SPINE-01 — CLOSED** |
| Defects | W04-DRIFT-001, W06-DRIFT-001 |
| Tests | W04-API-02 + W06-API-03 — `test:w04-w06-job-spine:write` **6/6** |
| Accepted caveat | Targeted client Supabase update for Dropbox link fields only — **do not expand pattern** |
| P1 follow-up | **P1-JOBS-API-001** — allow Dropbox link fields on `PATCH /api/jobs` (future cleanup only) |

**Do not reopen JOB-SPINE-01 for P1-JOBS-API-001.**

---

## 10. Next recommended batch (post JOB-SPINE-01)

### Primary: **OUTCOME-STAMP-01** (test-first)

| Item | Detail |
|------|--------|
| **Goal** | Stamp `won_at` / `lost_at` / `lost_reason` when lead stage → won/lost |
| **Defect** | W02-DRIFT-001 |
| **Test first** | W02-API-04 (extend `w02-qualification.mjs` or new script) |
| **Fix scope** | Smallest PATCH handler change in `server/lib/salesRoutes.mjs` |
| **Sam blocker** | None |
| **Excluded** | Stage gate hard-block (SAM-W02-002 advisory), W17, W18, RFQ path merge |

### Alternate: **W11-PO-SEC-01**

| Item | Detail |
|------|--------|
| **Goal** | `requireRole("admin")` on `POST /api/po/issue` per SAM-W11-002 default A |
| **Test** | Extend W11-SEC baseline |
| **Scope** | One route guard — no procurement logic change |

### Doc-only (no product code): **DRIFT-004-DOC-01**

Close DRIFT-004 / W06-DRIFT-004 as accepted manual-resolve per SAM-W07-002; register + SOP note only.

---

## 11. OUTCOME-STAMP-01 closure (2026-06-27)

| Item | Result |
|------|--------|
| Batch | **OUTCOME-STAMP-01 — shipped** |
| Defect | W02-DRIFT-001 |
| Tests | W02-API-04 — `test:w02-qualification:write` **8 pass + 1 gap** (W02-API-03 advisory unchanged) |
| Fix | `salesRoutes.mjs` PATCH stamps `won_at`/`lost_at` on stage → won/lost; `lost_reason` from body only |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | §11 OUTCOME-STAMP-01 shipped |
| 2026-06-27 | §9 JOB-SPINE-01 accepted closed; §10 next batch OUTCOME-STAMP-01; P1-JOBS-API-001 |
| 2026-06-26 | Initial cross-workflow acceleration audit — fast sweep mode |
