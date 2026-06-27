# W18-STAFF-BROWSER-PILOT-01 — Staff Browser Pilot Result

**Run ID:** `BLH-W18-BROWSER-1782553176788`  
**Date:** 2026-06-27  
**Executor:** Cursor (staff browser proxy via Playwright + fresh fixture setup)  
**Branch:** `portal-v2`  
**Prior UAT:** [W18_UAT_EXEC_RESULT_20260627.md](./W18_UAT_EXEC_RESULT_20260627.md) — CONDITIONAL PASS (API)

---

## Final verdict: **CONDITIONAL PASS** (Sam accepted 2026-06-27)

Supervised client pilot **approved with controls** — see [W18_SUPERVISED_CLIENT_PILOT_EXECUTION_PACK.md](./W18_SUPERVISED_CLIENT_PILOT_EXECUTION_PACK.md).

---

## Environment preflight

| Check | Result |
|-------|--------|
| Branch | `portal-v2` |
| API health | **200** `http://127.0.0.1:8787/api/health` |
| Vite/browser | **200** `http://127.0.0.1:5174/` (restarted with `--host 127.0.0.1` — prior listener was IPv6-only) |
| Write regression running | **No** (confirmed before run) |
| Fixture rule | **Fresh BLH TEST project** — not post-regression `__E2E_` |

**Setup command:** `node scripts/uat/w18-staff-browser-pilot-setup.mjs`  
**Browser command:** `E2E_SKIP_WEBSERVER=1 E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/tests/uat/w18-staff-browser-pilot.spec.js --project=chromium-desktop`

---

## Project used

| Field | Value |
|-------|-------|
| Type | Internal demo (fresh BLH TEST browser pilot) |
| Project A ID | `b64abb2f-2ad7-4ce0-8305-1be607d73180` |
| Address | `BLH TEST W18 BROWSER-A 1782553176788 … Adelaide SA 5000` |
| Project B ID | `2136f83c-4bb2-471a-815a-9b7992f01e16` (isolation) |
| Client (invited) | `blh.uat.browser.1782553176788@blueleafbuilding.test` |
| Admin | `e2e-admin@blueleafbuilding.test` |

No external/real client invited.

---

## Roles tested

| Role | Browser | API (cross-role probe) |
|------|---------|------------------------|
| Admin | Portal v2 admin overview | overview **200** |
| Client (fresh invite) | Full portal shell | home **200** (via UI) |
| Client B | Isolation check | N/A |
| Supervisor | UI route blocked | overview **200** (PORTAL-CROSSROLE) |
| Employee | Not browser-tested | overview **200** (PORTAL-CROSSROLE) |

---

## Browser checklist results (10 Playwright steps)

| # | Check | Result |
|---|-------|--------|
| 1 | Admin portal v2 overview | **Pass** |
| 2 | Client login → home | **Pass** |
| 3 | Nav tabs (Home, Actions, Journey, Selections, Documents, Messages) | **Pass** |
| 4 | Actions + journey content | **Partial** — Frame/Roof + actions visible; **hidden photo caption absent**; **visible photo caption not rendered** (stub storage — see UAT-W18-BROWSER-001) |
| 5 | Selections — no internal/cost leak | **Pass** |
| 6 | Documents — shared contract listed | **Pass** |
| 7 | Client B isolation | **Pass** |
| 8 | Mobile viewport (390×844) | **Pass** |
| 9 | Client logout / re-login | **Pass** |
| 10 | Supervisor UI blocked from v2 admin | **Pass** |

**Screens completed:** 9/10 automated steps pass · **90%** browser automation · **~95%** combined with API preflight from W18-UAT-EXEC-01.

---

## Security / data results

| Area | Result |
|------|--------|
| **Data isolation** | **Pass** — Client B UI does not show pilot project A content |
| **Cost/margin leak** | **Pass** — no `SECRET_*`, `cost_to_builder`, `internal_notes` in client DOM |
| **Draft vs publish** | **Pass (API-seeded)** — draft update headline not shown in journey UI; published milestone content shown |
| **Documents** | **Pass** — shared `BLH TEST Building Contract` visible when `portal_documents.is_shared=true` |
| **Actions** | **Pass** — Splashback selection + variation approval visible |
| **Messages/notifications** | **Not exercised** — tab loads without error; no finance event triggered in browser pass |

---

## Defects

| ID | Severity | Summary | Blocks pilot? | Owner |
|----|----------|---------|---------------|-------|
| **UAT-W18-BROWSER-001** | **P2** | Journey UI does not show visible photo caption when `project_photos` use stub `public_url` / no Dropbox bytes — API P0-03 already green | **No** — verify with real upload on pilot | SOP / manual on pilot |
| *(none Critical/High)* | — | — | — | — |

**Open harness (unchanged):** UAT-W18-ENV-01 — do not use `__E2E_` after write regressions.

---

## PORTAL-CROSSROLE evidence (for Sam)

| Role | `/api/portal/admin/v2/:projectId/overview` | Portal v2 admin UI (`/portal-admin/:id/v2`) |
|------|--------------------------------------------|-----------------------------------------------|
| Admin | **200** | **Reachable** |
| Supervisor | **200** | **Redirected / blocked** |
| Employee | **200** (API probe only) | Not browser-tested (UI expected admin-only) |
| Client | **403** | N/A |

**Sam decision required:** W18-DRIFT-004 / PORTAL-CROSSROLE — API allows supervisor/employee read; UI is admin-only.

---

## Screenshots

`e2e/screenshots/BLH-W18-BROWSER-1782553176788/`

| File | Step |
|------|------|
| `01-admin-portal-v2.png` | Admin overview |
| `02-client-home.png` | Client home |
| `03-client-actions.png` | Client nav |
| `05-client-selections.png` | Selections leak scan |
| `06-client-documents.png` | Documents |
| `07-client-b-isolation.png` | Client B isolation |
| `08-client-mobile.png` | Mobile viewport |
| `09-client-relogin.png` | Re-login |
| `10-supervisor-blocked-ui.png` | Supervisor UI gate |

Pilot runtime: `e2e/.uat-browser-pilot.json`

---

## Recommendations

| Gate | Recommendation |
|------|----------------|
| **Supervised client pilot** | **APPROVED WITH CONTROLS** (Sam 2026-06-27) |
| **Production (unsupervised)** | **NO-GO** — unchanged (P1-W18-04, documents SOP, PORTAL-CROSSROLE, win→portal enablement) |

### Manual controls before external client session

1. Use a **real won job** with Sam consent — not the BLH TEST demo row.
2. Admin: enable portal v2 → invite → client accept (same flow verified here).
3. Upload at least one **client-visible** site photo via Portal v2 admin (real file).
4. Share at least one contract PDF (documents SOP).
5. Spot-check void guard on a **test** variation if finance sync used.

### Sam decisions required

- **PORTAL-CROSSROLE** — employee/supervisor API read scope vs admin-only UI
- **P1-W18-04** — legacy anonymous POST policy on non-v2 projects
- **Supervised pilot sign-off** §20 after real-project optional confirmation

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-27 | W18-STAFF-BROWSER-PILOT-01 — CONDITIONAL PASS (9/10 browser, 1 P2 photo stub) |
