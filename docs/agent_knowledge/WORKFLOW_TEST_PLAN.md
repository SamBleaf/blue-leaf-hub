# Blue Leaf Hub — Full Workflow Test Plan (lead → handover, 12-month simulation)

> Purpose: a single end-to-end test that drives the REAL app in Chrome and plays a compressed
> 12-month builder's year across every module, checking that (1) data lines up across the
> lead→job→project spine, (2) automations actually fire, (3) numbers reconcile, and (4) flags
> any APB step or SOP that has no home in the software (holes / missing modules).
> Grounded in: `WORKFLOW_MAP.md` (10 workflows), `SOP_INDEX.md` (106 SOPs / 19 modules),
> `MASTER_DATA_DICTIONARY.md` (spine + source-of-truth), Blueprint knowledge, PRODUCT_PRINCIPLES.

## Run configuration (decided with Sam)
- **Target:** LOCAL dev — frontend `http://localhost:5173`, API `http://localhost:8787`.
- **Driver:** Claude in Chrome, on a browser session Sam has logged into the test account.
- **Cadence:** background / long-running. Time taken does not matter; completeness does.
- **Outbound guardrail — CRITICAL:** Gmail, Resend, Dropbox and Buildexact are LIVE on local dev.
  Every recipient field (sub email, client email, portal invite, claim/variation email, mailing
  list) MUST be set to the **designated test inbox**. Never type a real sub/client address.
  Where a step would deliver to a real third party and a test address can't be substituted,
  fill the form, screenshot it, and STOP before the final send/submit (record as "verified-to-send").
- **Destructive actions:** no hard deletes, no permission/role changes, no settings changes,
  no integration disconnects. Read-and-create only; use void/archive instead of delete.
- **Migrations required for full coverage:** 072 (schedule task_type) + 073 (increment_send_stat)
  must be applied to the DEV Supabase before the run, or the schedule-generate and CRM-email-stat
  checks will be marked "blocked — migration not applied" rather than pass/fail.

## Identity & data-lineage checks (run at every handoff — the spine)
Verify continuity of these IDs/facts as the scenario moves between modules:
- `lead_id` → carried onto `jobs.lead_id` at conversion; reverse `leads.job_id` set.
- `jobs.id` ↔ `projects.job_id` (1:1); `projects.address` matches the job; address is
  NORMALISED once on the job and never re-typed elsewhere ("21 Folkestone Rd" == "...Road").
- `client_name`/`client_email`/`client_phone` carry lead → job → portal unchanged.
- `contract_value` == `original_contract_value` + Σ(signed `job_variations`) everywhere it shows
  (command-centre, WIPAA, portal). Unsigned variations NEVER move the number.
- `trade_category_id` consistent from budget → invoice tag → per-trade actual → cost intelligence.
- A document/quote/PO traces back to the right job + trade.
After each create/convert, confirm the new record actually exists and the downstream module
shows it (don't trust the success toast — read the next screen / record).

## Automations that MUST fire (verify each, don't assume)
- Win tender → project auto-created with portal_token; losing-sub outcome emails (to test inbox).
- Variation signed → `jobs.contract_value` recomputes; portal budget + command-centre both update.
- Invoice approved with trade tag → appears in per-trade budget-vs-actual; supplier auto-tag after
  3 confirmed invoices from same ABN.
- Timesheet approved (with overtime > double-time threshold) → labour lands in the right trade
  budget; double-time paid at 2×.
- Underclaim alert fires when build % vs claimed % diverge > ~10%; pre-populates a draft claim.
- WHS profile saved → `project_swms` populated → induction page shows the SWMS list.
- Progress claim issued → due date set, overdue reminders scheduled.
- CRM mailing-list send → `email_send_recipients` get Resend ids; webhook updates open/delivered
  counts (stats move off zero).
- Website enquiry → lead created with first/last-touch attribution captured.
- (Time-gated, note only) first-Friday WIPAA reminder targets won jobs.

## The 12-month compressed scenario (real-world narrative)
Play these as overlapping "waves" so the system holds multiple jobs at different stages at once —
this is how the holes show up (a busy builder is never doing one thing).

**Month 0–2 — Pipeline fills (Sales/CRM/Marketing)**
- Create ~6 leads across sources (website enquiry, referral, Instagram DM, phone) at different
  APB stages: enquiry, qualify, discovery, winning_offer.
- Run qualifying scorecards; use Blueprint Insight; paste a meeting transcript → analyse → apply
  suggestions. Confirm lead record updates.
- CRM: add contacts (incl. an architect referrer), log interactions, build a mailing list, send
  one campaign (to test inbox), confirm stats update.
- Marketing: generate a content piece (text + from a photo), approve it, create a campaign,
  record a social publish.

**Month 2–4 — Two leads progress to tender + fee proposal**
- Convert 2 leads to jobs (CHECK lead_id/address/client/estimated_value carry forward).
- Build/import an estimate; seed the budget from it; run a pre-tender cost estimate; view benchmarks.
- RFQ engine: create package → extract scopes → select sub recipients (test inbox) + ONE ad-hoc
  email-only recipient → send → record a returned quote → compare → accept.
- Fee proposal: parse estimate → edit wizard → generate DOCX → (verify-to-send) send to client.

**Month 4–5 — Win + project + operations start**
- Mark one tender Won → confirm project auto-created, portal_token exists, losing-sub emails.
- Issue POs to accepted subs (test inbox). Confirm PO PDF + Dropbox.
- Generate the schedule (AI). Review in Gantt/Sheet/Calendar/Dep Map. Lock baseline.
- WHS: add sub compliance docs, complete the WHS questionnaire/profile, set up induction QR,
  complete a public induction at `/induct/:projectId`, confirm SWMS list shows.

**Month 5–10 — Construction cycle (repeat monthly)**
- Site diary entries (incl. voice capture). Mark schedule tasks complete → observe ripple cascade;
  raise an EOT.
- Workforce: add employees, log timesheets across task categories incl. an overtime/double-time day,
  approve them; confirm labour cost + per-trade budget.
- Finance: receive/upload sub invoices → AI extract → match to job + trade → approve (and one hold,
  one reject). Confirm command-centre actuals + margin.
- Finance: raise progress claims by stage → (verify-to-send) send → record payment. Watch underclaim
  alert. Raise + sign a variation → confirm contract value + portal both update.
- WIPAA review: update forecast, save snapshot, confirm history.
- Portal: weekly updates + photos, a client decision, show a variation, update milestones, send a
  message. Open the portal as the client (token URL) and verify budget = finance truth.
- Cost intelligence: confirm accepted quotes + approved invoices + signed variations feed normalized
  costs / benchmarks.

**Month 10–12 — Completion + handover + raving fans**
- Drive schedule to practical completion; final claim; lock financials.
- Handover: warranty items/periods; site walk request.
- CRM: job → past_client; 3-month follow-up task; review-request path.
- Final reconciliation pass: for the completed job, every number agrees across command-centre,
  portal, cost intelligence, and the job record.

## APB / SOP gap hunt (the "holes & missing modules" objective)
While running, cross-check against APB modeling + each module's SOP (Section 14 test scripts).
Explicitly flag, with where-it-should-live:
- An APB stage/step with no screen or action in the app.
- A SOP step that can't be completed as written (button missing, field absent, dead end).
- A handoff where a human must re-type data the system already knows (enter-once violation).
- An automation the model implies but the app doesn't perform.
- Anything that goes stale when a fact changes (address, contract value, client, trade).

## Output — the report (generated at the end)
One in-depth markdown report saved to `docs/agent_knowledge/WORKFLOW_TEST_REPORT_<date>.md`:
1. **Executive summary** — did a full lead→handover complete? Top risks.
2. **Per-wave results** — what was done, screenshots/record ids, pass/fail per step.
3. **Data-lineage findings** — every spine/reconciliation check, with the actual values seen.
4. **Automation findings** — each automation: fired / didn't / partial, with evidence.
5. **APB & SOP gaps** — holes, missing steps/modules, enter-once violations, with severity +
   where each should live.
6. **Bug list** — concrete defects (screen, action, expected vs actual), severity-ranked.
7. **Suggestions** — prioritised improvements for us to review and plan together.

## Pre-flight checklist (before launch)
1. `npm run dev` running (✓ verified: API 8787 + frontend 5173 up).
2. Migrations 072 + 073 applied to the DEV Supabase (or accept the two "blocked" checks).
3. Designated **test inbox** address confirmed (used for ALL recipient fields).
4. Chrome connected to Claude (extension) and Sam logged into the test account at localhost:5173.
5. Go signal from Sam.
