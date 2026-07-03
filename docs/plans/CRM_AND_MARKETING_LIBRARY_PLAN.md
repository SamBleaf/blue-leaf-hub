# CRM Restructure + Marketing Content/Asset Library — Final Plan

_Approved 2026-07-03 (Sam). Build via Sonnet sub-agents; Claude reviews. No deploy. Branch: `portal-v2`._

## Context
The Hub is drifting into "a bucket of names" — website enquiries, DMs, past clients, architects, referrers and half-leads all mixed together, and the Sales Pipeline board shows everything so it clogs. The fix is a business-shape, not just a table: **Marketing creates attention → CRM catches everyone → Sales Pipeline holds only real, qualified opportunities.** The "Relationship" screen is also literally half-finished (it calls `GET /api/crm/dashboard`, which doesn't exist). This plan restructures the CRM around that funnel, then builds a Dropbox-backed, Hub-indexed marketing library, then bridges marketing content into the existing (confirmed-working) Resend email loop.

**Governing principle — the system routes and prompts; the human qualifies and promotes.**
The CRM is the filter, the Pipeline is the shortlist. The system does the mechanical work (catch, organise, flag, exclude-until-promoted, *suggest* fit); a human makes the fit call and clicks Promote. `fit_quality` is a client-facing, consequence-tiered fact → **human-confirmed, never auto-canonical** (CLAUDE.md Canonical Data Law). No auto-classification, no auto-promotion, no auto-email.

### System-vs-Human boundary (design law for these batches)
| Concern | System | Human |
|---|---|---|
| Ingest everyone into CRM | auto | — |
| Spreadsheet: columns / sort / filter / saved views | auto | — |
| Time flags (overdue, due today, speed-to-lead, >90d cold) | auto (date math) | — |
| Keep enquiries off Pipeline board until promoted | auto (stage ≥ qualify filter) | — |
| Fit classification | **suggest only** (advisory hint) | **decides** (1 click) |
| Promote to Pipeline | — | explicit button |
| Send / nurture / mark poor-fit / close | — | human action (email untouched in 01A) |

## Approved decisions
1. **Marketing library storage** — Dropbox is the **source of truth** for marketing files/creative assets. Supabase is only a **processing mirror** where needed (thumbnails, previews, D-Log/video processing, temporary). The Hub is the **searchable index, not the file store**; every Hub library row links to the **live Dropbox file**.
2. **CRM data model** — **View first.** `v_crm_people` is a **read model** over `leads` + `crm_contacts`. **Do not physically merge** the tables yet. Non-destructive. UX feels like one CRM even though storage stays separate.
3. **Business rule** — **CRM = all people + all enquiries. Sales Pipeline = qualified active opportunities only.** New website enquiry lands in CRM first (not the Pipeline board). Promotion to Pipeline happens **after qualification**.
4. **Build order** — CRM restructure → CRM control polish → Marketing Library → asset backfill → Email/content bridge.

## Confirmed — mailing-list → Resend → analytics loop is fully built
`mailing_lists` (+6 seeded smart lists) → `mailing_list_members` (consent) → `email_sends` (links `content_item_id` + `campaign_id`) → Resend (`POST /api/crm/sends/:id/send`) → `/api/webhooks/resend` writes opens/clicks back + `increment_send_stat` RPC. Only gap = a UI that *starts from a content item* → that's **Batch 03**.

---

## Batch order

### CRM-RESTRUCTURE-BATCH-01A  ← first build
- Rename **Relationships → CRM** (tab in `SalesManager.jsx`, title in `CrmDashboard.jsx`, nav label).
- Create **`v_crm_people`** (migration 131) — read-only view UNION-ing `leads` (every enquiry incl. stage=enquiry) + `crm_contacts`, projected to one shape: `person_id, kind (lead|contact), name, type, source, suburb, project_type, budget, fit, readiness, next_step, due_date, owner, status, last_contact`.
- Build the **CRM spreadsheet view** — one sortable/filterable table (reuse Subcontractors `SortableTableHead` + `sheetSort`). Columns: Name · Type · Source · Suburb · Project type · Budget · Fit · Readiness · Next step · Due date · Owner · Status.
- **Website enquiries appear in CRM** (they already write to `leads`; the view surfaces them — no ingest change needed).
- **Sales Pipeline filters to qualified only** (`SalesPipeline.jsx` shows stage ≥ qualify; enquiry-stage stays in CRM). **Safe admin toggle / saved view: "Show qualified only" (default) vs "Show all leads"** — transition safety net so nobody thinks a lead disappeared.
- **"Promote to Pipeline"** action (sets stage enquiry→qualify; human click; reversible).
- **Fix the missing `GET /api/crm/dashboard`** — implement it (actionContacts, topRelationships, health, speedToLeadHours) OR refactor the screen so it no longer calls a missing endpoint. Prefer implement.
- **Saved views:** New enquiries · Ready for review · Today's actions · Nurture · Architects/referrers · Past clients.
- **Advisory fit hint only** (display) — no auto-decisioning. **No marketing library work in this batch.**

Files: `src/pages/SalesManager.jsx`, `src/components/crm/CrmDashboard.jsx`, `src/components/crm/CrmContacts.jsx`, `src/pages/SalesPipeline.jsx`, new `supabase/migrations/131_v_crm_people.sql` (view only), `server/lib/crmRoutes.mjs` (+`GET /api/crm/dashboard`, +people-list endpoint). Reuse `SortableTableHead`, `apiFetch`/`apiPost`, `constants.js` LEAD_STAGES, `apiResponse.mjs`.

### CRM-CONTROL-BATCH-01B
Fit/readiness/action-queue polish. Surface `fit_quality`, `readiness`, `action_type`, `action_due_at`, `snoozed_until`, owner, source properly. Basic action queue. No advanced attribution.

### MARKETING-LIBRARY-BATCH-02A
Dropbox folder structure (APB 7 categories under `/BLUE LEAF BUILDING/MARKETING/LIBRARY/`) · `marketing_library` table (`dropbox_path` + `dropbox_shared_link` + facets) · upload to Dropbox (`dropboxUploadBuffer`) · shared-link creation · Hub searchable spreadsheet index · filters (category, pillar, stage, channel, project, evergreen, tags) · open live Dropbox file from row.

### MARKETING-LIBRARY-BATCH-02B
Backfill/mirror existing `marketing-media` assets into Dropbox + index. Preserve Supabase paths where still needed. Do not delete originals.

### EMAIL-CONTENT-BRIDGE-BATCH-03
Start from a marketing content item → create an email send → attach `content_item_id` + `campaign_id` → choose mailing list → send via existing Resend plumbing → opens/clicks track back to content/campaign.

---

## Batch 01A — acceptance criteria
1. A website enquiry appears in the CRM spreadsheet.
2. It does **not** appear on the Sales Pipeline board until qualified/promoted.
3. A `crm_contact` and a `lead` both appear in the unified CRM view.
4. Sort and search work across columns.
5. Clicking a row opens Lead Detail or Contact Drawer correctly (by `kind`).
6. "Promote to Pipeline" moves the enquiry into the Sales Pipeline.
7. No product data is lost (view is read-only; only a status write on promote).
8. Existing Sales Pipeline behaviour still works for already-qualified leads.
9. Missing `/api/crm/dashboard` is either implemented or the screen no longer calls it.
10. Pipeline defaults to "qualified only" **and** offers a "Show all leads" toggle/saved view during transition.

## Batch 01A — out of scope
- Physically merging `leads` + `crm_contacts`.
- Any marketing library work (Dropbox structure, `marketing_library`, uploads).
- Advanced ROI / attribution.
- Changing email sending behaviour or sending any email.
- Auto-classifying fit or auto-promoting leads (advisory hint only).
- Live integrations (Dropbox/Resend/Meta/Google) — none needed for 01A.
- Deploy.

## Risks & rollback
- **View perf / shape mismatch** — different columns across the two tables. *Mitigation:* explicit projection + `COALESCE`, index-backed filters, `?limit/offset` pagination (`paginate`). *Rollback:* `DROP VIEW v_crm_people;` — zero data impact (read-only).
- **Pipeline filter hides real work.** *Mitigation:* enquiry-stage leads remain fully visible in CRM; "Show all leads" toggle; verify counts before/after. *Rollback:* remove the filter (one line) — data untouched.
- **Promote is a status write** — the only mutation in 01A. *Mitigation:* single field (`stage`), reversible via a "Move back to CRM" action. *Rollback:* set stage back to `enquiry`.
- **Dashboard endpoint** must conform to `apiResponse.mjs` (`ok`/`err`, camelCase). *Rollback:* revert route + component.
- **Shared branch discipline** — `portal-v2` is shared with the hardening loop. Stage only this batch's files (never `git add -A`); no commit/deploy without Sam.
- **Test data** — write tests use the `BLH TEST` marker (`buildTestJobAddress()`); dry-run cleanup after.

## Verification (Batch 01A)
- Seed a `BLH TEST` website enquiry → shows in CRM, absent from Pipeline board.
- A contact + a lead both render in `v_crm_people`; sort each column; search by name/suburb.
- Click a lead row → Lead Detail; contact row → Contact Drawer.
- Promote the test enquiry → appears on the Pipeline board; already-qualified leads unaffected.
- `GET /api/crm/dashboard` → `ok:true` with real counts (or screen no longer calls it).
- `/check` clean (lint + build + standards). Remove `BLH TEST` fixtures after.
