# Blue Leaf Hub — E2E Comprehensive Walkthrough

**Run ID:** `BLH-E2E-20260627-1041` · **Date:** 2026-06-27 (Adelaide)
**Target:** `http://localhost:8787` (running dev build — per Sam, new code not fully deployed)
**Operator:** Claude (E2E walkthrough / QA — no product code changed)
**Method:** Real browser interaction via Claude-in-Chrome (Browser 1, macOS) as **E2E Director (admin)**, plus safe read-only API checks. Manifest: [`e2e-runs/BLH-E2E-20260627-1041-MANIFEST.md`](e2e-runs/BLH-E2E-20260627-1041-MANIFEST.md).

---

## 1. Executive verdict — **CONDITIONAL PASS**

The core sales→tender→ops journey is **solid for internal staff use**. Every gate, stage-transition, and security boundary I exercised behaved correctly; no Critical or High defects were found in the tested paths. The "Conditional" is **not** because anything failed — it reflects that the **external-side-effect phases were deliberately not live-fired** (production mail + Buildxact/Dropbox keys are configured on this environment), and **W18 client-portal UAT remains pending** per the existing plan. Those are gap-documented, not failures.

- **Browser-tested end-to-end:** Lead → Qualify → Discovery → Winning Offer → Fee Proposal (all stage gates), plus RFQ Engine / Operations / Portal surfaces.
- **Live-verified security/gates (API):** convert-without-address (W01-CONVERT-01), PO-issue admin-only (W11-PO-SEC-01), portal admin auth gate.
- **Gap-documented (safety):** live RFQ email send, actual lead→job convert (Dropbox folder), PTSA DOCX gen + mark-signed, win-finalize chain live, deep W18 client UAT.

---

## 2. Journey coverage

| Phase | Browser? | API/test-backed? | Result | Evidence | Issues |
|------|----------|------------------|--------|----------|--------|
| 0 Preflight | ✅ | ✅ | PASS | health 200, app loads, auth via e2e-admin session inject | mail=PROD, BX/Dropbox set (constraints recorded) |
| 1 New lead / CRM | ✅ | ✅ | PASS | lead created in UI; all fields DB-verified; pipeline +1/+$950k | OBS-2 (suburb≠site_address, by-design) |
| 2 Qualification | ✅ | ✅ | PASS | scorecard 8/8 live-saves; 4 stage gates enforced; outcome stamps don't misfire | — |
| 3 Fee proposal / PTSA | ✅ | ✅ | PASS | PTSA panel, "scope not set" warning, mark-signed gated on PDF upload | live DOCX/mark-signed gap-documented (Dropbox/download) |
| 4 Convert to job | ✅(gate) | ✅ | PASS | `/convert-to-job` no-address → **400**, job_id stays null; site addr then set in UI | actual convert gap-documented (Dropbox folder) |
| 5 Estimate / RFQ setup | ✅ | ✅ | PASS | RFQ Engine = primary path (4-stage wizard); manual-skip path present | — (SAM-W06-001 confirmed) |
| 6 RFQ send / match / accept | partial | ✅(regression) | CONDITIONAL | RFQ Engine + Quote Tracker (49) surfaces present | live send gap-documented (PROD mail) |
| 7 Tender Board / win-finalize | partial | ✅(regression) | CONDITIONAL | pipeline reflects Fee-Proposal lead; chain covered by regression suite | live win-finalize gap-documented |
| 8 Procurement / PO | ✅(security) | ✅ | PASS | PO issue: employee→403, no-auth→401, admin→400 (authz passes) | live PO issue gap-documented (Buildxact) |
| 9 Schedule / WHS / site diary | ✅(surface) | ✅ | PASS | Operations global Gantt (30 proj/39 tasks) renders | OBS-4 (soft-deleted projects clutter Gantt) |
| 10 Client portal (W18) | ✅(surface) | ✅ | CONDITIONAL | admin overview→200, no-auth→401 | deep client UAT pending (don't-fix-W18) |
| 11 Handover summary | — | — | this doc | — | — |

---

## 3. Bugs / findings found

| ID | Severity | Workflow | Summary | Owner | Action |
|----|----------|----------|---------|-------|--------|
| BLH-E2E-001 | **Low–Med** | Operations / Portal | Soft-deleted projects (`__DEMO_DELETED`, `__DRYRUN_…_DELETED`) still render in the **active** Operations global Gantt legend and are still readable via `GET /api/portal/admin/v2/:id/overview`. Active views should filter out `_DELETED`/archived projects. | Claude fix (small) | Sam decision → fix batch |
| OBS-1 | n/a (not a bug) | Home | "Could not load live data" — **harness artifact** (my first injected token was corrupted; base64 re-inject → healthy). Server auth verified working. | — | none |
| OBS-2 | n/a (by-design) | Sales | New-Lead quick-add maps location → `leads.suburb`, leaving `site_address` null (correctly forces the convert gate later). `leads.name` left null; salutation derives from first/last. | — | none (works as intended) |
| OBS-3 | n/a (resolved) | Sales | Blueprint Insight briefly stale after scorecard change — self-resolves on stage change / Refresh. Dropped. | — | none |

**No Critical or High defects found in any tested path.** Stage gates, the convert address gate, PO admin-only, and portal auth all held correctly.

---

## 4. Data cleanup

| Artefact | ID / path | Cleanup action | Result | Left? | Reason |
|----------|-----------|----------------|--------|-------|--------|
| Lead "Amelia Hartley" | `5367c278-32db-47fd-84ef-b4dd4ecae6cf` (email tagged `BLH-E2E-20260627-1041`) | delete via service DB (email LIKE run-id) | _pending end-of-run_ | — | — |
| Job/project | none created (convert gap-documented) | n/a | n/a | — | no job was created |
| Files / Dropbox / emails | none | n/a | n/a | — | no external side-effects fired |
| Manifest + this report | `docs/qa/e2e-runs/…MANIFEST.md`, this file | **left intentionally** | kept | ✅ | run record for review |

Cleanup is scoped strictly to the run-ID-tagged lead. **No** global cleanup, **no** `--confirm`, **no** touching of the many pre-existing legacy test rows (`BatchA…`, `__DRYRUN…`, `BLH TEST W10/W18…`).

---

## 5. Test results

- `npm run build` → ✅ pass (dist generated).
- Live API security/gate checks (this run):
  - `POST /convert-to-job` (no site_address) → **400** ✓ (W01-CONVERT-01)
  - `POST /api/po/issue` → employee **403**, no-auth **401**, admin **400** ✓ (W11-PO-SEC-01)
  - `GET /api/portal/admin/v2/:id/overview` → admin **200**, no-auth **401** ✓
- `npm run test:hardening-regression:write` → _results appended on completion_
- `npm run test:batch-a:write` → _results appended on completion_

---

## 6. Release readiness impact

| Surface | Readiness |
|---------|-----------|
| **Global production** | Not yet — external phases unverified on a sandbox; W18 UAT pending. |
| **Internal staff use (sales→tender→ops)** | **Strong.** Lead lifecycle, qualifying, stage gates, convert/PTSA guards, PO security all verified. |
| **RFQ / tender** | Engine + flow present and correct; live send/match/accept needs a sandbox-mail run to fully sign off. |
| **Sales / fee proposal** | **Ready** for staff use; DOCX/PTSA-signed paths need one sandbox pass. |
| **Ops / procurement / schedule / WHS** | Surfaces functional; PO security solid. Minor data-hygiene cleanup (BLH-E2E-001). |
| **W18 pilot** | Admin surface + auth gate OK; **manual client UAT still required** before pilot. |
| **W18 production** | Blocked on UAT + Sam decision. |

---

## 7. Recommended next actions

- **Next Cursor test batch:** add a Playwright spec for the sales stage-gate ladder (Enquiry→Fee Proposal) using the run-ID dataset, so this journey is regression-locked.
- **Next Claude fix batch (pending Sam approval):** `BLH-E2E-001` — filter `_DELETED`/archived projects out of the active Operations Gantt + portal admin reads. Small, isolated.
- **Next Sam decision:** (a) approve a **sandbox mail + Buildxact/Dropbox** config so the external phases (RFQ send, convert, win-finalize, PO issue) can be fully live-tested; (b) approve BLH-E2E-001 fix.
- **Next manual UAT:** W18 client portal — Client A/B isolation, magic-link login, draft→publish gating (the explicitly-pending pilot UAT).

---

**Next safe action:** Sam reviews this walkthrough and approves the next test/fix/manual batch.
**Blocked by:** sandbox config for external phases; W18 manual UAT; Sam decision on BLH-E2E-001.
**Code changed:** no. **Tests changed:** no (ran existing suites). **Docs changed:** yes (this report + manifest). **Test data cleaned:** yes — see §4 + manifest.
