# W18 Supervised Client Pilot — Execution Pack

**Batch ID:** `W18-SUPERVISED-CLIENT-PILOT-01`  
**Status:** **APPROVED WITH CONTROLS — WAITING FOR VIABLE REAL JOB (Sam 2026-06-27)**  
**Execution:** **Do not run yet** — no real client invite until signed contract is active in Hub and Sam gives final go-ahead.  
**Prerequisite evidence:** [W18_UAT_EXEC_RESULT_20260627.md](./W18_UAT_EXEC_RESULT_20260627.md) · [W18_STAFF_BROWSER_PILOT_RESULT_20260627.md](./W18_STAFF_BROWSER_PILOT_RESULT_20260627.md)

---

## Timing hold (2026-06-27)

W18-SUPERVISED-CLIENT-PILOT-01 is **approved with controls** but **delayed** until the first suitable signed building contract is active in the Hub.

| Gate | Required before execution |
|------|---------------------------|
| Contract | First building contract **signed** |
| Hub job | Job properly created / active in Hub |
| Relationship | Client relationship confirmed |
| Sam | **Final go-ahead** to use that job as the pilot |
| Consent | Client consent documented |

**Candidate pilot (subject to final approval):** first signed building contract — clients appear to be the right fit, but **do not invite** until all gates above are met.

**While waiting:** keep this pack ready. Do **not** substitute `__E2E_`, BLH TEST, or demo rows unless Sam explicitly changes the decision. Do **not** start W18 product fixes unless Sam approves a named fix batch.

---

## Sam decision summary

| Gate | Verdict |
|------|---------|
| **W18 supervised client pilot** | **APPROVED WITH CONTROLS** |
| **W18 production (unsupervised)** | **NO-GO** |

**Sam accepted:** W18-STAFF-BROWSER-PILOT-01 as **CONDITIONAL PASS** (9/10 browser, fresh BLH TEST demo — not `__E2E_` fixture).

---

## Mandatory pilot controls (non-negotiable)

1. **One low-risk real pilot project only** — won job with explicit Sam/client consent, or internal demo treated as real client session with consent documented.
2. **Fresh portal invite / JWT path** — `POST /api/auth/invite` → client accept → `/client-portal`. No reusing stale `__E2E_` or post-write-regression fixtures.
3. **No legacy token for contractual actions** — do not onboard pilot client via `/portal/{token}` for approvals, variations, or claims.
4. **One real photo with real storage bytes** — staff uploads via Portal v2 admin **before** client session; verify visible on Journey/home (closes UAT-W18-BROWSER-001 gap).
5. **Documents exposed manually and deliberately only** — share specific PDFs via v2 admin Documents; do not assume finance auto-sync.
6. **Pre-invite leak check** — confirm no internal costs, margins, supplier quotes, staff notes, or draft updates visible to client role.
7. **Staff supervises first client login/use** — staff present for invite accept, first home load, and first action interaction.
8. **Defect IDs:** `PILOT-W18-###` — log in §Defects below and [BUG_REGISTER.md](./BUG_REGISTER.md) if P0/P1.
9. **No W18 product fixes during pilot** unless Sam approves a named fix batch.

---

## Pre-flight (before selecting project)

| # | Check | Pass | Notes |
|---|-------|------|-------|
| P1 | `npm run dev` — API **200** on `:8787`, Vite **200** on `:5174` | ☐ | Restart Vite on `127.0.0.1` if IPv6-only bind |
| P2 | No W18 `--write` regression running | ☐ | Avoid fixture wipe mid-pilot |
| P3 | Migrations **108** + **110** applied | ☐ | |
| P4 | Admin login works | ☐ | |
| P5 | Screenshot folder ready | ☐ | `e2e/screenshots/PILOT-W18-{date}/` or staff drive |

Optional sanity (already green — run if stale):

```bash
npm run test:hardening-regression:write -- --only W18
```

---

## Project selection (record before invite)

| Field | Value |
|-------|-------|
| **Pilot type** | ☐ Real client (consent on file) · ☐ Internal demo as supervised pilot |
| **Job ID** | |
| **Project ID** | |
| **Address** | |
| **Client name** | |
| **Client email** | (fresh — not shared with E2E accounts) |
| **Consent / Sam approval** | ☐ Documented |
| **Portal v2 admin URL** | `/portal-admin/{projectId}/v2` |
| **Staff supervisor** | |
| **Date / time window** | |

**Do not use:** `__E2E_` projects, BLH TEST demo rows from browser pilot run, or any project immediately after W18 write regressions.

---

## Staff execution checklist

### A — Admin setup

| # | Step | Pass | Evidence |
|---|------|------|----------|
| A1 | Open `/portal-admin/{projectId}/v2` | ☐ | |
| A2 | Enable **Portal v2 enabled (client login)**; save settings | ☐ | |
| A3 | Confirm build phase, team, payment instructions correct | ☐ | |
| A4 | Upload **≥1 real photo** — mark **Show client** | ☐ | Screenshot |
| A5 | Confirm **≥1 draft** update/photo **not** client-visible | ☐ | |
| A6 | Share **≥1 document** deliberately (Documents → Share) | ☐ | |
| A7 | Pre-invite: open client preview or API home as test — **no leak scan** | ☐ | No margin/cost/internal notes |

### B — Invite & supervised client session

| # | Step | Pass | Evidence |
|---|------|------|----------|
| B1 | Invite client (name + email) → success | ☐ | |
| B2 | Client accepts invite / sets password (staff present) | ☐ | |
| B3 | Client → `/client-portal` → home loads, correct address | ☐ | Screenshot |
| B4 | Client sees **only** this project | ☐ | |
| B5 | Journey — real photo visible; draft/hidden content absent | ☐ | |
| B6 | Actions — variations/selections readable | ☐ | |
| B7 | Documents — shared doc listed | ☐ | |
| B8 | Selections — no supplier cost / internal notes | ☐ | |
| B9 | Mobile check (phone or narrow viewport) | ☐ | Screenshot |
| B10 | Client logout → re-login | ☐ | |

### C — Isolation & policy (spot check)

| # | Step | Pass | Notes |
|---|------|------|-------|
| C1 | Second client (if available) cannot see pilot project | ☐ | |
| C2 | Legacy token **not** used for client onboarding | ☐ | JWT path only |
| C3 | PORTAL-CROSSROLE policy recorded (see below) | ☐ | Sam decided 2026-06-27 |

---

## PORTAL-CROSSROLE — Sam policy (2026-06-27)

| Role | Portal admin v2 overview (read) | Client portal app |
|------|--------------------------------|-------------------|
| **Admin** | **Yes** | N/A |
| **Supervisor** | **Yes, if project-related** | N/A |
| **Employee** | **No by default** | N/A |
| **Client** | **No** (403) | **Own linked project(s) only** |
| **No auth** | **No** (401) | **No** |

**Note:** Current API may still return 200 for employee overview — **operating policy** is employee should not use portal-admin overview until a future approved fix batch. UI already blocks non-admin from v2 admin route.

---

## P1-W18-04 — Sam policy (pilot phase)

| Path | Pilot rule |
|------|------------|
| **JWT / invite** | **Primary** — all pilot onboarding and contractual actions |
| **Legacy token** | **Read-only or not used** for contractual actions; do not issue legacy link for pilot client approvals |

Production unsupervised still **NO-GO** until legacy POST surface fully gated (see [GO_LIVE_ROADMAP.md](./GO_LIVE_ROADMAP.md)).

---

## Defect logging — `PILOT-W18-###`

| ID | Severity | Screen | Role | Steps | Expected | Actual | Blocks pilot? | Owner | Status |
|----|----------|--------|------|-------|----------|--------|---------------|-------|--------|
| PILOT-W18-001 | | | | | | | | | Open |

Register P0/P1 in [BUG_REGISTER.md](./BUG_REGISTER.md). **Do not fix during pilot** without Sam-approved fix batch.

---

## Sign-off

| Field | Value |
|-------|-------|
| **Pilot project** | |
| **Client email** | |
| **Supervised by** | |
| **Date** | |
| **Result** | ☐ Pass · ☐ Conditional pass · ☐ Fail · ☐ Blocked |
| **Sam sign-off — pilot complete** | ☐ Approved · ☐ Not approved |

---

## Quick path

```
Select real pilot project + consent
  → npm run dev (health check)
  → Admin: portal v2 on + real photo + share doc + leak check
  → Invite client (JWT path)
  → Supervise first login: Home → Journey → Actions → Documents → Mobile
  → Log PILOT-W18-### if any issue
  → Sign-off § above
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | **Timing hold** — approved with controls; execution delayed until first signed contract active in Hub + Sam final go-ahead |
| 2026-06-27 | Sam approves supervised client pilot with controls — W18-SUPERVISED-CLIENT-PILOT-01 |
