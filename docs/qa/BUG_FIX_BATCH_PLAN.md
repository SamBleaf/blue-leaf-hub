# Bug-Fix Batch Plan (Fix-Agent) — 2026-07-02

> Compiled by the hardening loop after the SOP sweep (Waves 02B–04). **Product code** — Sam-gated.
> Execute this batch, then re-run the automated E2E. Grouped by risk so the feature-ish items get a
> deliberate go-ahead separately from the clear bug fixes.

## A — Clear, low-risk bug fixes (recommend: do all)
| # | ID | Module | Fix | Files (approx) |
|---|----|--------|-----|-------|
| A1 | BUG-TENDER-01 | Tendering | `TenderBoard.jsx` calls `authFetch('/api/tender/job-delete')` directly — switch to `apiPost` (CLAUDE.md standard) | `src/pages/TenderBoard.jsx` |
| A2 | BUG-MKT-01 | Marketing | Music Library tab (`/marketing/music`) reachable by Supervisor — enforce admin-only route guard (**security**) | marketing route guard |
| A3 | BUG-MKT-02 | Marketing | Campaigns "Generate content for this week" loses `campaign_id` — pass it in the Studio query string | campaigns component |
| A4 | BUG-MKT-03 | Marketing | Brand-voice `BANNED_PHRASES` misses luxurious/stunning/bespoke/etc. — add them | banned-phrases list |
| A5 | PRETENDER-DUP | Cost Intel | `pretender_estimates` insert has no idempotency guard → duplicate rows — skip insert when no `job_id` / dedupe | `costIntelligenceRoutes.mjs` |
| A6 | CRM-CONSENT | CRM | New-Contact form collects `consentToEmail`/`consentSource` that `POST /api/crm/contacts` ignores — **remove** the unused fields from the form (consent already lives on `mailing_list_members`) | `CrmContacts.jsx` (NewContactModal) |
| A7 | QUOTETRACKER-DEAD | Tendering | `QuoteTracker.jsx` is dead (sidebar redirects to `RfqPackageDetail.jsx`) — remove the component + redirect | `QuoteTracker.jsx`, route |
| A8 | GST-SERVER-CONST | Finance/RFQ | `module4Routes.mjs` hardcodes `GST_RATE=0.10` — create `server/lib/constants.mjs` (GST_RATE/incGst/gstAmount) + import | new `server/lib/constants.mjs` |

## B — Medium bug fixes (real bugs, slightly larger; recommend: do all)
| # | ID | Module | Fix |
|---|----|--------|-----|
| B1 | SOP-BUG-02-07 | Sales | Clicking a saved conversation opens the new-transcript flow — add a **read-only transcript view** to `ConversationPanel` |
| B2 | SOP-BUG-09-JOBVIEW | Finance | Finance "Job View" tab unreachable (`/finance/jobs` renders the selector; legacy panel orphaned) — wire the tab/route to the intended job-financials view |
| B3 | SOP-BUG-11-12 | Portal | Add a v1→v2 admin link in `PortalAdmin`; reconcile the v2 console role (SOP now says admin-only — confirm code matches) |

## C — Feature-ish (NOT one-line bugs — need explicit go-ahead)
| # | ID | Module | Scope | Note |
|---|----|--------|-------|------|
| C1 | SOP-BUG-07-03 | Site Diary | Add **Edit→Save** (new PATCH route + UI) and a **date-range filter** to past diary entries | Net-new feature; the SOP currently documents it as view-only. |
| C2 | LOGIN-RESET | Auth | Add a **self-service password reset** (Supabase native) to the login page | Net-new feature. |
| C3 | SOP-BUG-05-05 | Operations | Global-Gantt task click → navigate to the project schedule | **Low** — SOP already descoped; candidate to **accept as-is** (leave). |

## Execution notes
- Flip the loop guard `product_code_changes_allowed: true` for this batch only; revert after.
- Each fix: lint + build green; commit per logical group (not one giant commit); never `git add -A` (shared branch).
- After the batch: run the automated E2E (`api-security` + targeted specs) + the affected write suites.
- Update `BUG_REGISTER.md` statuses (open → fixed) as each lands.
