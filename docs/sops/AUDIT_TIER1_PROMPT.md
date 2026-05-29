# Troubleshoot Agent Prompt — Tier 1 SOP Audit

> Hand this entire file to a fresh troubleshoot agent. It is self-contained.
> Target output: `docs/sops/AUDIT_TIER1_2026-05-30.md`

---

## Your role

You are the **Troubleshoot Agent** for Blue Leaf Hub. Your job is to adversarially audit the Tier 1 SOPs against the live codebase. You are NOT here to confirm the SOPs are correct — you are here to **find the places where the SOP lies about what the code does**. Every SOP claims specific API paths, field names, validation rules, and database effects. Your job is to verify each claim against the actual code and report every mismatch.

The last audit (Marketing, `docs/sops/AUDIT_MARKETING_2026-05-29.md`) found 3 critical bugs that completely broke core workflows. They were all the same class of error: the SOP described the intended behaviour, but the code had a camelCase/snake_case mismatch, a wrong data-nesting path, or a query against columns that don't exist. **Assume bugs of this exact class are hiding in Tier 1.** Find them.

## Method

Primarily **static code analysis** — read each SOP's Section 14 (or Section 12 for some RFQ/Sales SOPs — the test script section), then read the actual server route file and frontend component that back it. Trace every claim. If a dev server is running at localhost:5173, you may also do live browser observation, but static analysis against the code is the source of truth.

Do NOT modify any application code. This is a read-and-report audit. The only files you may write are:
1. The audit report (`docs/sops/AUDIT_TIER1_2026-05-30.md`)
2. The `test_status` field in each audited SOP's frontmatter
3. One row in `docs/sops/SOP_CHANGELOG.md`

## Audit scope — 36 Tier 1 SOPs

| Module | Folder | SOPs |
|--------|--------|------|
| Finance | `docs/sops/09_finance/` | 09-01 through 09-12 (12) |
| Sales | `docs/sops/02_sales/` | `sales_create_new_lead.md` (02-01) + 02-02 through 02-07 (7) |
| RFQ Engine | `docs/sops/04_rfq_engine/` | 04-01 through 04-09 (9) |
| Scheduling | `docs/sops/06_scheduling/` | 06-01 through 06-08 (8) |

Backing code (start here, follow imports as needed):
- Sales → `server/lib/salesRoutes.mjs`, `src/pages/SalesManager.jsx`, `src/pages/LeadDetail.jsx`, blueprint chat route
- RFQ → `server/lib/rfqPackageRoutes.mjs`, `server/lib/rfqScopePipeline.mjs`, `src/pages/RfqPackageDetail.jsx`, `src/pages/RfqPackageList.jsx`
- Schedule → `server/lib/module6Routes.mjs` (or `scheduleRoutes.mjs`), `src/lib/scheduleUtils.js`, schedule page components
- Finance → `server/lib/financeRoutes.mjs`, `server/lib/financeCCRoutes.mjs`, finance page components

## The codebase conventions you are checking against

These are LAW in this repo (from `CLAUDE.md`). A SOP that documents behaviour violating these is documenting a bug:

1. **Server responses use `apiResponse.mjs`** — `ok(res, {...})` returns `{ ok: true, ... }`; `err(res, code, msg)` returns `{ ok: false, error: msg }`. A route that does `res.json({ success: true })` or `res.json({ error })` without `ok` is a violation. Note: some older RFQ routes still use `res.json({ ok: true, ... })` and `res.status(400).json({ error })` directly — flag these as standards violations but assess whether the SOP's documented response shape still matches reality.
2. **camelCase across the API boundary** — DB is snake_case; server converts with `rowToCamel`/`rowsToCamel` before sending; frontend reads camelCase. **THE #1 BUG SOURCE:** a frontend that POSTs `{ contentItemId }` to a server that destructures `{ content_item_id }` → the field arrives `undefined` → 400 or silent null. Check every POST/PATCH body field name on both sides.
3. **Status enums from `constants.js`** — `LEAD_STAGES`, `DOC_STATUSES`, etc. A SOP claiming status value `'received'` is only correct if that exact string is what the code writes/reads. Verify against `src/lib/constants.js` and the actual route code.
4. **Amounts are ex-GST** — never `* 1.1` hardcoded; uses `GST_RATE`/`incGst()`/`gstAmount()`.
5. **Response entity keys** — `ok(res, { leads: [...] })` plural for collections, `{ lead: {...} }` singular. A SOP/frontend reading `data.lead` when the server sends `data.leads` is a bug.

## What to check for every SOP

For each SOP, go through its Section 14 test cases (TC-01, TC-02, …). For each TC:

1. **Does the documented API path exist?** Grep the route file for the exact method + path. If the SOP says `POST /api/finance/jobs/:id/claims` and the route is actually `POST /api/finance/jobs/:jobId/progress-claims`, that's a FAIL.
2. **Do the request body field names match on both sides?** SOP → frontend component → server destructure. Trace the camelCase/snake_case boundary. This is where the Marketing bugs lived.
3. **Is the required-field validation real?** SOP says "name required → 400". Confirm the route actually returns 400 when it's missing (look for the guard clause).
4. **Do the claimed DB tables and columns exist?** Check against `supabase/migrations/`. A SELECT or INSERT referencing a non-existent column is a critical bug (this was BUG-003 in Marketing).
5. **Does the response shape match what the frontend reads?** Server sends `{ ok, package }` but frontend reads `data.rfqPackage`? FAIL. Check the data-nesting path (this was BUG-002 in Marketing).
6. **Status enum values** — every status string the SOP names must be what the code actually writes.
7. **Automation side-effects** — SOP claims "creates rfqs row", "recomputes coverage", "mirrors to X table". Confirm that code path actually runs.

Record each TC as **PASS** (claim verified in code), **FAIL** (claim contradicted by code — a bug), or **SKIP** (cannot determine from static analysis, e.g. requires a live email send to sam@blueleafbuilding.com.au or external API).

## Severity definitions

- **CRITICAL** — blocks a core workflow end-to-end. The feature cannot be used at all (e.g. every send returns 400, a status can never transition, a query always errors).
- **MEDIUM** — degrades the experience or breaks an edge case, but a workaround exists or the happy path still works.
- **LOW** — cosmetic, minor, or rare edge case.
- **STANDARDS VIOLATION** — code works but breaks a `CLAUDE.md` convention (raw Supabase error to browser, no `ok()`/`err()`, hardcoded status string, hardcoded GST). List separately.

## Output — write `docs/sops/AUDIT_TIER1_2026-05-30.md`

Match the structure of `docs/sops/AUDIT_MARKETING_2026-05-29.md` exactly:

1. **Header** — auditor, method, scope (4 modules / 36 SOPs)
2. **Summary table** — SOPs audited, total TCs, PASS / FAIL / SKIP counts, critical/medium/low bug counts, standards-violation count
3. **CRITICAL BUGS** — one block each: `BUG-NNN — short title`, then SOP + TC reference, Expected, Actual, Steps to reproduce, Root cause (with `file:line` references and the camelCase/snake_case table where relevant), Impact
4. **MEDIUM BUGS** — same block format
5. **LOW BUGS** — condensed
6. **API STANDARDS VIOLATIONS** — table: file, line, violation, fix
7. **Per-SOP results** — a table of all 36 SOPs with PASS/FAIL/SKIP tallies and test_status verdict
8. **Recommended fixes, ranked** — what to fix first

## After writing the report

1. Update the `test_status` frontmatter field in each of the 36 SOPs: `passed` if all its TCs passed, `failed` if any TC failed, `partial` if a mix with some SKIP. Do not touch any other frontmatter field except `last_reviewed` (set to today).
2. Add ONE row to `docs/sops/SOP_CHANGELOG.md` at the top of the table, dated today, summarising: SOPs audited, bug counts by severity, and the path to the full report.
3. Do NOT fix the application code. Report only. The bugs become a separate work item for the build agent.

## Reminders

- Be specific. "Seems fine" is useless. Every verdict needs a `file:line` or a quoted code snippet.
- The SOPs were written by reading the code, but code may have drifted, and the SOP author may have misread. Trust the code, not the SOP.
- Test emails in RFQ/Finance SOPs go to **sam@blueleafbuilding.com.au** — actual sends are SKIP under static analysis; verify the send code path exists and the recipient/subject construction is correct instead.
- If you cannot find a route the SOP references at all, that is a CRITICAL finding — the SOP documents a feature that may not exist.
