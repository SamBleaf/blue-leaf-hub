# W18 Client Portal — UAT Execution Pack

**Purpose:** Staff execution guide for **W18-UAT-01** (manual).  
**Checklist (do not re-plan):** [W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md](./W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md)  
**Status:** **UAT executed — CONDITIONAL PASS (2026-06-27)** — see [W18_UAT_EXEC_RESULT_20260627.md](./W18_UAT_EXEC_RESULT_20260627.md).

---

## Pilot project selection

| Criterion | Guidance |
|-----------|----------|
| **Preferred** | Real low-risk pilot with **client consent** OR internal demo project with portal v2 enabled |
| **Avoid** | Production client data without consent; live money/variation workflows on first run |
| **Setup** | Project must have `portal v2` enabled via `/portal-admin/{projectId}/v2` |
| **Test address rule** | If creating fixtures: `buildTestJobAddress()` / **`BLH TEST`** prefix only |

Record in checklist §20: project name, ID, address.

---

## Roles and users needed

| Role | Account | Used for |
|------|---------|----------|
| **Admin** | `ai-test-director@blueleafbuilding.test` (or production admin) | PortalV2Admin invite, settings, void guards |
| **Client (pilot)** | Fresh invite email — not shared with other tests | Onboarding, home, actions, isolation |
| **Second client (isolation)** | Optional second invite on different project | Cross-client 403 checks (§17) |
| **Supervisor/employee** | Only if testing role mismatch rows in checklist | Optional — automated SEC-04 already green |

---

## Evidence to capture

| Type | When | Where to store |
|------|------|----------------|
| **Screenshot** | Each failed or conditional row | Link in defect template §19 |
| **Screen recording** | Invite → first login → home load | Optional; attach to sign-off §20 |
| **API/network** | 403/404 on legacy token rows (§17) | HAR or screenshot of response |

---

## Defect logging process

1. Use template in checklist **§19** (`UAT-W18-###`).
2. Register P0/P1 in [BUG_REGISTER.md](./BUG_REGISTER.md) with prefix `UAT-W18-` or `W18-UAT-`.
3. **Do not** assign fixes until Sam reviews UAT results and approves a fix batch.
4. P2 may be logged as doc/SOP gaps only.

---

## Go / no-go sign-off flow

```
Staff completes checklist sections A–T
    → Logs defects §19
    → Fills §20 (Pass / Conditional / Fail)
    → Sam sign-off: supervised client pilot approved?
         YES → W18 client pilot gate moves toward GO (prod still NO-GO until P1-W18-04)
         NO  → Fix batch approved from UAT defects only
```

**Production (unsupervised):** remains **NO-GO** until P1-W18-04 + documents SOP + win→portal enablement per [release review](./W18_CLIENT_PORTAL_RELEASE_READINESS_REVIEW.md).

---

## Pre-flight automated gate (green 2026-06-27 — run before manual)

```bash
npm run test:hardening-regression:write -- --only W18   # 5 pass / 0 fail / 1 gap (Playwright UI separate)
npm run test:batch-a:write                              # includes W03-API-05c DISC-002 — 37/0
npm run test:w18-portal-void-guard:write
npm run test:w18-portal-api01:write
npm run test:w18-portal-ui01                            # optional Playwright admin UI
npm run test:w18-portal-photo-visibility:write
```

**Last pre-flight (2026-06-27):** W18 regression **5/0/1 gap**; batch-a **37/0** (DISC-002 confirmed).

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | Sam approval — DISC-002 accepted closed; W18-UAT-EXEC-01 approved to proceed |
