---
sop_version: 1.0
last_reviewed: 2026-08-30
app_version: main
screenshot_status: placeholders_only
owner: Admin / Supervisor
test_status: untested
---

# SOP: Run the Consultants stage — roster, deliverables & dependency schedule

**Module:** Sales
**SOP ID:** 02-24
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin and Supervisor staff running a lead through the **Consultants** stage of the Sales pipeline — the stage between **PTSA / Plans** and **Tender**.

This is where you build the **roster** of outside design professionals (architect/designer, land surveyor, soil/geotech, structural engineer, NatHERS energy, interior designer, lighting, sanitary), track every **deliverable** each one owes through to "received" or "issued", lodge **Planning Consent** with PlanSA, issue the **provisional fittings & fixtures schedule** to suppliers, and book the **proposal presentation** before the job goes to Tender.

Any signed-in Sales user can open the lead and drive this panel — you do not need to be a director. (Creating the throwaway *test* lead used to rehearse the stage does need an admin — see Section 14.)

> **Not here:** the **private certifier** is not a roster role — certification is lodged later, in **Won**, after design-lock. Likewise **Building Consent** and **Development Approval** are tracked in Won. Only **Planning Consent** is lodged here.

---

## 2. When to use it

Use this SOP when a lead has reached the **Consultants** stage (the stage label reads "Consultants" on the stepper) and you need to:

- Add each design professional to the roster and attach their CRM contact.
- Chase and record each expected document as it moves pending → requested → received → issued.
- Read the advisory "waiting on" prompts so you request documents in the right order.
- Flag a changed upstream document so downstream documents get re-checked.
- Lodge **Planning Consent** in the PlanSA portal (pre-contract) and tick off the Building Consent pack as it fills.
- Issue the provisional F&F schedule to suppliers.
- Book the proposal presentation.
- Confirm the four "Ready for tender" signals before advancing the lead to **Tender**.

If the lead is still earlier in the pipeline (Discovery, Concept, PTSA / Plans), finish that stage first — see the Related modules list in Section 9.

---

## 3. What this does

The Consultants panel is a single control screen with five blocks:

1. **Consultants & deliverables** — the roster. Add a consultant, pick their **role** and a **CRM contact**, and the Hub auto-seeds the documents that role owes. Each document has a **status pill** you click to advance it and a **routing badge** showing where the finished document goes (Consent pack, Proposal, or both).
2. **Planning consent (PlanSA)** — the Planning Consent tracker. Appears once a **job** exists for the lead (created at PTSA signing). Records the consent status, reference, lodged date, PlanSA application number, and a Building Consent pack checklist.
3. **Provisional fittings & fixtures schedule** — a simple table of finishes carried forward from Concept, plus an "issued to suppliers" checkbox.
4. **Ready for tender** — a read-only checklist that lights up as the exit conditions are met.
5. **Proposal presentation** — the meeting scheduler for the client's proposal presentation.

Everything you type saves straight to the lead as you go (no separate "Save" button). The roster lives in the lead record; the consent facts live against the job.

---

## 4. Before you start

You need:

- A lead that is **in the Consultants stage**. (You can also open the panel by clicking the "Consultants" step on the stepper.)
- The **CRM contacts** for the consultants you will add. If an engineer, surveyor or supplier is not in the CRM yet, add them first (Settings → CRM) — the contact picker only lists contacts whose type is architect, designer, interior designer, engineer, supplier or other. If the picker is empty you will see "No consultant contacts yet — add engineers/suppliers in the CRM."
- For **Planning Consent**: the lead must already have a **job** (created automatically at PTSA signing). Until then the consent block shows "Consent tracking starts once the job is created (at PTSA signing)."
- A **PlanSA login** to actually lodge the application (the Hub deep-links out to PlanSA — there is no lodgement API).
- The **Fixed-Price proposal** should be generated in the proposal workflow before you try to advance to Tender (it is one of the four exit signals).

---

## 5. Step-by-step process

### A. Build the consultant roster

1. In the **Consultants & deliverables** card, click **+ Add consultant**. A new row appears defaulted to the **Architect / Designer** role.
2. Set the **role** in the left dropdown (Architect / Designer, Land surveyor, Soil / Geotech, Structural engineer, NatHERS / energy, Interior designer, Lighting, Sanitary / tapware, Other consultant). Changing the role re-seeds that row's document list.
3. Pick the **CRM contact** in the right dropdown ("— select contact —" → the person/company).
4. Note the badge to the right: **Client-facing** (architect, interior designer, lighting, sanitary — these talk to the client through the Hub) or **Internal** (everyone else — Blue Leaf ↔ consultant only).
5. Repeat **+ Add consultant** for every professional on the job. To remove a row, click the small **×** on its right.

### B. Work the deliverables

6. Each consultant row lists its seeded documents. Every document has a **status pill** on the left — click it to advance the status: **Pending → Requested → Received → Issued**. (One more click after "Issued" wraps back to "Pending" — see Section 12.)
7. Read the **routing badge** next to each document: **→ Consent** (feeds the Building Consent pack), **→ Proposal** (feeds the Fixed-Price proposal), or **→ Consent + Proposal** (both). Blank means internal-only (for example the surveyor's set-out).
8. Watch the amber **⏳ waiting: …** note. It means this document depends on an upstream document that is on the roster but not yet Received/Issued (for example structural drawings wait on the soil report, feature survey and working drawings). This is **advisory** — it never blocks you. Request the upstream document first where you can.
9. Use the row toggles as you go: **○ Brief issued → ✓ Brief issued** when you send the consultant their brief, and **○ All returned → ✓ All returned** when everything is back. Add a free-text **Note** if useful.
10. Watch the summary line at the top of the card: **"N deliverables · N done · N waiting · N re-issue"**.

### C. Handle a changed document (re-issue)

11. If an already Received/Issued document changes (for example the footing class or glazing is revised), click the **changed?** link on that document. Every downstream document that was already done is flagged **⟳ re-issue required**, so nobody presents stale information.
12. When a flagged document has been re-done, click its status pill to advance it — that clears its own **re-issue** flag.

### D. Lodge Planning Consent (PlanSA)

13. Scroll to **Planning consent (PlanSA)**. (If it says "Consent tracking starts once the job is created", the job doesn't exist yet — the lead must have been PTSA-signed. Stop and resolve that first.)
14. Use the **PlanSA deep-link buttons** (lodge / track, Development Application Register, SAPPA) to lodge in the portal — Blue Leaf has the architect's minimums at this point.
15. Back in the Hub, set the **1 · Planning Consent** status pill (Not started → Lodged → Under assessment → Granted / Refused), fill the **Consent reference #**, the **lodged date**, and the **DAP application #**.
16. Tick items in the **Building Consent pack** checklist as each pre-lodgement document lands (working drawings, structural + engineer's certificate, soil report, NatHERS, siting plan, specifications). This is the pack you will lodge later in Won — it does not need to be complete to leave the Consultants stage.
17. Building Consent and Development Approval sections are intentionally **not shown here** — they are lodged in Won, after design-lock.

### E. Issue the provisional F&F schedule

18. In **Provisional fittings & fixtures schedule**, click **+ Add row** and fill **Area / Item / Supplier** (and any note) for each provisional finish carried from Concept.
19. Once you have issued the schedule to suppliers, tick **"Provisional F&F schedule issued to suppliers."** This is one of the four exit signals.

### F. Book the proposal presentation

20. In the **Proposal presentation** block, send the client a self-book link or book on their behalf. (Follow SOP 02-18 for the meeting mechanics.)

### G. Confirm "Ready for tender", then advance

21. Check the **Ready for tender** card. It ticks green when:
    - **Full consultant document set received / issued** (every document on every roster row is Received or Issued),
    - **Fixed-Price proposal generated**.
    - ("Final presentation booked" is shown as a manual reminder, not an automatic tick.)
22. When those are green, the provisional F&F is issued, the **site address** is set, and a **job** exists, advance the lead to **Tender** using the stepper / stage control (SOP 02-02).

[insert screenshot: Consultants stage — full panel with a two-consultant roster and the summary counts line]

---

## 6. What happens next

- Advancing to **Tender** carries the completed consultant documents, the issued provisional F&F and the generated proposal forward. The Tender stage opens its own sub-status strip (SOP 02-22).
- The **exit gate to Tender is advisory** — the Hub will still let you advance with a signal missing, but it records a "Gate bypass — missing: …" note on the lead's activity timeline and returns the list of missing items. Treat a bypass as a deliberate, logged exception, not the norm.
- **Planning Consent** you set here stays on the job and is visible in Won. In Won, if a consent-feeding document is later flagged "re-issue" *after* Building Consent has been granted, Won shows a **PlanSA variation required** warning — which is exactly why you handle changes with the **changed?** link rather than silently overwriting.
- The **proposal presentation** meeting appears in the Sales agenda and on the lead.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Adding the **private certifier** as a roster role | It feels like a "consultant" | The certifier is **not** a role here — certification is lodged in **Won**. Roster roles stop at the design/engineering disciplines. |
| Over-clicking a status pill past **Issued** back to **Pending** | The pill cycles round | Click carefully — one click = one step; after "Issued" the next click wraps to "Pending". Fix by clicking round again to the correct status. |
| Treating **⏳ waiting** as a block | It is coloured like a warning | It is **advisory only**. It just suggests an order — you can request documents in any order. |
| Expecting the **Planning consent** block to appear with no job | Consent is job-level, not lead-level | The lead must be **PTSA-signed** so a job exists. If you see "Consent tracking starts once the job is created", finish PTSA first. |
| Picking a consultant contact and finding the list empty | The contact type isn't one the picker loads | Add the person in the CRM with a type of architect / designer / interior designer / engineer / supplier / other. |
| Forgetting to tick **"Provisional F&F issued to suppliers"** | It's a small checkbox below the table | It is one of the four Tender exit signals — the "Ready for tender" gate stays incomplete without it. |
| Editing a changed document without pressing **changed?** | The button is easy to miss | Always press **changed?** on a revised Received/Issued document so downstream docs get the ⟳ re-issue flag. |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| Contact dropdown is empty ("No consultant contacts yet…") | No CRM contacts of an eligible type | Add engineers/surveyors/suppliers in the CRM (type architect/designer/interior_designer/engineer/supplier/other), then reopen the panel. |
| "Consent tracking starts once the job is created (at PTSA signing)." | The lead has no `job_id` yet | Complete PTSA signing so the job is created; the Planning consent block then appears. |
| Status pill won't stick / snaps back | The lead save failed (often an unapplied migration) — the panel rolls the change back so it never *looks* saved | Confirm migration 193 is applied; check the browser console for a "[lead patch] save failed" warning; retry. |
| A document shows **⏳ waiting** forever | The upstream document is on the roster but never advanced to Received/Issued | Advance the upstream document's status pill; the waiting note clears once it reads Received or Issued. |
| Advanced to Tender but a warning listed missing items | The advisory Tender gate flagged a missing exit signal | This is expected and logged as a gate bypass; go back, complete the missing signal (docs / proposal / F&F / site address / job), and it clears. |
| "Ready for tender" never fully ticks | One roster row still has a Pending/Requested document, or no Fixed-Price proposal exists | Advance every document to Received/Issued and generate the proposal. |
| **⟳ re-issue required** won't clear | The flagged document hasn't been re-advanced | Click the flagged document's status pill to advance it — that clears its own re-issue flag. |

---

## 9. Related modules

- **SOP 02-02 — Move a lead through the stages** (advancing Consultants → Tender)
- **SOP 02-20 — Run the PTSA / Plans stage** (the stage before this; creates the job)
- **SOP 02-22 — Run the Tender stage** (the stage after this)
- **SOP 02-18 — Pipeline meeting scheduling** (booking the proposal presentation)
- **SOP 02-19 — Run the Concept stage** (source of the provisional F&F finishes)
- **SOP 02-21 — Consultants stage (coordination, approval risk, provisional F&F)** (the earlier, broader Consultants SOP)
- **SOP 02-23 — Won & Ops handoff** (where certification, Building Consent and Development Approval are lodged)

---

## 10. Screenshot placeholders

- [insert screenshot: Consultants & deliverables card — empty state with "+ Add consultant"]
- [insert screenshot: one roster row — role dropdown, contact dropdown, Client-facing / Internal badge]
- [insert screenshot: a deliverable list showing status pills, → Consent / → Proposal routing badges, and a ⏳ waiting note]
- [insert screenshot: a document flagged ⟳ re-issue required after pressing "changed?"]
- [insert screenshot: summary counts line "N deliverables · N done · N waiting · N re-issue"]
- [insert screenshot: Planning consent (PlanSA) block — status pill, reference, DAP #, Building Consent pack checklist, PlanSA deep-links]
- [insert screenshot: Provisional fittings & fixtures schedule with the "issued to suppliers" checkbox ticked]
- [insert screenshot: Ready for tender card with the two auto-ticked signals green]

---

## 11. Automation notes

Every automated action in this stage:

- **Add consultant / change role** — writes `leads.consultant_roster` (jsonb) via `PATCH /api/sales/leads/:id`. Each roster element is `{ role, contactId, briefIssuedAt, returnedAt, notes, deliverables:[{ key, status, reissue }] }`. Adding a row (or changing its role) **auto-seeds** that role's `deliverables` from `CONSULTANT_DELIVERABLES`, each starting at `status:"pending"`.
- **Advance a document** — updates the matching element in `deliverables[]` to the next `status` (`pending`→`requested`→`received`→`issued`, wrapping) and sets `reissue:false` on that document. Saved to `leads.consultant_roster`.
- **"changed?" (re-issue)** — sets `reissue:true` on every *downstream, already-done* document (transitive over `DELIVERABLE_DEPENDENCIES`). Saved to `leads.consultant_roster`. No email.
- **Brief issued / All returned toggles** — writes an ISO timestamp (or null) to `briefIssuedAt` / `returnedAt` on the roster element.
- **Provisional F&F rows** — writes `leads.selections_schedule` (jsonb array of `{ area, item, supplier, notes }`).
- **"Provisional F&F issued to suppliers" checkbox** — writes boolean `leads.provisional_ff_issued`.
- **Planning consent fields** — written to the `job_consents` row for the lead's job via `PUT /api/sales/leads/:id/consent` (upsert on `job_id`): `planning_consent_status`, `planning_consent_ref`, `planning_consent_lodged_at`, `dap_application_number`, `prelodgement_checklist` (jsonb), `consent_notes`. Read via `GET /api/sales/leads/:id/consent`.
- **Consultant contact list** — read-only `GET /api/sales/consultants` returns `crm_contacts` whose `contact_type` is architect/designer/interior_designer/engineer/supplier/other.
- **Proposal presentation** — booked through the meeting scheduler (`meetingType:"proposal_presentation"`); creates/updates a `lead_meetings` record (see SOP 02-18).
- **Stage change to Tender** — `PATCH /api/sales/leads/:id` sets `stage:"tender"` and `stage_entered_at`; evaluates the advisory Tender gate; if any signal is missing it returns `gateWarnings` and inserts a `lead_activities` row (`activity_type:"stage_change"`, `detail:"Gate bypass — missing: …"`). It never hard-blocks the move.
- **No outbound client emails** are sent automatically by this stage. PlanSA lodgement is manual (deep-link only — no API).

---

## 12. Edge cases and limits

- **Status pill wraps.** The pill cycles `pending → requested → received → issued → pending`. There is no "back" button — over-click and you click round again.
- **Waiting is never a block.** A `⏳ waiting` note is advisory. It only shows when the upstream document is *also on the roster* and not yet Received/Issued, and only on documents that aren't done themselves.
- **Re-issue is transitive but only touches done docs.** "changed?" flags downstream documents that were already Received/Issued; documents still Pending/Requested are left alone (they'll be produced fresh anyway).
- **"Other consultant" seeds no documents.** The `other` role has an empty deliverable template — track its work in the Notes field.
- **Planning consent needs a job.** With no `job_id`, the consent block is a placeholder only; nothing can be saved there.
- **Only Planning Consent lives here.** Building Consent and Development Approval sections are hidden in the Consultants (`scope="planning"`) view — they appear in Won.
- **The Tender gate is advisory.** Missing exit signals warn and log, they don't stop the advance. **Test leads** (`leads.is_test = true`) bypass hard gates entirely across all stages.
- **Roster keys are camelCase inside the jsonb** (`contactId`, `briefIssuedAt`, `returnedAt`) — this is stored exactly as the panel writes it, not snake_case.
- **"Final presentation booked" doesn't auto-tick.** It is a manual reminder line on the Ready-for-tender card, not a computed check.

---

## 13. Owner of the process

**Owner:** Admin / Supervisor (Sales)
**Next review date:** 2027-02-28 (6 months from `last_reviewed` 2026-08-30)

The owner keeps this SOP aligned with `ConsultantsStage.jsx`, `ConsentSpine.jsx` (`scope="planning"`), the consultant constants in `src/lib/constants.js`, and the Tender stage gate in `server/lib/salesRoutes.mjs`.

---

## 14. Troubleshoot Agent Test Script

**Pre-test setup**

- Sign in as an **admin** Sales user.
- Create a throwaway **test lead**: `POST /api/sales/test-lead` (admin-only). This creates a lead with `is_test = true` at the `enquiry` stage. (Test leads bounce freely across stages with hard gates bypassed; advisory warnings still surface.)
- Move the test lead to the **Consultants** stage (stepper, or `PATCH /api/sales/leads/:id` with `{ "stage": "consultants" }`).
- Ensure at least one eligible **CRM contact** exists (`contact_type` in architect/designer/interior_designer/engineer/supplier/other); if `GET /api/sales/consultants` returns an empty `consultants` array, add one first.
- Confirm **migration 193** is applied (columns `consultant_roster`, `provisional_ff_issued` on `leads`).
- Open the test lead's detail page; the Consultants panel should render.
- After tests, delete/reset the test lead (`POST /api/sales/leads/:id/test-reset`, admin-only).

---

**TC-01 — Happy path: add a consultant, advance a deliverable**

Steps:
1. In **Consultants & deliverables**, click **+ Add consultant**.
2. Set the role dropdown to **Structural engineer**.
3. Pick any contact in the contact dropdown.
4. On the seeded document **Structural drawings**, click the status pill three times (Pending → Requested → Received).

Expected UI:
- A roster row appears with an **Internal** badge (engineer is not client-facing).
- Three documents seed: Structural drawings, Engineer's certificate, Earthworks / structural quantities, each with a routing badge (→ Consent, → Consent, → Proposal).
- The **Structural drawings** pill reads **Received** (sky-blue). The summary line shows at least "1 done".

Expected DB record:
- Table `leads`, column `consultant_roster` (jsonb) for the test lead contains an element with `role: "engineer"`, a non-empty `contactId`, and inside `deliverables[]` an entry `{ "key": "structural_drawings", "status": "received" }`.

- [ ] Pass  [ ] Fail

---

**TC-02 — Empty required field: consultant with no contact selected**

Steps:
1. Click **+ Add consultant** and leave the contact dropdown on "— select contact —".
2. Leave the row as-is.

Expected UI:
- The row is accepted (the panel does not force a contact) and the contact dropdown still shows "— select contact —".
- The document list still seeds for the chosen role.

Expected DB record:
- Table `leads`, `consultant_roster` element has `contactId: ""` (empty string). No crash, no partial write of the other fields.
- Advisory only: with no contact chosen, this row is not "complete" for tender purposes until its documents are Received/Issued.

- [ ] Pass  [ ] Fail

---

**TC-03 — Duplicate submission: click the same status pill twice quickly**

Steps:
1. On a document currently at **Pending**, click the status pill twice in quick succession.

Expected UI:
- The pill advances exactly one step per click — after two clicks it reads **Received** (Pending → Requested → Received). It does not skip or double-apply beyond the two clicks.
- No duplicate document row is created.

Expected DB record:
- Table `leads`, `consultant_roster` → the document's `status` is `"received"` (two ordered transitions), and there is still exactly **one** element for that `key` in `deliverables[]`.

- [ ] Pass  [ ] Fail

---

**TC-04 — Wrong role: non-admin tries the admin-only test-lead endpoints**

Steps:
1. Sign in as a **non-admin** Sales user.
2. Call `POST /api/sales/test-lead` (and/or `POST /api/sales/leads/:id/test-reset`).

Expected UI / response:
- The request is rejected by `requireRole("admin")` with a **403 Forbidden** (`{ ok: false, ... }`). No test lead is created or reset.
- Note: the Consultants panel itself (`GET /api/sales/consultants`, `PATCH /api/sales/leads/:id`, `PUT …/consent`) only requires a signed-in user (`requireAuth`); an unauthenticated request to `GET /api/sales/consultants` returns **401**.

Expected DB record:
- No new row in `leads` with `is_test = true` from the rejected call.

- [ ] Pass  [ ] Fail

---

**TC-05 — Feature-specific edge case: re-issue propagation via "changed?"**

Steps:
1. Add two consultants that form a dependency chain: an **Interior designer** (seeds "Finishes & selections schedule") and a **Lighting** consultant (seeds "Lighting + electrical plan", which depends on the finishes schedule).
2. Advance both **Finishes & selections schedule** and **Lighting + electrical plan** to **Received** (so both are "done").
3. On the **Finishes & selections schedule** document (now Received), click **changed?**.

Expected UI:
- The **Lighting + electrical plan** document shows **⟳ re-issue required** (red).
- The summary line's re-issue count increases (e.g. "1 re-issue").
- Clicking the **Lighting + electrical plan** status pill to advance it clears its **⟳ re-issue required** flag.

Expected DB record:
- Table `leads`, `consultant_roster` → the lighting consultant's `deliverables[]` entry for `key: "lighting_plan"` has `reissue: true` after step 3, then `reissue: false` after it is re-advanced.

- [ ] Pass  [ ] Fail

---

**TC-06 — Feature-specific: advisory "waiting" prompt**

Steps:
1. Add a **Structural engineer** (seeds "Structural drawings", which depends on soil report, feature survey, working drawings).
2. Add a **Soil / Geotech** consultant (seeds "Soil report (AS2870)") and leave the soil report at **Pending**.
3. Look at the **Structural drawings** document.

Expected UI:
- The **Structural drawings** document shows **⏳ waiting: Soil report (AS2870)** (and any other upstream docs on the roster that aren't done) in amber.
- The waiting note is advisory — the structural drawings pill still advances if clicked (never blocked).
- Advancing the **Soil report** to **Received** removes it from the waiting note.

Expected DB record:
- No dependency state is persisted separately — the "waiting" note is derived at render time from `leads.consultant_roster` (each deliverable's `status`) against `DELIVERABLE_DEPENDENCIES`. Confirm the soil report element reads `status: "received"` after the final step.

- [ ] Pass  [ ] Fail

---

**TC-07 — Feature-specific: Tender exit gate is advisory, and logs a bypass**

Steps:
1. With the test lead still having at least one document **not** Received/Issued (and/or no `fee_proposal_id`, no `provisional_ff_issued`), advance the lead to **Tender** (`PATCH /api/sales/leads/:id` with `{ "stage": "tender" }`).

Expected UI / response:
- The move **succeeds** (test lead — hard gates bypassed) and the response includes a `gateWarnings` array listing the missing signals (e.g. "Consultant documents complete", "Fixed-Price proposal generated", "Provisional F&F schedule issued", "Site address set", "Job created from lead").

Expected DB record:
- Table `lead_activities` has a new row for the lead: `activity_type = "stage_change"`, `summary = "Moved from consultants to tender"`, and `detail` begins with `"Gate bypass — missing: "` followed by the missing signal labels.

- [ ] Pass  [ ] Fail
