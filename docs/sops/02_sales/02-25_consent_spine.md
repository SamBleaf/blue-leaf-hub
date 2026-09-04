---
sop_version: 1.0
last_reviewed: 2026-08-30
app_version: main
screenshot_status: placeholders_only
owner: Admin / Supervisor
test_status: untested
---

# SOP: Track planning & building consent in Won (the PlanSA consent spine)

**Module:** Sales
**SOP ID:** 02-25
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin and Supervisor staff who run a job from the **Consultants** stage through to **Won** and the start of construction. You do not need any technical or planning-law knowledge. This tool is a tracker: it records the reference numbers, statuses and dates for the three South Australian consents so the whole business can see, at a glance, exactly how far a job is from being legally allowed to build.

## 2. When to use it

Use it from the moment a job exists (the job is created when the **PTSA / Plans** stage is signed) right through to construction start. Two places show the same tracker:

- **Consultants stage** — a cut-down view (Planning Consent only). Use it to lodge and track **Planning Consent** early, before contract.
- **Won focus panel** — the full view (all three consents). Use it after the deal is won to lodge and track **Building Consent** and **Development Approval**, and to keep the reference numbers current until the final approval is granted.

Update it every time something changes at PlanSA — you lodge, an assessor moves it to "under assessment", or a consent is granted or refused.

## 3. What this does

South Australia has three consents, and they must be satisfied in this **statutory order**:

1. **Planning Consent** — land use / the Planning & Design Code. Lodged early (at the Consultants stage, pre-contract) because you already have the architect's minimum drawings.
2. **Building Consent** — the Building Rules / NCC. Lodged in Won, **after design-lock**, by either a **private certifier** or the **council**.
3. **Development Approval** — the **final authorisation**. **No build may start until this is granted.** A private certifier can grant Building Consent **only** — Development Approval is the separate, final step.

**Important:** PlanSA has **no lodgement API**. The Hub does **not** talk to PlanSA. This is a **track-and-prompt** tool — you lodge and track inside the PlanSA portal, and you record the numbers, statuses and dates here so the rest of the Hub (Operations, Finance, the client portal) can read them. The tracker gives you deep-links straight into PlanSA, a place to store the DAP application number, and a **Building Consent pack** checklist so nothing is missing before you lodge.

It also watches for one expensive trap (the **variation warning**): if a consultant document that fed the Building Consent is later flagged for re-issue **after** Building Consent has already been granted, the approved design no longer matches — so a **PlanSA variation** (extra fee + delay) is required before you build on the changed design.

## 4. Before you start

- The lead has a **linked job**. The job is created when the **PTSA / Plans** stage is signed. If there is no job yet, the tracker shows "Consent tracking starts once the job is created (at PTSA signing)" and no fields appear — finish the PTSA / Plans step first (SOP 02-20).
- You are **signed in** as Admin or Supervisor. (Portal clients can never see this data — the table is staff-only.)
- You have a PlanSA account and access to lodge / track applications in the PlanSA portal.
- For **Building Consent**: design-lock and tender are settled, and the **Building Consent pack** documents (working drawings, structural + engineer's certificate, soil report, NatHERS certificate, siting plan, specifications) are in hand.

## 5. Step-by-step process

### A. Lodge Planning Consent (Consultants stage, pre-contract)

1. Open the lead and go to the **Consultants** stage. Scroll to the **"Planning consent (PlanSA)"** panel.
2. Read the prompt: *"Lodge Planning Consent now (pre-contract) — you have the architect's minimums. Building Consent + Development Approval are lodged later, in Won."*
3. Click the deep-link **"PlanSA — lodge / track (DAP) ↗"** to open the PlanSA portal in a new tab and lodge the application there.
4. Back in the Hub, type the PlanSA application / ID number into **DAP application #**.
5. In the **"1 · Planning Consent"** block, set the **status** pill (Not started → Lodged → Under assessment → Granted / Refused), enter the **Consent reference #**, and pick the **lodged date**.
   [insert screenshot: Consultants stage — Planning consent panel with status pill, reference and date]

### B. Prepare the Building Consent pack (Won)

6. Win the lead so the **Won** focus panel appears (SOP 02-23). Scroll to **"Planning & building consent (PlanSA)"**.
7. Work through the **Building Consent pack** checklist and tick each document as it is ready. The counter (e.g. **4/6**) turns green only when all six are ticked. Do not lodge Building Consent until this reads complete.
   [insert screenshot: Won panel — Building Consent pack checklist]

### C. Lodge Building Consent (Won, after design-lock)

8. In the **"2 · Building Consent"** block, open the **"— who grants it —"** dropdown and choose **Private certifier** or **Council**.
9. Lodge in PlanSA (use the deep-links), then set the **status** pill, enter the **Consent reference #**, and pick the **lodged date**.
10. Heed the amber note: *"Lodge only once design-lock + tender are settled — a later Building-Rules change forces a PlanSA variation (fee + delay)."*
    [insert screenshot: Won panel — Building Consent block with route dropdown]

### D. Record Development Approval (the final gate)

11. In the **"3 · Development Approval"** block (marked **"no build until granted"** in red), set the **status** pill, enter the **DA number**, and pick the **date**.
12. **Do not release the job to site** until this status reads **Granted**. This is the legal go / no-go.
    [insert screenshot: Won panel — Development Approval block]

### E. Keep it current

13. Every time PlanSA moves the application, update the matching **status** pill. Use the **Consent notes** box at the bottom for anything worth remembering (assessor name, RFI dates, conditions).
14. If the **"⚠ PlanSA variation required"** banner appears, follow Section 12 before building on the changed design.

Every field saves the moment you change it — status pills and dates save on selection, reference numbers and notes save when you click away from the box. There is no separate "Save" button.

## 6. What happens next

- The three statuses, reference numbers, dates, the DAP number and the checklist are stored on the **job** (one shared record), so Operations, Finance and the portal all read the same truth.
- Operations uses **Development Approval = Granted** as the signal that the job is legally clear to start on site.
- The **Council / certifier approval risk** chip (just below the tracker in Won) is a separate, advisory flag — it does not block anything, but a **High** rating prompts you to manage the client's timeline expectations.
- If a consultant document is re-issued after Building Consent is granted, the variation warning surfaces automatically the next time the Won panel loads.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Trying to track consent before the job exists | The tracker is job-level; no job means no fields | Sign the PTSA / Plans stage first (SOP 02-20) so the job is created |
| Expecting the Hub to lodge with PlanSA | It looks like an integration | PlanSA has no API — you lodge in the portal via the deep-links; the Hub only records the numbers |
| Lodging Building Consent before design-lock | Eagerness to progress | Wait until design-lock + tender are settled — a later change forces a paid PlanSA variation |
| Treating a private certifier's Building Consent as the final approval | Assuming one approval covers everything | Development Approval is the separate final gate — no build until it is granted |
| Ticking the Building Consent pack to hide the amber counter | Wanting a green badge | Only tick a document when it genuinely exists — the checklist is the pre-lodgement gate |
| Ignoring the "PlanSA variation required" banner | It appears after a consent was already granted | Lodge the variation (fee + delay) before building on the changed design |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Consent tracking starts once the job is created (at PTSA signing)" and no fields | The lead has no linked job yet | Complete the PTSA / Plans stage (SOP 02-20) so the job is created, then reopen |
| A field reverts / does not stick after typing | The save round-trip failed (e.g. a migration not applied) | Confirm migration **196** is applied; the value visibly reverts on failure — retry after applying |
| Error "Create the job first (at PTSA signing) — consent tracking is job-level." | You (or a script) tried to save consent for a lead with no job | Create the job first; consent is stored per job, not per lead |
| Building Consent + Development Approval blocks are missing | You are in the **Consultants** stage (planning-only view) | Those two blocks only appear in the **Won** full view — win the lead |
| Deep-links do nothing | Pop-up blocker | Allow pop-ups for the Hub, or right-click the link and open in a new tab |
| Portal client says they cannot see consent status | The table is staff-only by design | This is correct behaviour — consent data is never exposed to portal clients |

## 9. Related modules

- [02-20 Run the PTSA / Plans stage](02-20_ptsa_plans_stage.md) — creates the job the consent tracker keys to.
- [02-21 Run the Consultants stage](02-21_consultants_stage.md) — where Planning Consent is lodged and the approval-risk chip is first set.
- [02-19 Run the Concept stage](02-19_concept_stage.md) — design-lock, which gates when Building Consent may be lodged.
- [02-23 Complete a Won lead and hand off to Operations](02-23_won_ops_handoff.md) — the Won panel that hosts the full consent spine.

## 10. Screenshot placeholders

- [insert screenshot: Consultants stage — Planning consent panel (planning-only view) with deep-links + DAP application # field]
- [insert screenshot: Won panel — full "Planning & building consent (PlanSA)" tracker, all three blocks]
- [insert screenshot: Building Consent block — "who grants it" dropdown open showing Private certifier / Council]
- [insert screenshot: Development Approval block — "no build until granted" label]
- [insert screenshot: Building Consent pack checklist — 4/6 amber counter]
- [insert screenshot: "⚠ PlanSA variation required" red warning banner]
- [insert screenshot: Council / certifier approval risk chip set to High with the red note]

## 11. Automation notes

- **No outbound emails, files or external calls.** This feature never contacts PlanSA and never sends email. It is a manual tracker with deep-links only.
- **Read:** `GET /api/sales/leads/:id/consent` resolves the lead's `job_id`, then reads the matching `job_consents` row. If the lead has no `job_id` it returns `{ consent: null, noJob: true }` and the panel shows the "starts once the job is created" message.
- **Write:** `PUT /api/sales/leads/:id/consent` resolves `job_id` and **upserts** the `public.job_consents` row (one row per job, `onConflict: job_id`). Every save stamps `updated_at`. If the lead has no `job_id` it returns HTTP **409** with "Create the job first (at PTSA signing) — consent tracking is job-level." No status-change side-effects fire — nothing here moves the lead's stage.
- **Record created / updated:** table `public.job_consents` (migration 196), keyed by `job_id` (unique). Columns written: `planning_consent_status`, `planning_consent_ref`, `planning_consent_lodged_at`, `building_consent_route`, `building_consent_status`, `building_consent_ref`, `building_consent_lodged_at`, `development_approval_status`, `development_approval_number`, `development_approval_at`, `dap_application_number`, `prelodgement_checklist` (jsonb), `consent_notes`.
- **Status values** (`planning_consent_status`, `building_consent_status`, `development_approval_status`): `not_started` | `lodged` | `under_assessment` | `granted` | `refused`. **Route** (`building_consent_route`): `private_certifier` | `council`.
- **Approval-risk chip:** the "Council / certifier approval risk" chip is a **separate** control. It writes `approval_risk` (`unknown` | `low` | `medium` | `high`) to the **`leads`** table via `PATCH /api/sales/leads/:id`. It is advisory and never blocks a stage move.
- **Variation warning:** computed live in the browser (no record written). It shows only in the Won view when `job_consents.building_consent_status` = `granted` **and** the lead's `consultant_roster` contains a deliverable flagged `reissue` that feeds consent.
- **Security:** `job_consents` ships RLS-locked — a permissive `auth_users` policy plus a **restrictive `deny_clients`** policy — so a portal client's token resolves to zero rows. The API endpoints require an authenticated staff session (`requireAuth`).

## 12. Edge cases and limits

- **One record per job.** Re-editing any field updates the same `job_consents` row; it never creates a second row.
- **No consent field is mandatory** at the form level — you can save any field on its own. The only hard requirement is that the **job exists** (otherwise the 409 fires).
- **Planning-only view.** In the Consultants stage the tracker hides the Building Consent and Development Approval blocks and never shows the variation warning; the DAP number field, deep-links and Building Consent pack checklist still appear. The full three-consent view is Won-only.
- **Private certifier ≠ Development Approval.** Choosing "Private certifier" as the Building Consent route grants Building Consent only. Development Approval is still tracked as its own status and remains the build gate.
- **Variation warning is advisory.** It never blocks a save or a stage move — it is a prompt to lodge a PlanSA variation before building on a changed design.
- **Refused status** is recordable but has no automated consequence — handle a refusal manually with the consultant team and PlanSA.
- **Dates** are plain calendar dates (no time). Clearing a date or reference field saves it as empty (null).

## 13. Owner of the process

**Owner:** Admin / Supervisor (Sales pipeline operators).
**Escalation:** the private certifier or the relevant council for consent questions; the design / consultant lead for document re-issues that trigger a variation.
**Next review date:** 2027-02-28 (6 months from last review, 2026-08-30).

## 14. Troubleshoot Agent Test Script

**Pre-test setup**

1. Confirm migration **196** is applied (table `public.job_consents` exists with the columns listed in Section 11). If a column reads as missing after applying, run `NOTIFY pgrst, 'reload schema';`.
2. Create or reset a **test lead** (see SOP 02-13) that has a **linked job** (`leads.job_id` is set — created at PTSA signing). Note its `lead_id` and `job_id`.
3. Move the test lead to the **Won** stage so the full consent tracker renders.
4. Sign in as a normal staff user (Admin or Supervisor) for TC-01, TC-02, TC-03, TC-05, TC-06, TC-07; have a **signed-out** session available for TC-04.
5. For TC-05, be ready to set the test lead's `consultant_roster` to include a consent-feeding deliverable flagged for re-issue (e.g. a `engineer` roster entry with a deliverable `{ key: "structural_drawings", reissue: true }`).

---

**TC-01 — Happy path: record all three consents**

Steps:
1. Open the test lead at the **Won** stage and scroll to **"Planning & building consent (PlanSA)"**.
2. Type `24012345` into **DAP application #**.
3. In **1 · Planning Consent**: set status to **Lodged**, enter reference `PL-001`, set the lodged date to today.
4. In **2 · Building Consent**: choose route **Private certifier**, set status to **Under assessment**, enter reference `BC-002`, set the lodged date to today.
5. In **3 · Development Approval**: set status to **Granted**, enter DA number `DA-003`, set the date to today.
6. Tick all six **Building Consent pack** items (counter turns green **6/6**).
7. Type `Assessor: J. Smith` into **Consent notes** and click away.

Expected UI result: every control saves instantly with no page reload; status pills recolour; the pack counter reads **6/6** in green.

Expected DB record: one row in `public.job_consents` where `job_id` = the test job's id, with `planning_consent_status` = `lodged`, `planning_consent_ref` = `PL-001`, `planning_consent_lodged_at` = today's date; `building_consent_route` = `private_certifier`, `building_consent_status` = `under_assessment`, `building_consent_ref` = `BC-002`, `building_consent_lodged_at` = today; `development_approval_status` = `granted`, `development_approval_number` = `DA-003`, `development_approval_at` = today; `dap_application_number` = `24012345`; `prelodgement_checklist` (jsonb) = `{"working_drawings":true,"structural":true,"soil":true,"nathers":true,"siting":true,"specifications":true}`; `consent_notes` = `Assessor: J. Smith`; `updated_at` refreshed.

- [ ] Pass  [ ] Fail

---

**TC-02 — Missing required precondition: no linked job blocks the save**

Steps:
1. Take (or create) a test lead with **no** `job_id` (do not run PTSA signing on it).
2. Open its lead detail and view the consent panel.
3. Attempt to save any consent field — call `PUT /api/sales/leads/:id/consent` with body `{ "planning_consent_status": "lodged" }` for that lead.

Expected UI result: the panel shows the card **"Planning & building consent"** with the message *"Consent tracking starts once the job is created (at PTSA signing)."* and **no editable fields**.

Expected DB record: the `PUT` returns HTTP **409** with error "Create the job first (at PTSA signing) — consent tracking is job-level."; **no** row is inserted into `public.job_consents` for this lead. (Note: once a job exists, no individual consent field is required — this test confirms the one hard precondition, the job.)

- [ ] Pass  [ ] Fail

---

**TC-03 — Duplicate submission: repeated saves update one row, never insert a second**

Steps:
1. On the TC-01 test lead (which has a `job_consents` row), set **Planning Consent** status to **Lodged**, then **Granted**, then back to **Lodged** in quick succession.
2. Tick the **"Architectural working drawings"** pack item on, off, then on again.
3. Re-issue the same `PUT /api/sales/leads/:id/consent` twice with an identical body `{ "building_consent_status": "granted" }`.

Expected UI result: each control reflects its final state with no error; no duplicate panels appear.

Expected DB record: exactly **one** row in `public.job_consents` for this `job_id` (the `job_id` UNIQUE constraint + `onConflict: job_id` upsert guarantee this); `planning_consent_status` = `lodged` (final value); `prelodgement_checklist.working_drawings` = `true` (final value); `building_consent_status` = `granted`.

- [ ] Pass  [ ] Fail

---

**TC-04 — No auth: request is rejected**

Steps:
1. Sign out (or use a session with no valid token).
2. Attempt `GET /api/sales/leads/:id/consent` and `PUT /api/sales/leads/:id/consent` (body `{ "building_consent_status": "granted" }`) for the test lead.

Expected UI result: the consent tracker is unreachable without signing in.

Expected DB record: both requests are rejected by the authentication guard (`requireAuth`); no row in `public.job_consents` is created or changed. (Additionally, the table's restrictive `deny_clients` RLS policy means a portal client's token resolves to zero `job_consents` rows even if it reached the database.)

- [ ] Pass  [ ] Fail

---

**TC-05 — Feature edge case: PlanSA variation warning fires**

Steps:
1. On the Won test lead, set **Building Consent** status to **Granted**.
2. Set the lead's `consultant_roster` (on the `leads` row) to include an entry whose `role` = `engineer` with a deliverable `{ "key": "structural_drawings", "reissue": true }` (structural drawings feed the Building Consent, so this is a consent-feeding document flagged for re-issue).
3. Reload the Won panel.

Expected UI result: a red banner **"⚠ PlanSA variation required"** appears above the Building Consent block, with the text explaining the approved design no longer matches and a variation (fee + delay) is needed before building.

Expected DB record: no new record — the warning is computed in the browser from `job_consents.building_consent_status` = `granted` **and** `leads.consultant_roster` containing a consent-feeding deliverable with `reissue` = `true`. Setting `building_consent_status` to anything other than `granted`, or clearing the `reissue` flag, removes the banner.

- [ ] Pass  [ ] Fail

---

**TC-06 — Feature edge case: planning-only scope in the Consultants stage**

Steps:
1. Move (or use a second) test lead with a linked job to the **Consultants** stage.
2. Open the **"Planning consent (PlanSA)"** panel there.
3. Compare it against the Won view.

Expected UI result: the Consultants panel shows the deep-links, the **DAP application #** field, the **1 · Planning Consent** block and the **Building Consent pack** checklist — but **not** the Building Consent block, **not** the Development Approval block, and **never** the variation warning. The heading reads **"Planning consent (PlanSA)"** (not "Planning & building consent"), and the intro line about lodging Planning Consent pre-contract is shown.

Expected DB record: saving Planning Consent fields here writes to the **same** `public.job_consents` row for the job (identical storage to the Won view) — e.g. setting the status writes `planning_consent_status`.

- [ ] Pass  [ ] Fail

---

**TC-07 — Feature edge case: approval-risk chip is advisory and writes to the lead**

Steps:
1. On the Won test lead, find the **"Council / certifier approval risk"** chip below the consent tracker.
2. Click **High**.
3. Observe the panel and attempt no stage move.

Expected UI result: the chip highlights **High**, the badge recolours red, and the note *"High approval risk — flag it in the proposal and manage the client's expectations on the approval timeline."* appears. Nothing is blocked.

Expected DB record: `leads.approval_risk` = `high` for this lead (written via `PATCH /api/sales/leads/:id`, **not** to `job_consents`). Selecting **Low** / **Medium** / **Unknown** writes the matching value; none of them alter any `job_consents` field or the lead's `stage`.

- [ ] Pass  [ ] Fail