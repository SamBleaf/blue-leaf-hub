# HUB-QA-ROLE-PREVIEW — Cross-Hub Role Preview / QA Console

**Status:** 🟢 **ALL PHASES SHIPPED (2026-06-27).** Sam approved the build 2026-06-27 ("push through all phases"). Phase 1 inventory · 2 Developer Tools shell · 3 worker preview · 4 client-portal preview · 5 live access matrix · 6 drift/authz tests — all done.
**Placement (as built):** Settings → **Developer Tools — Role Preview Console**, admin-only (self-gating section, like the Workforce Settings section).
**Build:** `src/lib/roleAccess.js` (9 personas + the access map; the staff matrix is driven by the **real `roles.js can.*`** so it can't drift) · `src/components/settings/RolePreviewConsole.jsx` (role picker → auth model, live module visibility, live action matrix, documented route gating, **read-only · not real auth** banner; **Phase 3** live "preview as worker" reusing the W17-P3 `task-preview`/`preview` read routes; **Phase 4** live "preview as client" reusing `/api/portal/admin/v2/:id/overview`) · wired in `src/pages/Settings.jsx`.
**Tests:** `test:qa-role-preview` (QA-RP-01..10) — **10/10** (static wiring + previews + the live matrix). `test:qa-role-preview-drift` (QA-RP-DRIFT-01..05) — **6/6** (**Phase 6**: cross-checks the matrix against real route authz — employee denied 403, supervisor allowed 200 on the workforce sample). Frontend-only — no new backend routes; the worker/client previews reuse existing admin-authed read endpoints and never use a real token.
**Original parking note (kept for history):** recorded 2026-06-26 from a Sam product-direction note during W17; the existing Workforce "Preview as worker" panel (W17-P3) is unchanged by this.

> Grounding note: the role/module/auth tables below were produced by a read-only inventory of the actual codebase on 2026-06-26 (not from the chat brief). Where the chat brief and the code disagree (e.g. "subcontractor/supplier" as preview roles), the code wins and the gap is called out.

---

## 1. Reason / problem being solved

Today, "see what another role sees" is solved ad-hoc — e.g. the Workforce **Preview as worker** panel. If we keep bolting a bespoke preview button onto every module, we get N inconsistent, half-safe previews and no single place to answer access questions or catch permission drift.

We want **one internal, admin-only, read-only console** that answers, for any role + person + project:
- What does this role **see**? (visible routes / modules / data)
- What actions are **visible**, **hidden**, or **blocked**?
- Can this role reach **another project/job** it shouldn't?
- Are the **client / worker / supervisor boundaries** correct?
- Where is gating **missing or inconsistent** (an audit aid)?

It is a **QA / developer tool**, not a user feature.

---

## 2. Hard rules (non-negotiable)

1. **Read-only unless explicitly approved.** The console renders what a role *would* see; it performs no writes, approvals, submissions, or syncs. Any future "act as" capability is a separate, individually-approved decision.
2. **The console must NEVER be the real auth path.** It must not mint, copy, or use a real worker magic-link token, portal client JWT/token, or anyone's session. It authenticates as the **admin/developer** (console auth) and re-applies the target role's *visibility rules in code* to show what that role would see. The W17-P3 `/api/workforce/employees/:id/task-preview` route is the **reference pattern** (admin-authed, reads data, replays worker visibility rules, no worker token).
3. **No privilege escalation surface.** Because it's admin-only + read-only + console-authed, it cannot be used to gain another role's powers. It must be gated `requireRole("admin")` on every backend read it adds.
4. **Honest about coverage.** Roles/modules with no real auth path today (subcontractor, supplier) are shown as "no auth path yet — data-only", never faked.

---

## 3. Target roles — grounded (real today vs data-only)

Sam's brief lists 9 roles. The code today has real auth paths for 7 (one partial); 2 are data-only.

| # | Sam's role | Real auth path today? | Identity / how identified | Notes for the console |
|---|------------|----------------------|---------------------------|-----------------------|
| 1 | **Admin / Sam** | ✅ Yes | `user_profiles.role='admin'` (Staff JWT) | Baseline; the console's own caller |
| 2 | **Supervisor** | ✅ Yes | `user_profiles.role='supervisor'` | Field/ops scoped; no finance/sales |
| 3 | **Employee / office** | ✅ Yes | `user_profiles.role='employee'` | Site/ops views; passive |
| 4 | **Leading hand** | ◑ Partial | `employees.is_leading_hand=true` (a **flag**, not an auth tier) | Authenticates as worker/staff; flag widens task/QC visibility. Console previews it as "worker + leading-hand flag", not a separate login |
| 5 | **Worker** | ✅ Yes | `employees.worker_token` (magic-link, `workerAuth`) | Site PWA; **console must replay rules, never use the token** |
| 6 | **Client** | ✅ Yes | `project_client_users` (Portal v2 JWT) + legacy anonymous `projects.portal_token` | Project-scoped; sub-roles below |
| 7 | **Client representative** | ✅ Yes (= portal sub-role) | `project_client_users.role IN ('architect','accountant')` | View-only advisor personas |
| 8 | **Subcontractor** | ❌ Data-only | `subcontractors` table; no login | **No preview until a real auth path exists** |
| 9 | **Supplier** | ❌ Data-only | `suppliers` table; no login | **No preview until a real auth path exists** |

**Portal client sub-roles (important nuance the brief missed):** `project_client_users.role` is a 4-value enum — `primary` & `secondary` hold **contractual write power** (approve variations/selections, sign docs, via `requirePortalWrite`), while `architect` & `accountant` are **view-only**. "Client" and "Client representative" both map here; the console should preview at the sub-role level.

---

## 4. Auth models in the Hub today (what the console must model)

| Auth model | Mechanism | Middleware (file:line) | Identity table |
|------------|-----------|------------------------|----------------|
| Staff JWT | Supabase Bearer | `requireAuth` (`server/lib/requireAuth.mjs:6`) | `user_profiles` |
| Staff JWT + role | Bearer + role match | `requireRole(...)` (`requireAuth.mjs:31`) | `user_profiles.role` |
| Portal v2 client JWT | Bearer (project-scoped) | `requirePortalAuth` (`requirePortalAuth.mjs:27`) → `requirePortalLogin` (:128) → `requirePortalWrite` (:151) | `project_client_users` |
| Portal legacy token | URL `:token` (anonymous, read-only) | `requirePortalAuth` (token path) | `projects.portal_token` |
| Worker magic-link | `?token=` / `x-worker-token` | `workerAuth` (`workforceRoutes.mjs:~1337`) | `employees.worker_token` |
| Public / induction | none | — (`inductionRoutes.mjs:29`) | n/a (project-scoped) |

Key gate to preserve: `requireAuth` **rejects `role='client'`** from staff APIs — clients must use the portal middleware. The console must respect this separation (never let a "preview as client" leak into staff endpoints).

---

## 5. Target modules — grounded gating + audit candidates

| Module | Route file | Read gating | Write gating | Console value |
|--------|-----------|-------------|--------------|---------------|
| Workforce admin | `workforceRoutes.mjs` | all staff (`requireAuth`) | admin / admin+supervisor (approve = admin) | Reference (seed lives here) |
| Worker PWA | `workforceRoutes.mjs` (worker) | `workerAuth` token | `workerAuth` | Replay visibility (already done in P3) |
| Client Portal | `portalV2Routes.mjs` / `portalRoutes.mjs` | `requirePortalAuth` | `requirePortalWrite` (primary/secondary) | High-value preview (Phase 4) |
| Project / Operations | `operationsRoutes.mjs` | `requireAuth` | ⚠️ `requireAuth` only — **writes not role-gated** | **Audit candidate** |
| Schedule / Site Diary | `scheduleRoutes.mjs` | all staff | admin+supervisor (diary: all staff) | Matrix coverage |
| WHS | `whsRoutes.mjs` | `requireAuth` | ⚠️ `requireAuth` only — **no role tiers** | **Audit candidate** |
| Procurement | `procurementRoutes.mjs` | admin+supervisor | admin+supervisor; PO draft/issue = admin | Consistent |
| Selections / Variations / Claims | `procurementRoutes.mjs` + portal | internal admin+supervisor; portal read | portal `requirePortalWrite` | Cross-boundary preview |
| Documents / Photos | `portalV2Routes.mjs` (+ Finance/Dropbox) | portal auth | `requirePortalWrite` | No dedicated internal docs module yet |

> ⚠️ **Audit candidates flagged by the inventory (UNVERIFIED — need a separate confirmation pass, NOT part of this parking item):** Operations write routes (e.g. `PATCH /api/projects/:id/commencement`) and all WHS routes appear gated by `requireAuth` only, with no `requireRole`. If intentional, fine; if not, these are exactly the gaps a Role Preview Console (Phase 5 matrix) is meant to surface. **Do not treat as confirmed bugs.**

---

## 6. Existing preview mechanisms — reuse vs avoid

| Mechanism | Where | Is it a safe read-only *view* preview? | Disposition |
|-----------|-------|----------------------------------------|-------------|
| **Workforce "Preview as worker"** | `WorkforceTeam.jsx` + `/api/workforce/employees/:id/(task-)preview` | ✅ Yes — admin-authed, read-only, replays worker visibility, **no worker token** | **SEED** — generalize into the console |
| Portal v2 Admin console | `portalV2AdminRoutes.mjs` | ❌ No — it *configures* what clients see (content mgmt), not a view preview | Leave in place |
| Worker PWA `workerAuth` | `workforceRoutes.mjs` | ❌ No — real production worker access | Never use as the console's path |
| Portal client login (JWT/token) | `portalRoutes.mjs` | ❌ No — real production client access | Never use as the console's path |
| Role-based nav (`roles.js` `can.*`, `AppShell.jsx`) | `src/lib/roles.js`, `AppShell.jsx:~196` | n/a — authorization, not preview | **Source of truth** for "visible/hidden routes" |
| Old `/worker?preview` | removed (W17-P3) | — | Gone; do not resurrect |

**Design consequence:** there is exactly **one** good "view-as" pattern today (the Workforce one). The console **generalizes that pattern** and pulls the visible/hidden-route data from `roles.js` + the route gating map in §5. It does **not** wrap the production worker/portal auth paths.

---

## 7. Placement — Settings → Developer Tools (admin-only)

- `src/pages/Settings.jsx` is today a single linear page (no tabs) at route `/tender-manager/settings`; the nav link is in `AppShell.jsx`. Admin-only sections already self-hide (e.g. the Workforce Settings section returns `null` for non-admin/supervisor).
- **Recommended:** add a **"Developer" tab** to Settings (admin-only), following the proven URL-tab pattern in `Marketing.jsx` (tab list with an `adminOnly` flag + render guard + route redirect).
- **Files a future build would touch:** `src/pages/Settings.jsx` (introduce tabs), `src/App.jsx` (route `settings/:tab?`), new `src/components/settings/RolePreviewConsole.jsx`. Guard: `tab === "developer" && role === "admin"` (render + redirect).
- Concept layout (side panel): role · auth model · allowed actions · blocked actions · visible routes · hidden routes · test status / coverage.

---

## 8. Phased build plan (refined from Sam's Phase 1–6, grounded)

| Phase | Goal | Reality / scope |
|-------|------|-----------------|
| **1 — Inventory** | Roles, auth models, module gating, preview needs | **Largely done in this doc (§3–§6).** Remaining: author the declarative **role → expected visible/hidden routes + actions** map (the matrix source of truth) |
| **2 — Developer Tools shell** | Admin-only Settings "Developer" tab + empty read-only console scaffold | Settings tabs + route + `RolePreviewConsole.jsx`; no preview logic yet |
| **3 — Workforce/Worker preview** | Move/generalize the W17-P3 worker preview into the console; add supervisor/employee/leading-hand lenses | Reuse `task-preview` route pattern; add module + role + person + project pickers |
| **4 — Client Portal preview** | Read-only render of what a portal client/rep sees per project | **Console-auth read** of portal data (admin re-reads + applies portal visibility); **never** mint a client token; respect sub-roles (primary/secondary/architect/accountant) |
| **5 — Route/action permission matrix** | Declarative role × route/action map rendered in the side panel; flags missing/inconsistent gating | Surfaces the §5 audit candidates (Operations writes, WHS tiers) automatically |
| **6 — Test integration** | The matrix becomes test fixtures; batch-a asserts live gating == declared matrix | Catches permission **drift** in CI; ties into the existing `scripts/batch-a/*` harness |

Each phase is its own `phase → test → regression → report → Sam approval → next` loop (same cadence as W17). Subcontractor/supplier role previews are **out of scope** until those personas get real auth paths.

---

## 9. Open questions for Sam (when this is picked up)

1. Should the console ever gain an **explicit, separately-approved "act as" mode** (write), or stay forever read-only?
2. Is the **route/action matrix (Phase 5)** the priority (audit value), or the **client-portal preview (Phase 4)** (the view you most want to sanity-check)?
3. Do we want the flagged **Operations/WHS gating gaps** verified now as a small separate task, independent of this console?
4. Confirm **admin-only** (not admin+supervisor) for the Developer Tools tab itself.

---

## 10. Approval gate

**This is a parking item.** No code, no schema, no route, no UI is to be built from this document without a **separate, explicit Sam approval** that names the phase to start. Recorded in `SAM_DECISION_LOG.md`.
