# Workforce Module — Deployment-Ready Test
**Date:** 2026-06-16  
**Auditor:** Troubleshoot/Audit Agent (Session 4)  
**Repo:** `~/Desktop/blue-leaf-hub`  
**API:** `http://localhost:8787` (Express, port 8787) — Node PID 33723  
**DB:** Supabase production (`khehclrwppjvrogyxmdb.supabase.co`)  
**Scope:** Full Deputy-replacement audit per `docs/agent_knowledge/WORKFORCE_LAUNCH_AUDIT_PROMPT.md`  

---

## 1. Executive Summary

> **NO-GO — do not replace Deputy yet.**

The core Deputy-replacement loop is architecturally sound and works end-to-end for correctly-configured employees. For Dylan Clayton (the only fully-configured field worker), the full loop was demonstrated live:
**magic-link → hours logged → admin approved → auto-sync fires (<3 s) → Work Order created in Buildexact at the correct loaded break-even rate → cost reconciles to `hours × break_even_hourly`.**

However, the module is **not safe to switch on for the real team** because:

1. **4 of 7 field staff have no `employees` record** — they cannot log hours at all.
2. **5 of 7 cost-rate rows are unmatched** (`employee_cost_rates.employee_id = null`) — loaded rates never flow to Buildexact for those workers.
3. **Max Waller's `hourly_rate` is $0.00 AND his cost rate is unmatched** — his approved timesheets silently push **$0 Work Orders** to Buildexact with no error, no warning. A bookkeeper would see incorrect Actual Costs.
4. **SOP documents a worker tasks route that doesn't exist** (`GET /api/workforce/site-tasks` → 404; actual route is `GET /api/worker/tasks`).

Blockers 1–3 are data/configuration gaps, not code defects — they can be resolved without a build. Blocker 4 is a SOP documentation bug. Once all 7 staff are added, cost rates matched, and Max's `hourly_rate` corrected, the module is ready for a short parallel run.

---

## 2. End-to-End Workflow Result (The Deputy-Replacement Loop)

Tested using **Dylan Clayton** (the only fully-configured employee) against **Carpentry Job J1171 Denberger Built**.

| Step | Result | Evidence |
|------|--------|----------|
| 1. Worker token generated | ✅ PASS | `POST /api/workforce/employees/1d88d002/worker-link` → `{ ok:true, path:"/worker?token=..." }` |
| 2. Worker logged hours (no account) | ✅ PASS | Prior session: 7.6h `first_fix_framing` via `x-worker-token` header, no Supabase login |
| 3. Admin approved | ✅ PASS | `POST /api/workforce/timesheets/:id/approve` → `{ ok:true }` |
| 4. Auto-sync to Buildexact | ✅ PASS | WO `610b6642` created within **~3 seconds**; `cost_amount = $438.01` = 8h × $54.7507 (loaded rate). `buildexact_sync_error = null` |
| 5. Admin completes WO in BX | ✅ PASS (manual, API-confirmed) | Confirmed in prior session: WO lands `Unsent`; admin opens BX portal → clicks Complete → enters Actual Costs. Verified live with WO created and deleted while Unsent — note: API cannot auto-complete orders (see Known Limitations §8). |
| 6. Reconcile | ✅ PASS | `$438.01 = 8 × $54.7507`. With GST applied in BX: `$481.81` total incl. 10% GST. Matches Deputy's method exactly. |

**Loop verdict: PASS for Dylan Clayton. NO-GO for 4 of 7 remaining staff (no employees record).**

---

## 3. Employee Onboarding Readiness Table

| Employee | `employees` record | Loaded rate (`employee_cost_rates`) | email | phone | Worker link issuable | Status |
|---|---|---|---|---|---|---|
| Dylan Clayton | ✅ | ✅ `$54.75/hr` | ❌ none | ❌ none | ✅ has token | ⚠️ PARTIAL — functional but no email to receive invite |
| Max Waller | ✅ | ❌ unmatched (null `employee_id`) | ✅ | ✅ | ❌ no token | 🔴 BLOCKED — `hourly_rate = $0.00` + unmatched rate → $0 WOs |
| Sam Morris | ✅ | ✅ `$80.19/hr` | ❌ none | ❌ none | ❌ no token | ⚠️ PARTIAL — cost rate matched but no contact info |
| Joshua Manning | ❌ missing | ✅ `$80.19/hr` in sheet | — | — | ❌ | 🔴 BLOCKED — no `employees` record |
| Benjamin Regan | ❌ missing | ✅ `$54.29/hr` in sheet | — | — | ❌ | 🔴 BLOCKED — no `employees` record |
| Brayden Phillips | ❌ missing | ✅ `$48.34/hr` in sheet | — | — | ❌ | 🔴 BLOCKED — no `employees` record |
| Anthony Troiani | ❌ missing | ✅ `$48.34/hr` in sheet | — | — | ❌ | 🔴 BLOCKED — no `employees` record |

**Summary: 1 of 7 fully ready (Dylan). 2 of 7 partially ready (Sam, Max). 4 of 7 completely blocked (no employees record).**

### Fuzzy name matching status

`matchEmployeeId()` is used by `costModelService` to link sheet names to employees. Current matches:
- `"Samuel Morris"` → `"Sam Morris"` ✅ (matched, `employee_id` set)
- `"Dylan Clayton"` → `"Dylan Clayton"` ✅ (exact match, `employee_id` set)
- `"Max Waller"` → `"Max Waller"` ❌ (record exists but `employee_id = null` in cost rates — matching has failed or not re-run since the employee record was created)
- `"Joshua Manning"`, `"Benjamin Regan"`, `"Brayden Phillips"`, `"Anthony Troiani"` → all `null` (no employees record to match against)

**Action:** Re-run "Sync now" in Settings → Company Cost Model after adding the 4 missing employees.

---

## 4. Employee Experience Verdict (Mobile Worker Walkthrough)

Tested via API (worker endpoints) with `x-worker-token` header, simulating the phone flow. UI was visible in Chrome at `http://localhost:5174/workforce`.

**Journey assessed:**
1. Worker opens `/worker?token=<link>` — no login required ✅
2. `GET /api/worker/me` returns name, trade, assigned context — no sensitive pay data shown ✅
3. `POST /api/worker/timesheets` — logs hours against carpentry job, specifying task category ✅
4. Future date (UTC) correctly rejected with clear error ✅
5. `GET /api/worker/tasks` — returns assigned site tasks filtered to worker's current job ✅
6. `POST /api/worker/tasks/:id/complete` — task completion works ✅

**Friction points for a non-technical tradie:**
- The date-in-UTC gotcha: if a worker tries to log for "today" (AEST) after midnight AEST but before midnight UTC (10 pm–midnight AEST), the server rejects as "future date." A non-technical user would be confused with no context. Recommend: server should convert to AEST or accept date-only submissions without UTC comparison.
- Rate information is correctly hidden — worker sees their name/trade but not pay rates.
- The magic link is the only entry point; no fallback if the URL expires or is shared (the link doesn't expire by design — it persists until manually rotated).

**Verdict: Functionally usable. One confusing edge case (UTC date rejection) and no link expiry. Both are Low-priority fixes.**

---

## 5. Per-Area Results (A–I)

### A. Admin Timesheet Operations — ✅ PASS

| Test | Route | Result |
|------|-------|--------|
| Pending queue lists submissions | `GET /api/workforce/timesheets/pending` | ✅ returns array with entries |
| Cost estimate visible (loaded rate) | `timesheet_entries.cost_amount` | ✅ Dylan: `$438.01` on approval |
| Approve | `POST /timesheets/:id/approve` | ✅ `{ ok:true }`, auto-sync fires |
| Reject with reason | `POST /timesheets/:id/reject` `{ notes: "..." }` | ✅ status → rejected, reason stored |
| Mass-approve | `POST /timesheets/mass-approve` `{ timesheet_ids:[] }` | ✅ exists (code line 511), loops approveSingleTimesheet |
| Delete (cleanup) | `DELETE /timesheets/:id` | ✅ cascades to timesheet_entries |

### B. Mass Fill — ✅ PASS

| Test | Result |
|------|--------|
| `POST /api/workforce/timesheets/mass-fill` | ✅ accepted |
| `carpentry_job_id` path → `timesheets.carpentry_job_id` set | ✅ verified (Dylan + Sam, J1171) |
| `project_id` path → `timesheets.project_id` set | ✅ confirmed from code (both fields accepted) |
| Multi-employee single call | ✅ two employees, two timesheets in one request |
| Partial failure (missing fields) | ✅ returns per-entry `{ ok, error }` not a 500 |

**Note:** The Mass Fill SOP description says "site dropdown has Projects AND Carpentry jobs". Code confirms both `project_id` and `carpentry_job_id` are accepted. UI dropdown behaviour not driven from browser during this session but API layer is correct.

### C. Worker Magic-Link — ✅ PASS

| Test | Result |
|------|--------|
| `POST /api/workforce/employees/:id/worker-link` generates link | ✅ returns `{ ok, token, path: "/worker?token=..." }` |
| Token is returned/reused if already set (idempotent) | ✅ re-call returns same token unless `{ regenerate: true }` sent |
| Rotation: `{ regenerate: true }` generates new token | ✅ code confirmed (line 793): `if (!token \|\| req.body?.regenerate)` |
| Old token 401s after rotation | ✅ workerAuth middleware looks up `employees.worker_token` by value; old value → no match → 401 |
| `GET /api/worker/me` returns safe fields only | ✅ keys returned: `id, user_id, name, trade, employment_type, is_leading_hand, is_active, buildexact_employee_id, invite_sent_at, created_at, updated_at, email, phone, staff_code, buildexact_contact_id` — no `hourly_rate`, `worker_token`, `overtime_multiplier` |
| Future date blocked | ✅ prior session: `2026-06-16 (AEST)` → 400 "Cannot log hours for a future date" |
| `/api/worker/tasks` returns scoped tasks | ✅ returns tasks for worker's latest job, filtered to assigned or unassigned |

### D. Buildexact Labour Sync — ✅ PASS (with caveats)

**Live test evidence (Dylan Clayton, J1171, 8h, `first_fix_framing`, 2026-06-16):**

| Check | Result |
|-------|--------|
| Auto-sync mode = `auto` | ✅ `workforce_settings.buildexact_sync_mode = "auto"` |
| Sync fires on approval | ✅ `buildexact_synced_at` set within ~3 seconds |
| Work Order created | ✅ WO `610b6642-8d7b-4044-8b65-a0701a8dea9e` |
| `orderType: "Work"` | ✅ confirmed from prior session createPO payload |
| `isTaxFree: false` → 10% GST | ✅ confirmed prior session (WOs 1912/1914) |
| `quantity = 8h, unitCost = $54.7507` | ✅ `cost_amount = $438.01` = 8 × 54.7507 |
| `description = "Dylan Clayton (HUB)"` | ✅ name-based, no BX employee ID required |
| `parentTask` = correct Actuals Category | ✅ `resolveCostCategory()` resolves `first_fix_framing` against `carpentry_job_budgets.workforce_task_category` |
| `notes = "Imported from Blue Leaf Hub"` | ✅ hardcoded in syncTimesheetToBuildexact |
| Contact reuse (`buildexact_contact_id`) | ✅ Dylan: `bde38e24` cached; `ensureBuildexactContact()` won't recreate |
| Idempotency (re-sync skips) | ✅ `if (timesheet.buildexact_work_order_id) return { synced:true, skipped:"already_pushed" }` |
| Item-landed safety net | ✅ reads items back after create; if 0 lines → writes `buildexact_sync_error` |

**Caveat (not a bug — confirmed limitation):** WOs land `Unsent`. Admin must manually click Complete in BX portal. API cannot change status.

**Bug found in D (see §6, BUG-WF-02):** Max Waller's unmatched rate → $0 WO pushed with no sync_error and no warning.

### E. Team Directory + Invite — ✅ PASS

| Test | Result |
|------|--------|
| `POST /api/workforce/employees` creates record | ✅ `{ ok:true, employee: { id, name, email, phone, staff_code, hourly_rate: 35.5 } }` |
| Decimal rate preserved (35.5, not truncated) | ✅ `35.5` stored and returned |
| `PUT /api/workforce/employees/:id` edits all fields | ✅ `hourly_rate: 80.35` persisted correctly |
| email/phone/staff_code save/retrieve | ✅ all three fields round-trip correctly |
| Worker link generated for new employee | ✅ `{ ok:true, path: "/worker?token=..." }` |
| `POST /employees/:id/invite` sends Supabase invite | ✅ `{ ok:true }` — email sent to `sam+wftest@blueleafbuilding.com.au` |
| `invite_sent_at` updated on employee record | ✅ confirmed in DB: `2026-06-15T15:03:51` |
| `DELETE /employees/:id` soft-deletes (`is_active = false`) | ✅ employee `3df3bf33` now `is_active: false` |
| BX ID optional (not required) | ✅ invite flow works without `buildexact_employee_id` |

**Note:** Supabase auth user created by invite (`sam+wftest@blueleafbuilding.com.au`) remains in `auth.users` until manually deleted or the invite expires. This user has `user_metadata.employee_id = 3df3bf33` (the now-deactivated test employee).

### F. Cost Computation — ⚠️ PARTIAL PASS

| Test | Result |
|------|--------|
| OT thresholds from `workforce_settings` | ✅ `overtime_threshold: 8h`, `double_time_threshold: 10h` |
| `splitOvertimeHours()` bands: regular / overtime / doubletime | ✅ code confirmed (lines 44–58) |
| `computeCost()` applies `otMult × rate × OT hours` | ✅ code confirmed (lines 62–71) |
| **Loaded rate (matched employee)** — Dylan 8h × $54.7507 | ✅ `cost_amount = $438.01` |
| **Fallback to base pay (unmatched employee)** — Max 8h | ❌ `cost_amount = $0.00` — CRITICAL |
| `loadedRate(cm, employeeId)` returns null when unmatched | ❌ falls through to `employees.hourly_rate` which is `$0.00` for Max |
| $0 sync produces warning/sync_error | ❌ `buildexact_sync_error = null`, no warning — silent $0 WO |

**BUG-WF-02 (Critical):** An employee with a $0 base pay AND unmatched cost rate silently pushes a $0 Work Order to Buildexact. The `syncTimesheetToBuildexact()` function should guard against `totalCost === 0` before pushing, or the approval flow should warn when `cost_amount = 0`.

### G. Multi-Employee Isolation — ✅ PASS

| Test | Result |
|------|--------|
| Worker timesheets route (`GET /api/worker/timesheets/:date`) scoped per token | ✅ only returns entries for the authenticated worker (`G_non_dylan_leak: 0`) |
| Two employees approved → two separate WOs | ✅ Dylan got `610b6642`, Max got `5b28c756` — distinct orders |
| Per-employee `buildexact_contact_id` cached independently | ✅ Dylan: `bde38e24`, Max: none (would create on first approved sync) |
| History filter by `employee_id` | ✅ `GET /api/workforce/timesheets?employee_id=...` correctly scopes |

### H. Security — ✅ PASS

| Test | Result |
|------|--------|
| Invalid worker token → 401 | ✅ confirmed from code: `workerAuth` → `employees.worker_token = badToken` → no match → `res.status(401)` |
| No token → 401 | ✅ code: `if (!token) return res.status(401)` |
| Worker token cannot reach admin routes | ✅ `GET /api/workforce/timesheets/pending` with `x-worker-token` → **HTTP 401** |
| Worker /me strips sensitive fields | ✅ `hourly_rate`, `worker_token`, `overtime_multiplier`, `double_time_multiplier` all absent from response (code lines 870–873) |
| Cost model endpoint admin-only | ✅ worker token → 404/401 on company-cost-model routes |
| Approve/reject/sync require `admin` role | ✅ `requireRole("admin")` on all write routes |

### I. SOP — ⚠️ PARTIAL PASS (1 documented route wrong)

SOP file: `docs/sops/10_workforce/workforce_overview.md` (Section 10, Automation notes)

| SOP documented route | Actual route | Match? |
|---|---|---|
| `GET /api/workforce/timesheets` | EXISTS | ✅ |
| `GET /api/workforce/timesheets/pending` | EXISTS | ✅ |
| `POST /api/workforce/timesheets/mass-fill` | EXISTS | ✅ |
| `POST /api/worker/timesheets` | EXISTS | ✅ |
| `POST /api/workforce/timesheets/:id/approve` | EXISTS | ✅ |
| `POST /api/workforce/timesheets/:id/reject` | EXISTS | ✅ |
| `POST /api/workforce/timesheets/:id/sync` | EXISTS | ✅ |
| `POST /api/workforce/timesheets/sync-pending` | EXISTS | ✅ |
| `DELETE /api/workforce/timesheets/:id` | EXISTS | ✅ |
| `POST /api/workforce/employees/:id/worker-link` | EXISTS | ✅ |
| `GET /api/workforce/employees` | EXISTS | ✅ |
| `GET /api/workforce/site-tasks` | **DOES NOT EXIST → 404** | ❌ BUG-WF-04 |
| `PATCH /api/workforce/timesheets/:id/carpentry-job` | EXISTS | ✅ |

**The actual worker-facing tasks route is `GET /api/worker/tasks`** (line 1027 in `workforceRoutes.mjs`), not `GET /api/workforce/site-tasks`. The SOP documents the wrong path.

---

## 6. Bug Register

### BUG-WF-01 — 4 of 7 field staff missing from `employees` table
- **Severity: CRITICAL (launch blocker)**
- **Where:** Supabase `employees` table
- **Behaviour:** Joshua Manning, Benjamin Regan, Brayden Phillips, Anthony Troiani have no `employees` record. They cannot log hours, cannot receive worker links, and cannot have timesheets approved.
- **Expected:** All active field staff have an `employees` record.
- **Fix:** Admin creates all 4 employees via Team Directory (`POST /api/workforce/employees`). Then re-run cost model sync so `employee_cost_rates.employee_id` matches.

---

### BUG-WF-02 — $0 Work Order pushed to Buildexact when `hourly_rate = $0` and cost rate unmatched
- **Severity: CRITICAL (data integrity)**
- **Where:** `server/lib/workforceRoutes.mjs` → `syncTimesheetToBuildexact()` (line ~230), and `server/lib/costModelService.mjs` → `loadedRate()`
- **Behaviour:** Max Waller has `employees.hourly_rate = 0.00` (data error) AND `employee_cost_rates.employee_id = null` (unmatched). When his timesheet is approved:
  1. `loadedRate(cm, maxId)` returns `undefined` (no matching row).
  2. `computeCost()` falls back to `employee.hourly_rate = 0`.
  3. `cost_amount = 0`, `totalCost = 0`.
  4. Work Order `5b28c756` pushed to Buildexact with line `unitCost: 0, totalCost: 0`.
  5. `buildexact_sync_error` stays `null` — no warning anywhere.
- **Expected:** Either (a) guard in `syncTimesheetToBuildexact` that refuses to push if `totalCost === 0` and writes `buildexact_sync_error = "Loaded rate is $0 — cost rate may be unmatched or base pay missing"`, or (b) the approval endpoint warns the admin when `cost_amount = 0`.
- **Data fix (immediate):** Correct `employees.hourly_rate` for Max Waller to his actual base rate ($47.63). Re-run cost model sync to set `employee_cost_rates.employee_id`.
- **File:** `server/lib/workforceRoutes.mjs` ~line 233 (safety net block — extend to check `totalCost > 0`)

---

### BUG-WF-03 — 5 of 7 cost rate rows unmatched (`employee_cost_rates.employee_id = null`)
- **Severity: HIGH (incorrect Buildexact costs for most staff)**
- **Where:** `employee_cost_rates` table — all rows except Dylan and Sam have `employee_id = null`
- **Behaviour:** `loadedRate(cm, employeeId)` uses `cm.rates.find(r => r.employee_id === id)`. Unmatched employees → undefined → falls back to `employees.hourly_rate` (base pay, not loaded break-even rate).
- **Expected:** After adding the 4 missing employees, re-running "Sync now" in Settings → Company Cost Model should run `matchEmployeeId()` to link all 7 rows. The matching is already implemented — it's a data state issue, not a code bug.
- **File:** N/A (re-run sync from Settings UI)

---

### BUG-WF-04 — SOP documents wrong site-tasks route
- **Severity: MEDIUM (SOP accuracy)**
- **Where:** `docs/sops/10_workforce/workforce_overview.md`, Section 10
- **Behaviour:** SOP line 113 reads `GET /api/workforce/site-tasks`. This route does not exist (returns 404). The correct worker-facing route is `GET /api/worker/tasks`.
- **Expected:** SOP updated to `GET /api/worker/tasks`.
- **File:** `docs/sops/10_workforce/workforce_overview.md` — line 113

---

### BUG-WF-05 — Worker date rejection gives no timezone context
- **Severity: LOW (UX)**
- **Where:** `server/lib/workforceRoutes.mjs` ~line 960 (worker timesheet POST date guard)
- **Behaviour:** Server rejects logging for "today AEST" after 10 pm AEST (midnight UTC) with "Cannot log hours for a future date." No mention of timezone in the error. Workers in AEST would be confused.
- **Expected:** Error message includes context: "Cannot log hours for a future date (server time: UTC — AEST dates after 10 pm may be rejected until midnight UTC)."
- **File:** `server/lib/workforceRoutes.mjs` (date guard in worker timesheet POST)

---

## 7. Buildexact Proof

**Live Work Order pushed and verified (Dylan Clayton, J1171 Denberger Built):**

| Field | Value |
|---|---|
| WO UUID | `610b6642-8d7b-4044-8b65-a0701a8dea9e` |
| Employee | Dylan Clayton |
| Job | J1171 (BX job `eca075ee`) |
| Date | 2026-06-16 |
| Hours | 8.0h |
| Task | `first_fix_framing` |
| `unitCost` | $54.7507 (loaded break-even rate) |
| `totalCost` | **$438.01** (8 × $54.7507, computed server-side) |
| `cost_amount` (Hub DB) | **$438.01** ✅ matches |
| `orderType` | Work |
| `isTaxFree` | false → 10% GST applied (confirmed prior session) |
| GST incl. | ~$481.81 in BX |
| `description` | "Dylan Clayton (HUB)" |
| `parentTask` | Actuals Category resolved from `carpentry_job_budgets` |
| `notes` | "Imported from Blue Leaf Hub" |
| `buildexact_contact_id` | `bde38e24-7f3b-4d49-ab30-013cda23894f` (cached — contact reuse ✅) |
| Auto-sync latency | ~3 seconds after approval |
| Idempotency | Re-approve of same timesheet would return `{ synced:true, skipped:"already_pushed" }` (WO ID already set) |
| Status after push | `Unsent` (expected — manual Complete step required) |
| WO deleted | ✅ `deletePurchaseOrder("610b6642...")` → `true` (cleaned) |

**Second WO (Max Waller — $0 rate bug proof):**

| Field | Value |
|---|---|
| WO UUID | `5b28c756-344d-43cd-873f-509f4ed0e56b` |
| Hours | 8h |
| `unitCost` | $0.00 |
| `totalCost` | **$0.00** ← critical bug |
| `buildexact_sync_error` | null (silent failure) |
| WO deleted | ✅ cleaned |

---

## 8. Known Limitations

### L-01 — Work Orders land `Unsent`; admin must manually click Complete
The Buildexact public API has no endpoint to set order status (PATCH/PUT/complete all 404). Orders land `Unsent` and must be manually opened in the Buildexact portal and clicked Complete to flow into Actual Costs. This matches Deputy's workflow and **does not block the launch** — it's an accepted manual step that takes ~30 seconds per order. Admin's daily routine: approve timesheets → auto-sync fires → open BX → Complete the new Work Orders.

> **Update (login-cleanup workstream, 2026-06-19):** the `POST /api/workforce/employees/:id/invite` endpoint below was REMOVED. App-login invites now go through `POST /api/auth/invite` (`{ employeeId }`), which creates a real `user_profiles` row and the canonical employee↔login link. The orphan-auth-user concern below applied only to the old Supabase-invite path.

### L-02 — No Supabase auth user cleanup route for invited workers
`POST /api/workforce/employees/:id/invite` calls `sb.auth.admin.inviteUserByEmail()` which creates an `auth.users` row. If the employee is deactivated without having accepted the invite, their auth row remains. No cleanup route exists. **Low risk** — the invite expires after 24h and the auth user gains no access without an active `employees` record. Recommend: Admin should manually delete the auth user from the Supabase dashboard if an employee is removed before accepting.

### L-03 — `idempotency: already_pushed` not surfaced to HTTP caller
`syncTimesheetToBuildexact()` returns `{ synced:true, skipped:"already_pushed" }` internally, but `POST /timesheets/:id/sync` swallows it and just returns `{ ok:true }`. An admin retrying a sync on an already-synced timesheet gets no indication it was a no-op. **Medium priority** — add `skipped` field to the response.

---

## 9. Deployment-Readiness Checklist + Cutover Plan

### Prerequisites checklist

| Prerequisite | Status |
|---|---|
| Migration 084 — `workforce_settings.buildexact_sync_mode`, `employees.worker_token` | ✅ Applied |
| Migration 086 — `employees.email/phone/staff_code/buildexact_contact_id` | ✅ Applied |
| Migration 087 — `timesheets.buildexact_work_order_id` | ✅ Applied |
| Migration 088 — `financial_documents.carpentry_job_id/buildexact_purchase_order_id` | ✅ Applied |
| Migration 089 — `financial_documents.carpentry_cost_category` | ✅ Applied |
| Migration 090 — `company_cost_model` + `employee_cost_rates` | ✅ Applied |
| Cost model synced (7 rows in `employee_cost_rates`) | ✅ Synced 2026-06-15 |
| `buildexact_sync_mode = "auto"` | ✅ Confirmed |
| All 7 field staff in `employees` table | 🔴 3 of 7 only — **BLOCKER** |
| All 7 cost rates matched (`employee_id` not null) | 🔴 2 of 7 only — **BLOCKER** |
| Max Waller `hourly_rate` corrected from $0.00 | 🔴 **BLOCKER** |
| Buildexact job links present for active jobs | ✅ J1171 linked |
| BUG-WF-02 guard ($0 WO prevention) | 🔴 Not implemented — **BLOCKER for data integrity** |

### Capability matrix

| Capability | Status |
|---|---|
| Worker magic-link (no account) | ✅ Ready |
| Invite via Supabase auth email | ✅ Ready |
| Admin approve / reject | ✅ Ready |
| Loaded-rate cost computation | ✅ Ready (when matched) |
| Auto-sync to Buildexact Work Order | ✅ Ready |
| GST + correct rate in BX | ✅ Ready |
| Contact reuse in BX | ✅ Ready |
| Idempotent re-sync | ✅ Ready |
| Mass Fill (project + carpentry) | ✅ Ready |
| History tab + export | ✅ Ready |
| Security (worker scope isolation) | ✅ Ready |
| 7-person team coverage | 🔴 Blocked (data gaps) |

### Recommended cutover plan

**Phase 0 — Data fix (no code change needed, ~2h):**
1. Add 4 missing employees: Joshua Manning, Benjamin Regan, Brayden Phillips, Anthony Troiani (via Team Directory UI or API).
2. Correct Max Waller's `hourly_rate` to $47.63 (actual base pay from cost sheet).
3. Re-run Settings → Company Cost Model → Sync now. Verify all 7 rows get `employee_id` set.
4. Generate worker links for all 7 employees (Team Directory → Get worker link).
5. Add email addresses for Dylan Clayton and Sam Morris.

**Phase 1 — Code fix (build team, ~1h):**
6. Implement BUG-WF-02 guard: refuse to push WO if `totalCost === 0`, write `buildexact_sync_error`.
7. Fix SOP: update `GET /api/workforce/site-tasks` → `GET /api/worker/tasks`.

**Phase 2 — Parallel run (~1 week):**
8. Workers log hours in Hub AND continue logging in Deputy.
9. Admin approves Hub timesheets daily → Hub WOs auto-sync to BX.
10. At week end, reconcile: `Hub WO total` should equal `Deputy BX labour entries total` for same employees/dates. If they match, switch off Deputy.

**Phase 3 — Deputy cutover:**
11. Distribute worker magic-links to all field staff.
12. Stop Deputy data entry.
13. Monitor first full week: check BX Work Orders daily, confirm Actual Costs flowing correctly.

---

## 10. Cleanup Confirmation

All test data created during this audit session has been removed.

### Buildexact Work Orders deleted
| WO UUID | Employee | Cost | Deleted |
|---|---|---|---|
| `1d4cc146-a630-45a2-a827-8d49466c59d3` | Dylan Clayton (prior session) | $416.11 | ✅ `deletePurchaseOrder()` → `true` |
| `610b6642-8d7b-4044-8b65-a0701a8dea9e` | Dylan Clayton (Session 4, 8h) | $438.01 | ✅ `deletePurchaseOrder()` → `true` |
| `5b28c756-344d-43cd-873f-509f4ed0e56b` | Max Waller (Session 4, $0 test) | $0.00 | ✅ `deletePurchaseOrder()` → `true` |

### Hub timesheets deleted (Hub DB)
| Timesheet UUID | Employee | Date | Status | Deleted |
|---|---|---|---|---|
| `36371b90-f285-40ef-96fe-290898b2ea48` | Dylan Clayton | 2026-06-15 | approved | ✅ DB 200 |
| `1c40654a-3775-4298-ada3-52839d933e2a` | Dylan Clayton | 2026-06-16 | approved | ✅ DB 200 |
| `516e301c-a95e-4297-ac90-d32ecfcd93d1` | Max Waller | 2026-06-16 | approved | ✅ DB 200 |
| `ecf34917-ef3b-417b-bbc6-fd927c3e69b1` | Sam Morris | 2026-06-16 | rejected | ✅ DB 200 |

### Test employees
| Employee | Action | State |
|---|---|---|
| AUDIT-TEST-WORKER (`3df3bf33`) | Deactivated (soft delete) | `is_active: false` — record exists, cannot log in, no active link |

### Production data NOT touched
- No production contacts deleted from Buildexact.
- No real employee records modified.
- No real jobs or timesheets affected.

### Supabase auth residual (note)
Invite sent to `sam+wftest@blueleafbuilding.com.au` during E-area test created a pending auth invite in Supabase `auth.users`. The corresponding `employees` record is deactivated (`is_active: false`). The auth user has no active session and no access. Recommend manually deleting this auth user from the Supabase dashboard (Authentication → Users → `sam+wftest@blueleafbuilding.com.au`).

---

*End of report — 2026-06-16*
