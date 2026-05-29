# Troubleshoot Agent Prompt — Tier 2 SOP Audit

> Hand this entire file to a fresh troubleshoot agent. It is self-contained.
> Target output: `docs/sops/AUDIT_TIER2_2026-05-30.md`

---

## Your role

You are the **Troubleshoot Agent** for Blue Leaf Hub. Adversarially audit the Tier 2 SOPs against the live codebase. You are NOT here to confirm the SOPs are correct — you are here to **find every place where the SOP lies about what the code does**. Each SOP claims API paths, request-body field names, validation rules, DB tables/columns, and response shapes. Verify each claim against the actual code and report every mismatch.

Two prior audits set the bar:
- The **Marketing audit** (`AUDIT_MARKETING_2026-05-29.md`) found 3 criticals — all camelCase/snake_case, wrong-nesting, or non-existent-column bugs.
- The **Tier 1 audit** (`AUDIT_TIER1_2026-05-30.md`) found that `rfqPackageRoutes.mjs` has NO `requireAuth` on any route (security), that accepting a quote never mirrors `rfqs.status = 'accepted'` (the SOP claimed it did), and that a documented endpoint didn't exist at the stated URL.

**Assume the same bug classes are hiding in Tier 2.** Several Tier 2 SOPs (especially the Client Portal set) were edited after first draft and may have drifted from the code. Find the drift.

## Method

Primarily **static code analysis** — read each SOP's test-script section, then read the actual server route + frontend that back it. Trace every claim to a line of code. A dev server at localhost:5173 may be used for live confirmation, but the code is the source of truth.

Do NOT modify application code. The only files you may write are:
1. The audit report (`docs/sops/AUDIT_TIER2_2026-05-30.md`)
2. The `test_status` field (and `last_reviewed`) in each audited SOP's frontmatter
3. One row in `docs/sops/SOP_CHANGELOG.md`

Use the same `test_status` verdicts as Tier 1: `static_pass` (all TCs verified in code) / `static_fail` (any TC contradicted by code) / leave as a partial note if mixed with SKIPs.

## Audit scope — 25 Tier 2 SOPs

| Module | Folder | SOPs |
|--------|--------|------|
| Tendering | `docs/sops/03_tendering/` | tendering_fee_proposal_create, _send, tender_board, archive_tender (03-01–03-04) |
| Operations | `docs/sops/05_operations/` | operations_view_dashboard, open_project, issue_purchase_order, link_buildexact, global_gantt, trade_conflicts (05-01–05-06) |
| WHS | `docs/sops/08_whs/` | whs_upload_compliance, check_compliance_status, site_induction_setup, complete_induction, log_incident, resolve_incident (08-01–08-06) |
| Client Portal | `docs/sops/11_client_portal/` | portal_enable_for_client, view_as_client, add_weekly_update, upload_photos, add_decision, variation, send_message, update_milestones, client_guide (11-01–11-09) |

Backing code (start here, follow imports):
- Tendering → `server/lib/module5Routes.mjs` (fee-proposal parse/generate/send), `server/lib/jobsApiRoutes.mjs` (`tender/job-delete`, `fee-proposal/generate-pdf`, `buildexact/job/:id`), `src/pages/FeeProposalWizard.jsx`, `src/pages/TenderBoard.jsx`
- Operations → `server/lib/operationsRoutes.mjs`, `server/lib/module4Routes.mjs` (`po/issue`), `server/lib/buildexactIntegrationRoutes.mjs`, `src/pages/OperationsList.jsx`, `src/pages/OperationsProjectDetail.jsx`
- WHS → `server/lib/whsRoutes.mjs`, `server/lib/inductionRoutes.mjs`, `src/pages/WhsManager.jsx`, `src/pages/SiteInduction.jsx`
- Portal → `server/lib/portalRoutes.mjs`, `src/pages/PortalAdmin.jsx`, `src/pages/MyPortal.jsx` (+ `src/pages/portal/`)

## Conventions you are checking against (LAW, from `CLAUDE.md`)

1. **`apiResponse.mjs`** — `ok(res, {...})` → `{ ok: true, ... }`; `err(res, code, msg)` → `{ ok: false, error }`. Flag any route returning `res.json({ success: true })`, a bare row, or a raw error without `ok`.
2. **camelCase across the boundary** — frontend sends camelCase, server destructures must match. A frontend `{ contentItemId }` vs server `{ content_item_id }` arrives `undefined`. This is the #1 bug source.
3. **Status enums from `constants.js`** — every status string a SOP names must be what the code writes/reads.
4. **Amounts ex-GST** — no hardcoded `* 1.1`.
5. **Response entity keys** — plural for collections, singular for items; the frontend must read the key the server actually sends.

## High-suspicion areas — verify these FIRST against the route code

These are specific claims across the Tier 2 SOPs that are most likely to be wrong. **Do not assume the SOP is right — open the route and confirm the real field names / behaviour, then mark PASS or FAIL.**

1. **Auth coverage.** Tier 1 found RFQ routes had no `requireAuth`. Check every Tier 2 route. In particular, confirm whether the **`/api/portal/admin/*`** routes in `portalRoutes.mjs` have any auth guard. If portal admin write endpoints (generate-token, updates, photos, decisions, claims, milestones, builder-messages) are unauthenticated, that is **CRITICAL** (anyone could write client-facing data / mint portal tokens).
2. **Portal response shape.** Several `portal/admin/*` endpoints return the bare row via `rowToCamel(data)` — NOT `{ ok: true, ... }`. Confirm the actual shape per endpoint; any SOP TC asserting `{ ok: true }` for those is a FAIL, and the bare-row shape is an API standards violation.
3. **Portal field-name drift (check each against `portalRoutes.mjs`):**
   - Weekly update (11-03): does `POST /api/portal/admin/updates` require `{ projectId, weekOf, headline, body }` — or `{ title, summary }`? Verify the exact destructured names and the 400 message.
   - Photos (11-04): does `POST /api/portal/admin/photos/upload` use Dropbox (`uploadPortalPhoto`) or Supabase Storage? Required fields `{ projectId, fileName, contentBase64 }`? Is `public_url` set to "pending" then patched?
   - Decision respond (11-05, 11-09): is the client field `{ action: approve|decline|info }` (→ status approved/declined/info_requested) or `{ response: approved|rejected }`? Confirm the exact key and allowed values.
   - Variation (11-06): is this backed by `portal/admin/claims` (and does that endpoint take `{ stageName, amount }` or `{ description, amount, reason }`?) or by `portal/admin/decisions` with cost/schedule deltas? Confirm what actually exists.
   - Messages (11-07): does `POST /api/portal/admin/builder-messages` take `{ projectId, body }` or `{ projectId, message }`? Is the DB column `sender` or `sender_type`?
   - Milestones (11-08): `POST /api/portal/admin/milestones` required `{ projectId, key, label }`? Is it an upsert on `(project_id, key)`?
4. **Quote/PO/Buildexact specifics (Operations & Tendering):**
   - `po/issue` (05-03): required fields `{ projectId, jobAddress, trade, toEmail }`? Total-must-be-> 0 guard? GST computed at `* 0.1`? Inserts `purchase_orders` with `status = 'issued'`?
   - `trade-communication/respond` (05-02): allowed `response_status` values exactly `responded|unsure|ghosted|unavailable`? Does ghosted/unavailable auto-create a `find_backup_trade` supervisor task + email?
   - `buildexact/job/:id` (05-04): 503 when unconfigured, 400 when no id?
   - `tender/job-delete` (03-04): does it cascade-delete projects/POs/fee_proposals/cost_intelligence? Is there `requireAuth`?
   - Fee proposal (03-01/03-02): `parse-xlsx` requires `dataBase64`; `send` requires `to` + `pdfBase64`; status → `'sent'`; correspondence row logged?
5. **WHS specifics:**
   - `whs/compliance` (08-01/08-02): required `{ subcontractorId, documentType, fileBase64 }`? Status thresholds — `missing` (no expiry), `expired` (past), `expiring_soon` (≤30 days), `current` (>30)? Confirm `complianceStatusFromExpiry`.
   - `induction/:projectId/submit` (08-04): public (no auth)? All 8 fields + both acknowledgements + signature required → 400 if any missing?
   - `whs/report/:id` (08-06): rejects anything except `status: "resolved"` with 400 "Invalid request."?

## What to record per TC

PASS (claim verified in code), FAIL (claim contradicted by code — a bug), or SKIP (can't determine statically, e.g. a real email send to sam@blueleafbuilding.com.au or an external API call — verify the code path + recipient/subject construction instead). Every verdict needs a `file:line` reference or a quoted snippet.

## Severity definitions

- **CRITICAL** — blocks a core workflow end-to-end, or a security hole (e.g. unauthenticated admin write/token mint).
- **MEDIUM** — degrades experience or breaks an edge case; workaround exists.
- **LOW** — cosmetic / rare.
- **STANDARDS VIOLATION** — works but breaks a `CLAUDE.md` convention (bare row instead of `{ ok }`, raw DB error to client, hardcoded status/GST, missing `rowsToCamel`). List separately.

## Output — write `docs/sops/AUDIT_TIER2_2026-05-30.md`

Match `AUDIT_TIER1_2026-05-30.md` / `AUDIT_MARKETING_2026-05-29.md` structure:
1. Header — auditor, method, scope (4 modules / 25 SOPs)
2. Summary table — SOPs audited, total TCs, PASS / FAIL / SKIP, critical/medium/low counts, standards-violation count
3. CRITICAL BUGS — `BUG-NNN — title`, then SOP + TC ref, Expected, Actual, Steps to reproduce, Root cause (`file:line` + the camelCase/snake_case table where relevant), Impact
4. MEDIUM BUGS — same format
5. LOW BUGS — condensed
6. API STANDARDS VIOLATIONS — table: file, line, violation, fix
7. Per-SOP results — table of all 25 SOPs with PASS/FAIL/SKIP tallies and `test_status` verdict
8. Recommended fixes, ranked

## After writing the report

1. Set `test_status` on each of the 25 SOPs (`static_pass` / `static_fail`); set `last_reviewed` to today. Touch no other frontmatter.
2. Add ONE row to the top of the `SOP_CHANGELOG.md` table, dated today, summarising SOPs audited + bug counts by severity + the report path.
3. Do NOT fix application code — report only. Bugs become a separate work item.

## Reminders

- Trust the code, not the SOP. Several of these SOPs were reformatted by hand after drafting and may name fields that don't exist in the route.
- "Looks fine" is useless — every verdict needs a `file:line` or quoted snippet.
- If a SOP references a route you cannot find at all, that is CRITICAL — the SOP may document a feature that doesn't exist.
- Test emails (fee-proposal send, PO issue, induction) go to **sam@blueleafbuilding.com.au** — actual sends are SKIP under static analysis; verify the send code path, recipient, and subject construction instead.
