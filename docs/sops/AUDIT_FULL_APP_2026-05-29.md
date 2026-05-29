# Blue Leaf Hub — Full Application Troubleshoot Audit
**Version:** 1.0  
**Date:** 2026-05-29  
**Scope:** Entire application, all modules, all SOP areas (SOP 00-01 through SOP 17-04)  
**Perspective:** Adversarial — a new staff member on their first day who was handed login credentials and told "figure it out"

---

## Purpose

This audit script is for a Troubleshoot Agent running against the live (or staging) Blue Leaf Hub application. It is **not** a checklist to skim — it is a full end-to-end operational test of every module from the perspective of someone who will break things.

The agent must:
1. Read every SOP file listed below before starting any tests
2. Cross-reference each SOP step against the actual UI and the actual server code
3. Run every test case from every Section 14 in every SOP
4. Attempt adversarial scenarios designed to find edge cases that a polite tester would miss
5. Document every failure with a BUG-NNN reference, reproduction steps, and suspected root cause
6. Flag every place where the SOP says one thing and the UI does something different
7. Raise API standards violations and missing error handling

---

## Pre-Audit Setup — Real Files and Real Test Data

**Do not use placeholder files. Do not use dummy emails. Use the following actual assets.**

### Test email address
All emails sent during testing go to: **sam@blueleafbuilding.com.au**  
(Progress claims, variation sign-offs, portal invites, RFQ emails, marketing campaign sends, unsubscribe confirmations — all go here.)

### Real test files to prepare before starting

| File | What it's used for | Format | Notes |
|------|--------------------|--------|-------|
| `test_invoice.pdf` | Finance → upload invoice | PDF | A real supplier invoice with ABN, GST, dollar amounts visible. At least 1 page. |
| `test_invoice_2.pdf` | Finance → second upload test | PDF | Different supplier, different amount. Tests de-duplication logic. |
| `test_fee_proposal.xlsx` | Tender → fee proposal upload | XLSX | A real Excel fee proposal with line items. |
| `test_scope_document.pdf` | RFQ → scope extraction | PDF | A trade scope document (e.g. carpentry scope). Text-based PDF, not scanned image. |
| `test_photo_1.jpg` | Marketing → media upload | JPG | A real site photo, at least 2MP. |
| `test_photo_2.jpg` | Marketing → second media test | JPG | Different photo. |
| `test_video.mp4` | Marketing → video upload | MP4 | Short clip (10–30 seconds), minimum 1080p. |
| `test_plan.pdf` | Cost Intelligence → AI extraction | PDF | Architectural plan PDF — text-searchable. |
| `test_contacts.csv` | CRM → CSV import | CSV | Format: `first_name,last_name,email,phone,suburb,contact_type,consent_source` — 5 rows minimum. |
| `test_whs_form.pdf` | WHS → document upload | PDF | A SWMS or JSA document. |

**If any of these files don't exist on the test machine, create minimal versions before starting. A 1-page PDF with a supplier name, ABN, and $1,000+GST invoice qualifies as `test_invoice.pdf`. Do not skip file upload tests.**

---

## SOP Index — All Files to Read Before Testing

Read every SOP in this order before writing a single test result. The SOP is the specification. If the app disagrees with the SOP, that's a bug or an SOP error — both must be flagged.

```
docs/sops/00_getting_started/
  00-01_sign_in.md
  00-02_navigation.md

docs/sops/01_projects/
  01-01_create_project.md
  01-02_project_settings.md

docs/sops/02_sales_pipeline/
  02-01_overview.md
  02-02_create_lead.md
  02-03_move_lead.md
  02-04_qualifying_score.md
  02-05_blueprint_ai.md
  02-06_transcript_analysis.md
  02-07_conversations.md

docs/sops/03_tendering/
  03-01_fee_proposals.md
  03-02_create_fee_proposal.md
  03-03_send_fee_proposal.md
  03-04_fee_proposal_status.md

docs/sops/04_rfq/
  04-01_overview.md
  04-02_create_rfq.md
  04-03_scope_extraction.md
  04-04_trade_packages.md
  04-05_send_rfq.md
  04-06_receive_quotes.md
  04-07_quote_comparison.md
  04-08_accept_quote.md
  04-09_addendum.md

docs/sops/05_operations/
  05-01_overview.md
  05-02_create_project.md
  05-03_site_diary.md
  05-04_documents.md
  05-05_subcontractors.md
  05-06_tasks.md

docs/sops/06_schedule/
  06-01_overview.md
  06-02_generate_schedule.md
  06-03_edit_schedule.md
  06-04_baseline_lock.md
  06-05_eot.md
  06-06_dependency_map.md
  06-07_drag_resize.md
  06-08_ripple_cascade.md

docs/sops/07_site_diary/
  07-01_create_entry.md
  07-02_attach_photos.md
  07-03_weather_conditions.md

docs/sops/08_whs/
  08-01_overview.md
  08-02_create_swms.md
  08-03_upload_document.md
  08-04_assign_to_project.md
  08-05_expiry_tracking.md
  08-06_sign_off.md

docs/sops/09_finance/
  09-01_upload_invoice.md
  09-02_ai_extraction_review.md
  09-03_job_match.md
  09-04_approve_invoice.md
  09-05_hold_invoice.md
  09-06_reject_invoice.md
  09-07_job_command_centre.md
  09-08_progress_claims.md
  09-09_margin_risk.md
  09-10_variations.md
  09-11_wipaa_review.md
  09-12_cashflow_forecast.md

docs/sops/10_workforce/
  10-01_workforce_overview.md

docs/sops/11_client_portal/
  11-01_overview.md
  11-02_invite_client.md
  11-03_portal_navigation.md
  11-04_view_progress.md
  11-05_sign_variation.md
  11-06_view_claims.md
  11-07_view_schedule.md
  11-08_messages.md
  11-09_documents.md

docs/sops/12_settings/
  12-01_company_settings.md
  12-02_users.md
  12-03_integrations.md
  12-04_notifications.md
  12-05_templates.md
  12-06_billing.md

docs/sops/13_subcontractors/
  13-01_subcontractor_register.md
  13-02_create_subcontractor.md
  13-03_documents.md

docs/sops/14_cost_intelligence/
  14-01_benchmarks.md
  14-02_pre_tender.md

docs/sops/15_marketing/
  (all SOPs in this folder)

docs/sops/16_marketing_intelligence/
  (all SOPs in this folder)

docs/sops/17_crm_mailing_list/
  17-01_relationship_dashboard.md
  17-02_contacts.md
  17-03_log_interaction.md
  17-04_mailing_lists.md
```

---

## Audit Methodology

### Step 1 — SOP vs Code Cross-Reference (before any browser testing)

For each SOP:
1. Read the SOP fully
2. Find the corresponding server route(s) listed in "Automation notes" or "API reference" sections
3. Open the server route file and verify the endpoint exists at the documented path
4. Check: does the API use `ok()/err()` from `apiResponse.mjs`? If not, flag as API-STANDARDS violation
5. Check: does the API return camelCase (via `rowToCamel`)? If columns are snake_case in the response, flag it
6. Check: does the UI use `apiFetch/apiPost`? If it uses raw `fetch()`, flag it
7. Check: does the SOP describe a UI element (button, form field, tab) that doesn't exist in the component file?

### Step 2 — Section 14 Test Cases

Every SOP has a Section 14 (Troubleshoot Agent Test Script). Run every test case. Mark each:
- `PASS` — behaves exactly as described
- `FAIL [BUG-NNN]` — does not behave as described; log the bug
- `SKIP [reason]` — cannot test because prerequisite not met (e.g. RESEND_API_KEY not configured); note it

### Step 3 — Adversarial Testing

After running the Section 14 cases, run the adversarial scenarios listed in this document. These go beyond what Section 14 covers and are specifically designed to expose edge cases.

### Step 4 — API Standards Audit

Review every server route file touched during this audit:
- All responses through `ok()/err()` — not raw `res.json()`
- All DB results through `rowToCamel/rowsToCamel`
- All inputs validated before DB insert
- No unhandled promise rejections
- No try/catch that swallows errors silently

### Step 5 — SOP Accuracy Check

After testing, review every SOP for:
- Steps that describe the wrong UI location
- Steps that omit a required field
- Steps that describe functionality that is not yet built (marked with what IS actually implemented)
- Steps that include functionality that was removed

### Step 6 — Performance Check

- Every page load should appear within 3 seconds on a standard connection
- No API endpoint should take > 5 seconds for a typical dataset
- Any page that requires multiple sequential API calls should load incrementally (not show a blank screen until all calls complete)

---

## Module-by-Module Test Script

---

### MODULE 00 — Getting Started

**SOP files:** 00-01, 00-02

**Test sequence:**
1. Sign out completely (clear session)
2. Navigate to the Hub URL
3. Verify: sign-in page appears (not a blank screen, not a 404)
4. Sign in with Admin credentials
5. Verify: redirects to the correct landing page per SOP 00-01
6. Navigate every top-level module listed in SOP 00-02
7. Verify: each module loads without a console error

**Adversarial:**
- Sign in with a wrong password → verify error message is human-readable, not "401 Unauthorized"
- Sign in with a blank password → verify client-side validation fires before any API call
- Navigate to a non-existent route (`/does-not-exist`) → verify 404 page, not a white screen
- While logged in, manually clear the auth token from localStorage → refresh → verify graceful redirect to sign-in, not an API error loop

---

### MODULE 01 — Projects

**SOP files:** 01-01, 01-02

**Test sequence — run every Section 14 test case in each SOP**

**Adversarial:**
- Create a project with no name → verify field-level validation, not a server 500
- Create two projects with the same name → verify the system either prevents it or handles duplicates gracefully
- Delete a project that has linked financial documents → verify the system either prevents deletion or explains the dependency

---

### MODULE 02 — Sales Pipeline

**SOP files:** 02-01 through 02-07

**Test sequence — run every Section 14 test case**

**Key tests for Blueprint AI (SOP 02-05):**
1. Open a lead at "Discovery" stage
2. Click Blueprint AI
3. Verify: response is in the correct APB 8-question format
4. Verify: response references the actual lead details (name, project type, budget) — not generic placeholders
5. Verify: the response does NOT use banned phrases listed in the brand voice rules
6. Test with a lead that has no project type set — verify the AI still responds sensibly, does not hallucinate a project type

**Key tests for Transcript Analysis (SOP 02-06):**
1. Paste a realistic 10-line transcript (make one up)
2. Verify: analysis returns structured suggestions, not a raw dump
3. Paste an empty string → verify validation error, not a server crash
4. Paste 10,000 characters → verify it processes or returns a meaningful "too long" message

**Key tests for Qualifying Score (SOP 02-04):**
1. Set all qualifying fields to their best values → verify score is high
2. Clear all qualifying fields → verify score drops accordingly
3. Change one field → verify score updates immediately without full page reload

**Adversarial:**
- Move a lead backwards in the pipeline (to an earlier stage) → verify the system allows it (APB process should not prevent backward movement — staff make mistakes)
- Create a lead with a duplicate email to an existing lead → verify the system either warns or deduplicates
- Attempt to convert a lead that is already converted (has a project) → verify the button state and error message
- Close the browser mid-way through a Blueprint AI generation → reopen → verify the half-generated response is not saved as the final suggestion

---

### MODULE 03 — Tendering

**SOP files:** 03-01 through 03-04

**Test sequence — run every Section 14 test case**

**Fee proposal email test (SOP 03-03):**
1. Create a complete fee proposal
2. Send via email to: **sam@blueleafbuilding.com.au**
3. Verify: email arrives within 5 minutes
4. Verify: email contains the correct client name, project address, and fee amount
5. Verify: the PDF attachment opens and displays correctly
6. Verify: the fee proposal status updates to "Sent" after sending

**Real file test:**
- Upload `test_fee_proposal.xlsx` as an attachment during fee proposal creation
- Verify: file is stored and accessible via download link
- Verify: the file name displayed matches the uploaded file name

**Adversarial:**
- Send a fee proposal with a $0 total → verify the system either prevents it or warns the user
- Send a fee proposal to a malformed email address (`notanemail`) → verify validation fires before API call
- Change the fee proposal amount after it has been sent → verify the status changes to reflect the modification

---

### MODULE 04 — RFQ (Request for Quote)

**SOP files:** 04-01 through 04-09

**Test sequence — run every Section 14 test case**

**AI scope extraction test (SOP 04-03):**
1. Create an RFQ, attach `test_scope_document.pdf`
2. Click extract scope
3. Verify: extraction returns structured trade items, not raw paragraph text
4. Verify: confidence scores appear where applicable
5. Test with a scanned-image PDF (if available) → verify the system returns a graceful "unable to extract" rather than a crash

**RFQ email test (SOP 04-05):**
1. Complete a full RFQ with at least 2 trade packages
2. Send all emails to: **sam@blueleafbuilding.com.au** (override recipient or use a test subcontractor)
3. Verify: each email arrives, contains the correct trade scope, and includes the reply-by date
4. Verify: the RFQ status updates per-package when email is sent

**Quote upload and comparison (SOPs 04-06 and 04-07):**
1. Upload a quote response (use `test_invoice.pdf` as a stand-in)
2. Verify: quote amount and details are captured
3. Add a second quote from a different supplier
4. Open comparison view → verify both quotes appear side-by-side
5. Verify: the "accept" button is present and distinct from "save as draft"

**Addendum test (SOP 04-09):**
1. After sending an RFQ, create an addendum
2. Send addendum to: **sam@blueleafbuilding.com.au**
3. Verify: addendum email clearly indicates it is an update to the original RFQ, not a new request

**Adversarial:**
- Upload a quote with an amount that is higher than the budget line item → verify the system flags the overage or highlights it in comparison
- Accept a quote and then attempt to send another quote for the same package → verify the system prevents this or clearly warns
- Create an RFQ with no trade packages → verify the system does not allow sending

---

### MODULE 05 — Operations

**SOP files:** 05-01 through 05-06

**Test sequence — run every Section 14 test case**

**Adversarial:**
- Archive a project that has active tasks → verify warning before archiving
- Assign a task to a staff member who doesn't exist → verify the dropdown only shows valid users
- Create a subcontractor with a duplicate ABN → verify the system catches this

---

### MODULE 06 — Schedule

**SOP files:** 06-01 through 06-08

**Test sequence — run every Section 14 test case**

**AI schedule generation (SOP 06-02):**
1. Create a schedule for a test project
2. Click Generate AI Schedule
3. Verify: schedule returns with at minimum 5 distinct phases
4. Verify: tasks have durations, dependencies, and start/end dates
5. Verify: the AI does not return duplicate task names

**Ripple cascade test (SOP 06-08):**
1. Generate a schedule with dependencies set
2. Drag the "Slab" task to 2 weeks later
3. Verify: downstream tasks (Frame, Lock-up, etc.) all shift by the same 2 weeks
4. Verify: tasks that depend on the moved task shift; tasks that DON'T depend on it do not shift

**Baseline lock test (SOP 06-04):**
1. Lock the schedule baseline
2. Attempt to drag a task
3. Verify: drag is prevented or a "locked" message appears
4. Verify: the lock cannot be undone without a confirmation step

**EOT test (SOP 06-05):**
1. Create an Extension of Time event
2. Apply it to the project
3. Verify: practical completion date moves by the approved EOT days
4. Verify: EOT reason is recorded and viewable in history

**Adversarial:**
- Generate a schedule when no project type is set → verify the AI handles this gracefully, does not hallucinate
- Lock the baseline and then attempt an EOT → verify EOT correctly updates the end date even when locked (EOT should override the lock, or the system should clearly explain)
- Create a circular dependency (Task A depends on Task B, Task B depends on Task A) → verify the system catches this before saving

---

### MODULE 07 — Site Diary

**SOP files:** 07-01 through 07-03

**Test sequence — run every Section 14 test case**

**Photo attachment test (SOP 07-02):**
1. Create a site diary entry
2. Attach `test_photo_1.jpg`
3. Verify: photo appears as thumbnail in the entry
4. Verify: clicking the thumbnail opens the full-size image
5. Attach `test_photo_2.jpg` as well
6. Verify: both photos appear, neither overwrites the other

**Adversarial:**
- Attach a 20MB photo → verify the system either rejects it with a clear size limit message or compresses it
- Attach a `.exe` file → verify the system rejects non-image/non-document files
- Create an entry with no weather conditions set → verify it saves without error (weather should be optional)

---

### MODULE 08 — WHS (Workplace Health & Safety)

**SOP files:** 08-01 through 08-06

**Test sequence — run every Section 14 test case**

**Document upload test (SOP 08-03):**
1. Upload `test_whs_form.pdf` as a SWMS
2. Verify: document appears in the WHS register
3. Verify: an expiry date can be set
4. Verify: the document opens correctly via the download/preview link

**Expiry tracking test (SOP 08-05):**
1. Upload a document and set the expiry date to yesterday
2. Verify: the document appears in an "Expired" or "Overdue" state
3. Verify: a visual indicator (red/orange) distinguishes expired from current documents

**Sign-off test (SOP 08-06):**
1. Complete the sign-off flow for a SWMS
2. Verify: signed status is recorded with the signer name and timestamp
3. Verify: after signing, the document cannot be accidentally signed again by the same person

**Adversarial:**
- Upload a SWMS and assign it to a project that doesn't exist → verify the system handles the invalid project ID
- Set an expiry date in the past when first uploading → verify the system either warns or marks it as already expired

---

### MODULE 09 — Finance

**SOP files:** 09-01 through 09-12

**This is the highest-risk module. Be particularly adversarial here.**

**Invoice upload test (SOP 09-01):**
1. Upload `test_invoice.pdf` via drag-drop
2. Verify: upload progress shows and completes
3. Upload `test_invoice.pdf` again (duplicate) → verify the system warns about a possible duplicate
4. Upload `test_invoice_2.pdf` → verify both appear in the inbox

**AI extraction review test (SOP 09-02):**
1. After upload, open the extraction review for `test_invoice.pdf`
2. Verify: supplier name, ABN, amount (ex GST), GST, total, and invoice date are all extracted
3. Verify: confidence indicators are shown (high/medium/low)
4. Manually correct one extracted field
5. Verify: correction is saved and the corrected value is used, not the AI value

**Job match test (SOP 09-03):**
1. Ensure the invoice's supplier name matches a known subcontractor on a test project
2. Verify: the system suggests the correct job match (tier 1 or 2 match)
3. Test with a supplier that has no match → verify the system shows "no match found" rather than a false match
4. Manually select a job → verify the match is recorded

**Approval flow (SOPs 09-04, 09-05, 09-06):**

*Approve:*
1. Select a trade category (required)
2. Click Approve
3. Verify: invoice status → "approved"
4. Verify: `supplier_trade_defaults` `confirmed_count` increments (check via DB or re-upload same supplier)

*Hold:*
1. Click Hold, enter a reason, set a follow-up date
2. Verify: invoice status → "on_hold"
3. Verify: follow-up date is stored and visible
4. Try to hold without a reason → verify validation fires

*Reject:*
1. Click Reject, enter a reason
2. Verify: invoice status → "rejected"
3. Try to reject without a reason → verify validation fires

**Trade required test:**
1. Try to approve an invoice without selecting a trade category
2. Verify: the system returns a 400 error: "trade_category_id is required"
3. Verify: the UI shows a field-level error, not just a toast

**Progress claims test (SOP 09-08):**
1. Create a progress claim for the "Slab" stage
2. Set the amount and issued date
3. Send via email to: **sam@blueleafbuilding.com.au**
4. Verify: email arrives with a PDF attachment
5. Verify: the PDF shows the correct claim amount, job address, stage name, and due date
6. Verify: the claim status updates to "Issued"
7. Mark the claim as paid
8. Verify: status updates to "Paid", payment date recorded

**Variations test (SOP 09-10):**
1. Create a variation with a line item priced from Buildxact recipes (or manually if Buildxact not configured)
2. Set the client price and builder cost
3. Verify: margin is calculated correctly ((client price - cost) / client price)
4. Send via email to: **sam@blueleafbuilding.com.au**
5. Verify: email arrives with PDF
6. Mark as signed
7. Verify: the job's `contract_value` increases by the variation amount
8. Verify: the job's P&L now includes the signed variation

*Unsigned variation test:*
9. Create a second variation but leave it as "Draft"
10. Verify: the P&L does NOT change — unsigned variations must never affect financials

**WIPAA review test (SOP 09-11):**
1. Open the WIPAA section for a job
2. Update `forecast_total_cost`
3. Save the review
4. Verify: review appears in WIPAA history with timestamp and reviewer name
5. Verify: if last review was > 30 days ago, the accordion appears red and expanded on load

**Adversarial — Finance:**
- Try to approve an invoice for a job that is financially locked (`financial_locked = true`) → verify the system prevents it or warns
- Enter a negative dollar amount in a variation → verify validation
- Create two progress claims for the same stage → verify the system either prevents it or warns about duplicate stages
- Attempt to void a paid progress claim → verify the system requires a reason and shows a warning that this is irreversible
- Set `forecast_total_cost` lower than actual costs to date → verify the system flags this as an impossible forecast (optional — check if this check exists)

---

### MODULE 10 — Workforce

**SOP files:** 10-01

**Test sequence — run every Section 14 test case**

**Worker PWA test:**
1. Navigate to the worker PWA route
2. Verify: the page loads and shows the correct worker interface
3. Log a timesheet entry
4. Verify: the entry appears in the timesheet records

**Adversarial:**
- Log hours for a future date → verify the system either prevents it or flags it
- Submit a timesheet with 25 hours in one day → verify validation catches this

---

### MODULE 11 — Client Portal

**SOP files:** 11-01 through 11-09

**Client invite test (SOP 11-02):**
1. Invite a client to the portal using: **sam@blueleafbuilding.com.au**
2. Verify: invitation email arrives within 5 minutes
3. Verify: the email contains a working invite link
4. Follow the invite link → verify the portal loads with the correct project displayed
5. Verify: the client cannot see margin, budget data, or staff notes

**Variation sign-off test (SOP 11-05):**
1. From the portal (as the invited client), find a variation with "Sent" status
2. Sign the variation
3. Verify: variation status updates to "Signed" in real-time on the Hub side
4. Verify: the Hub shows the signed date and a notification for staff

**Adversarial — Portal:**
- Attempt to access a portal URL for a project the client was NOT invited to → verify 403 or redirect, not data leakage
- Click the invite link after it has expired → verify a clear "link expired" message, not a crash
- From the portal, attempt to navigate to `/admin` or `/finance` routes → verify these are inaccessible

---

### MODULE 12 — Settings

**SOP files:** 12-01 through 12-06

**Test sequence — run every Section 14 test case**

**Integration settings test (SOP 12-03):**
1. Open the Integrations settings page
2. Verify: a "Test Connection" button exists for Buildxact
3. If `BUILDEXACT_SUBSCRIPTION_KEY` is configured: test the connection and verify feedback
4. If not configured: verify the page shows a clear "not configured" state, not an error

**Adversarial:**
- Remove a required company setting (e.g. company name) and save → verify validation
- Change a user's role to a lower permission level while that user is actively logged in → verify their session reflects the new permissions within a reasonable time (or on next login)

---

### MODULE 13 — Subcontractors

**SOP files:** 13-01 through 13-03

**Test sequence — run every Section 14 test case**

**Adversarial:**
- Create a subcontractor with an invalid ABN format → verify validation
- Upload a WHS document for a subcontractor and set the expiry to today → verify it shows as expiring soon, not expired

---

### MODULE 14 — Cost Intelligence

**SOP files:** 14-01 through 14-02

**Test sequence — run every Section 14 test case**

**AI plan extraction (if built):**
1. Upload `test_plan.pdf` to the project metrics section
2. Verify: extraction runs without crashing
3. Verify: at minimum, floor area is extracted (or a "unable to extract" message is shown if the PDF is not text-based)

**Pre-tender estimate test (SOP 14-02):**
1. Fill in the pre-tender form with: floor_area = 250m², storeys = 2, project_type = new_build, site_slope = gentle
2. Submit
3. Verify: per-trade cost ranges are returned
4. Verify: a confidence score is shown
5. Verify: the "Insufficient data" message appears for trades with fewer than 3 benchmark data points

**Adversarial:**
- Enter floor_area = 0 → verify validation
- Enter floor_area = 99999 → verify the estimate returns without crashing (may have unrealistic numbers but should not 500)

---

### MODULE 15 — Marketing (Content Studio, Campaigns, Media)

**SOP files:** All SOPs in the `15_marketing/` folder

**Test sequence — run every Section 14 test case in each SOP**

**Content generation test:**
1. Create a new content item
2. Select a topic, content pillar, and target channel (Instagram)
3. Click Generate
4. Verify: content streams back (SSE works — text appears progressively, not all at once)
5. Verify: the generated content does NOT contain any of the banned phrases from the brand rules
6. Verify: the content references something specific about Blue Leaf (not generic builder content)
7. Click Regenerate
8. Verify: a different result is returned (not the same content twice)

**Photo upload test:**
1. Upload `test_photo_1.jpg` to the Media Library
2. Verify: thumbnail is generated
3. Verify: photo metadata (dimensions, file size) is displayed
4. Upload `test_video.mp4`
5. Verify: video clip is processed (thumbnail extracted, duration shown)
6. Verify: DJI D-Log M detection runs (or is noted as N/A for non-DJI footage)

**Content approval flow:**
1. Generate a content item
2. Submit for review
3. Review and approve
4. Verify: status progresses draft → in_review → approved
5. Verify: once approved, the "Send as email" button appears

**Adversarial — Marketing:**
- Generate content with a completely empty prompt → verify the system either requires a topic or returns a graceful "please provide more detail" response
- Upload a `.docx` file where a photo is expected → verify rejection with a clear file type error
- Approve a content item and then attempt to edit the body → verify the system requires moving it back to draft first (or clearly indicates whether editing is allowed post-approval)

---

### MODULE 16 — Marketing Intelligence

**SOP files:** All SOPs in the `16_marketing_intelligence/` folder

**Test sequence — run every Section 14 test case**

**Meta sync test (if `META_ACCESS_TOKEN` is configured):**
1. Trigger a manual Meta sync: `POST /api/intelligence/sync/meta`
2. Verify: returns success (or a clear "no posts to sync" message if no recent posts)
3. Verify: `social_post_snapshots` rows are created/updated in DB

**GSC sync test (if configured):**
1. Trigger `POST /api/intelligence/sync/gsc`
2. Verify: `search_console_snapshots` rows appear in DB
3. Verify: keyword positions update on the Intelligence dashboard

**If APIs are NOT configured:**
- Verify: the Intelligence dashboard shows a "not configured" state for each missing API, not a broken UI
- Verify: the sync endpoints return a clear 503 with setup instructions, not a 500

**Adversarial — Marketing Intelligence:**
- Dismiss an AI insight → verify it is marked as dismissed and no longer appears in the main list
- Verify that dismissed insights are still retrievable via the DB (they should never be deleted — audit trail)

---

### MODULE 17 — CRM and Mailing Lists

**SOP files:** 17-01 through 17-04

**This module is freshly built. Be especially rigorous.**

**Run every Section 14 test case in all four SOPs before adversarial testing.**

---

#### 17-01 Relationship Dashboard Tests

**TC-01 through TC-06 from SOP 17-01 — run all**

**Dashboard load test:**
1. Navigate to Sales → Relationships
2. Verify: page loads under 2 seconds (no spinner that runs forever)
3. Verify: if there are no contacts with due actions, the panel shows "All caught up" or similar — NOT an error

**Speed to lead display:**
1. Verify: if no leads have `first_replied_at` set, the metric shows "—" or "No data yet" — not NaN, not null, not "0 hours"

**Adversarial — Dashboard:**
- Create a contact with `next_action_type = 'waiting'` and no due date → verify this contact does NOT appear in Today's Actions overdue list
- Create a contact with a due date 6 months in the future → verify it does NOT appear in Today's Actions
- Open the dashboard with 0 contacts in the system → verify an empty state message, not a crash

---

#### 17-02 Contacts Tests

**TC-01 through TC-06 from SOP 17-02 — run all**

**Create contact with consent:**
1. Click + New Contact
2. Fill: First name = "Test", Last name = "Audit", email = "testaudit@example.com", contact_type = prospect, status = new
3. Tick "Consent to marketing emails"
4. Select consent_source = "in_person"
5. Click Create Contact
6. Verify: contact appears in list
7. Verify DB: `crm_contacts` row has `next_action_type = 'call'`, `next_action_due_date = tomorrow`

**Create contact WITHOUT consent:**
1. Repeat above but do not tick the consent checkbox
2. Verify: contact is created successfully
3. Verify: contact does NOT appear in any mailing list automatically

**Filter test:**
1. Create contacts with statuses: new, active, future
2. Click each filter chip in turn
3. Verify: each filter returns only contacts with that status

**Convert to lead:**
1. Open a contact that hasn't been converted
2. Click Convert to Lead
3. Verify: new lead appears in the Sales Pipeline
4. Verify: the contact shows "View Lead →" button
5. Verify: the lead shows a "Via CRM: [Contact name]" reference

**Adversarial — Contacts:**
- Create a contact with no first name → verify "First name is required" error
- Create a contact with `email = "notanemail"` → verify email format validation
- Create a contact and immediately archive them → verify they disappear from all lists but are retrievable via direct URL/ID
- Search for a contact by email → verify search works on email, not just name
- Convert the same contact to a lead twice → verify "Contact is already a lead" error, not a duplicate lead

---

#### 17-03 Log Interaction Tests

**TC-01 through TC-06 from SOP 17-03 — run all**

**Log interaction test:**
1. Open a contact drawer
2. Log: Type = Call, Direction = Outbound, Summary = "Audit test call — checking CRM build"
3. Set next action: Type = Email, due = next Monday
4. Click Log Interaction
5. Verify: interaction appears at the top of the timeline
6. Verify DB: `last_contact_date` updated to today
7. Verify DB: `next_action_type = 'email'`, `next_action_due_date = next Monday`

**Relationship score update:**
1. Note the contact's current score before logging
2. Log a Call (personal interaction type = +3 points)
3. Verify: score increases (unless already at 15-point cap for interactions)

**Speed to lead trigger:**
1. Create a contact
2. Convert to lead
3. Check `leads.first_replied_at IS NULL`
4. Log an OUTBOUND interaction on the original contact
5. Verify: `leads.first_replied_at` is now set

**Adversarial — Interactions:**
- Log an interaction with a blank summary → verify "summary is required" error
- Log the same interaction twice (submit the form twice rapidly) → verify only one row is created, or both rows appear (duplicate prevention is an edge case — document the behaviour either way)
- Log an `email_campaign` type interaction manually → verify the system allows it (or prevents it if designed to be auto-only — SOP says staff should not log these, but verify if the UI enforces this)
- Set next_action_type = "waiting" with no due date → verify this saves without error and the contact does NOT appear in overdue lists

---

#### 17-04 Mailing Lists Tests

**TC-01 through TC-07 from SOP 17-04 — run all**

**Default lists test:**
1. Navigate to Marketing → Lists
2. Verify: exactly 6 default smart lists appear: Active Prospects, Future Pipeline, Referrers & Partners, Past Clients, Full Active Database, New This Month
3. Verify: each list shows a member count (may be 0 if no contacts — this is correct)
4. Verify: no error state on any list

**Smart list live membership test:**
1. Note the Active Prospects count
2. Create a new contact with status = active
3. Navigate back to Lists
4. Verify: Active Prospects count has increased by 1

**Add to manual list:**
1. Create a manual list called "Audit Test List"
2. Open a contact with an email address
3. Click Add to List → select "Audit Test List" → consent_source = in_person
4. Verify: contact appears in the list member table
5. Verify DB: `mailing_list_members` row with `consent_source = 'in_person'`, `consent_at` set, `unsubscribed_at IS NULL`

**Consent required test:**
1. Try to add a contact to a list via the API without a consent_source
2. Verify: 400 error with message "consentSource is required (Spam Act compliance)"
3. Verify: NO `mailing_list_members` row is created

**Send email (if RESEND_API_KEY is configured):**
1. Open a list with at least 1 active member
2. Click Send Email
3. Fill in: Subject = "Audit Test — Please Ignore", body = `<p>This is an automated audit test email.</p>`
4. Send to: ensure the only member is an email address that routes to **sam@blueleafbuilding.com.au** (or use a test list with only that contact)
5. Click Send
6. Verify: email arrives at sam@blueleafbuilding.com.au within 5 minutes
7. Verify: email contains the unsubscribe footer (Blue Leaf branding, unsubscribe link)
8. Verify: the unsubscribe link is present and is a valid URL
9. Click the unsubscribe link
10. Verify: browser shows "You've been unsubscribed" confirmation page (not a 404, not a crash)
11. Verify DB: `mailing_list_members.unsubscribed_at` is set, `email_unsubscribes` row created
12. Navigate back to the list → verify the member shows as "Unsubscribed"

**Send email (if RESEND_API_KEY is NOT configured):**
1. Open a list with at least 1 active member
2. Click Send Email → fill form → Send
3. Verify: clear error message: "Email sending is not configured yet. Add RESEND_API_KEY to Railway."
4. Verify: NO `email_sends` row is created with a failed status (or if one is, it shows the error clearly)

**Remove member manually:**
1. Open a list with a member
2. Click Remove next to the contact
3. Verify: member status changes to "Unsubscribed"
4. Verify DB: `unsubscribed_at = now()`, `unsubscribed_via = 'manual'`
5. Verify DB: `email_unsubscribes` row created

**Send stats:**
1. After sending an email, open the list → Sends tab
2. Verify: the send appears with subject, status, and recipient count
3. Verify: open rate and click rate display as percentages (not raw numbers without context)

**Adversarial — Mailing Lists:**
- Try to send an email with a blank subject → verify validation prevents submission
- Try to send to a list where ALL members have unsubscribed → verify "No active recipients" error
- Try to create a smart list manually (the UI should only allow manual list type for new lists — smart lists are system-created) → verify this is either not possible or clearly labelled
- Upload `test_contacts.csv` via the Import CSV button → verify: all 5 rows import, emails are matched to existing contacts where possible, duplicate emails are not double-imported, rows missing email are flagged as errors
- Upload a CSV with missing `consent_source` column → verify the import rejects the file with a clear error
- Rapidly click the Send button twice → verify only one `email_sends` row is created (double-submit prevention)
- After sending an email, attempt to delete the `email_sends` row via the API directly → verify that audit trail rows (`email_unsubscribes`) are never deleted

---

## Bug Report Format

All bugs found during this audit must be documented in the following format:

```
BUG-001
Module: [module name]
SOP: [SOP ID]
Severity: Critical / High / Medium / Low
Type: UI bug / API bug / SOP error / Missing feature / Security
Description: [One sentence: what is broken]
Reproduction steps:
  1. [step]
  2. [step]
  3. [step]
Expected: [what the SOP says should happen]
Actual: [what actually happened]
Suspected cause: [component name or route, if identifiable]
```

**Severity definitions:**
- **Critical**: Data loss, security breach, money sent incorrectly, emails sent to wrong address, Spam Act non-compliance
- **High**: Feature completely broken, user blocked from completing their work
- **Medium**: Feature partially broken or behaves unexpectedly but has a workaround
- **Low**: Cosmetic issue, wording error, or minor UX problem

---

## API Standards Violations — How to Flag

If a server endpoint violates the Hub's API standards, flag it as:

```
API-VIOLATION-001
File: [server route file]
Endpoint: [METHOD /path]
Violation: [one of the following]
  - Raw res.json() instead of ok()/err()
  - Snake_case response without rowToCamel()
  - No input validation before DB insert
  - Unhandled promise rejection (no try/catch)
  - Silent error swallowing (catch block with no error response)
  - Hardcoded values that should come from constants.js
```

---

## SOP Accuracy Issues — How to Flag

If a SOP describes something incorrectly (wrong path, wrong field name, missing step, describes unbuilt feature):

```
SOP-ISSUE-001
File: [sop file path]
Section: [section number and heading]
Issue type: Wrong UI path / Missing step / Describes unbuilt feature / Wrong field name / Outdated
Description: [what the SOP says vs what is actually true]
Action required: Update SOP / Build missing feature / Accept as known gap
```

---

## Performance Baselines

During testing, note the time for each of these operations. Flag anything exceeding the threshold:

| Operation | Threshold | Notes |
|-----------|-----------|-------|
| Initial page load (any module) | 3 seconds | Cold load, no cache |
| AI content generation (first token) | 5 seconds | SSE stream should start within this |
| AI schedule generation | 15 seconds | Full schedule may take longer; first response should appear within 15s |
| Invoice AI extraction | 30 seconds | PDF extraction can be slow; should show progress |
| Smart list member count | 2 seconds | Live query on every page load |
| Dashboard load (`GET /api/crm/dashboard`) | 2 seconds | Aggregates multiple tables |
| Relationship score recompute | 1 second | After interaction logging, score should update before drawer closes |
| Email send dispatch (Resend) | 5 seconds | From button click to "sent" confirmation |

---

## Audit Output Format

At the end of the audit, produce a document with these sections:

### 1. Executive Summary
- Total test cases run
- Total passed / failed / skipped
- Total bugs found (by severity)
- Total API violations
- Total SOP issues
- Modules that passed cleanly
- Modules with critical or high bugs that block production use

### 2. Bug Register
All bugs in BUG-NNN format, sorted by severity (Critical first)

### 3. API Standards Violations Register
All API-VIOLATION-NNN items

### 4. SOP Issues Register
All SOP-ISSUE-NNN items

### 5. Performance Log
Actual times recorded for each operation vs threshold

### 6. Skipped Tests
All SKIP items with reason (prerequisite missing, feature not yet built, environment variable not configured)

### 7. Recommendations
Any patterns observed across multiple bugs or modules that suggest a systemic issue (e.g. "validation is consistently missing on POST endpoints across Finance and CRM modules")

---

## Final Check Before Signing Off

Before the audit is considered complete, verify:

- [ ] `email_unsubscribes` rows are NEVER deleted — run `SELECT COUNT(*) FROM email_unsubscribes` before and after all tests; count should only increase
- [ ] No marketing email was sent to any address other than sam@blueleafbuilding.com.au during testing
- [ ] No real financial transactions were created (all progress claims, variation amounts, and budget entries used test data)
- [ ] All uploaded test files are removed from the system after testing (or clearly labelled as test data)
- [ ] The `test_status` field in all tested SOP frontmatter is updated from `untested` to either `passed` or `failed` based on results
- [ ] `SOP_CHANGELOG.md` is updated with today's date and a summary of what was tested
