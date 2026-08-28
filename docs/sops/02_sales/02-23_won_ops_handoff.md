---
sop_version: 1.0
last_reviewed: undefined
app_version: main
screenshot_status: placeholders_only
owner: Admin / Supervisor
test_status: untested
---

# SOP: Complete a Won lead and hand off to Operations (Ops Ready)

**Module:** Sales
**SOP ID:** 02-23
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin and Supervisor staff who run the sales pipeline. This is the final Sales step for a lead — the moment a signed deal stops being a "sale" and becomes a real building job that Operations can start. You do not need any technical knowledge; you tick real-world checks that confirm the handover is genuinely done.

## 2. When to use it

Use this when a lead is in the **Tender** stage and the client has **signed the building contract**. Two things happen here, in order:

1. You **move the lead to Won** (this only works once the contract is signed).
2. You then **complete the Ops Ready handoff checklist** and press **Mark Ops Ready** so Operations knows the job is truly ready to build.

Do not start until the signed contract is in hand. A Won lead is not "finished" the second it turns Won — it sits at **Contract secured** until you have transferred everything Operations needs and marked it **Ops ready**.

## 3. What this does

Won is a **two-part state** with a clean handover at the end:

- **Contract secured** — the lead has just been won. Behind the scenes the Hub flips the linked job to Won, which automatically creates the live Operations project, and it records the contract value (ex-GST) on the job and the project.
- **Ops ready** — you have worked through the 8-item handoff checklist and pressed **Mark Ops Ready**. Operations can now start.

The estimating job that was created when the PTSA was signed only becomes a **live Operations project at this Won moment** — that is a deliberate hard boundary. Nothing "in progress" leaks into Operations before the deal is actually won.

## 4. Before you start

- The lead is in the **Tender** stage.
- The client has **signed the building contract**, and it is uploaded in the lead's **Documents** tab with type **"Construction contract"**.
- In the Tender stage panel, the **Building contract** status is set to **Signed** (this is what unlocks the move to Won).
- The lead has a **linked job** (created when the PTSA / Plans stage was signed) — if there is no job yet, add the **site address** first so the job can be created.
- Ideally the job already has a contract value, **or** there is exactly **one accepted fee proposal** on the job so the Hub can stamp the value automatically.
- You are signed in as **Admin** or **Supervisor**.

## 5. Step-by-step process

1. Open the lead from the Sales pipeline and confirm it is in the **Tender** stage.
2. In the **Building contract** panel, confirm the status shows **Signed**. If it does not, set it to Signed once the signed contract is uploaded in the Documents tab. (You cannot move to Won until this reads Signed.)
   [insert screenshot: Tender stage — Building contract set to Signed]
3. Find the **Advance to Won** panel and press its **Move to Won →** button. (On a Tender-stage lead the header's main button is **Proceed to RFQ Engine →**; the **Move to Won →** button is inside the **Advance to Won** panel below it — do not confuse the two.)
4. The lead now shows the Won panel with the banner **"Won — contract secured"** and a **Contract secured** badge. The Hub has already flipped the job to Won, created the live Operations project, and recorded the contract value.
   [insert screenshot: Won panel — Contract secured banner + Ops Ready handoff checklist]
5. Look at the **Ops Ready handoff** checklist. The top two items are ticked automatically and greyed out (marked **(auto)**):
   - **Job & Ops project created** — ticks once the lead has a linked job.
   - **Signed building contract captured** — ticks because the contract status is Signed.
6. Work through the other **six** items in the real world, then tick each one as you complete it:
   - **Accepted proposal uploaded**
   - **Final documents uploaded**
   - **Selections / schedules transferred to Operations**
   - **Contract value pushed to Finance**
   - **Start assumptions pushed to the Scheduler**
   - **Client & project details confirmed**
   The counter at the top (for example **6/8**) climbs as you tick.
   [insert screenshot: Ops Ready checklist part-complete with the counter]
7. When all **8** items pass, the button reads **"✓ Mark Ops Ready — hand over to Operations"** and becomes clickable. Press it.
8. The banner changes to **"Ops ready — ready to build"** with a green **Ops ready** badge. The handover is done.
   [insert screenshot: Won panel — Ops ready banner]
9. Use **View job dashboard →** to open the live job in Operations/Finance, or **Hand off to Tender Manager** to jump to the Tender board if you still need to close off procurement.

Note: the **Also track (advisory)** box (deposit invoice raised, council / development approval) is informational only — it never blocks the handover unless the project itself flags it.

## 6. What happens next

- Operations sees a live project for this job and can begin scheduling and site work.
- The contract value (ex-GST) is on the job and project record, ready for Finance and the client portal.
- The lead stays in the pipeline as a Won record so reporting and attribution keep a durable "won value".
- If anything was not truly ready, leave it at **Contract secured** — do not press Mark Ops Ready until the six real checks are genuinely done.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Trying to move to Won before the contract is signed | Staff assume signing the tender / verbal yes is enough | Set the Building contract status to **Signed** first; the move to Won is blocked until it is |
| Clicking **Proceed to RFQ Engine →** instead of **Move to Won →** | On a Tender-stage lead the header's main button is Proceed to RFQ Engine → | The **Move to Won →** button is in the **Advance to Won** panel — win the lead from there |
| Pressing Mark Ops Ready with items unticked | Rushing to "close" the lead | The button stays disabled until all 8 items pass — finish the real-world transfers first |
| Ticking checklist items that are not actually done | Treating the list as a formality | Each tick means the real transfer happened (docs uploaded, value to Finance, start to Scheduler) — only tick what is true |
| Moving to Won with no linked job | The PTSA was never marked signed, so no job exists | Make sure a site address is set and the job exists before winning; the "Job & Ops project created" tick will stay empty otherwise |
| Expecting the value to auto-fill when there are several accepted proposals | The Hub only auto-stamps when there is exactly one accepted proposal | Keep one accepted proposal per job, or set the job's contract value manually |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Can't move to Won yet — the building contract must be signed." | Contract status is not **signed** | Upload the signed contract in Documents, set Building contract to **Signed**, then move to Won |
| Move to Won button does nothing / blocked | Lead is not the current focus stage, or an earlier gate is unmet | Confirm the lead is in **Tender** with a signed contract |
| "Job & Ops project created" tick stays empty | The lead has no linked job | Add the **site address** and create the job from the lead, then reopen the Won panel |
| Mark Ops Ready button is greyed out | One or more of the 8 items has not passed | Check the counter (e.g. 7/8) and tick the remaining real item(s) |
| Won succeeded but no contract value shows | No value on the job and not exactly one accepted proposal | Set the job's contract value manually, or make sure a single accepted fee proposal exists |
| Checklist ticks won't save / revert instantly | Migration 195 not applied (columns missing) | Ask an admin to apply migration 195; the panel rolls a failed save back so it never looks saved |

## 9. Related modules

- [02-02 Move a lead through the stages](02-02_move_lead_through_stages.md) — how stage moves and the "Move to Won" advance work
- [02-16 Generate and accept the concept agreement](02-16_concept_agreement.md) — the earlier gated handover it mirrors
- [02-13 Use a test lead to walk the pipeline](02-13_test_lead_walk_the_pipeline.md) — how to safely rehearse this in test mode
- [02-18 Schedule pipeline meetings with Cal.com](02-18_pipeline_meeting_scheduling.md) — booking the contract-signing meeting that precedes Won

## 10. Screenshot placeholders

- [insert screenshot: Tender stage — Building contract set to Signed]
- [insert screenshot: "Move to Won →" button in the Advance to Won panel on a Tender-stage lead]
- [insert screenshot: Won panel — "Won — contract secured" banner + Ops Ready handoff checklist]
- [insert screenshot: Ops Ready checklist showing the two (auto) ticks and the 6 operator items]
- [insert screenshot: Ops Ready checklist part-complete with the 6/8 counter]
- [insert screenshot: "✓ Mark Ops Ready — hand over to Operations" button enabled]
- [insert screenshot: Won panel — "Ops ready — ready to build" green banner]

## 11. Automation notes

Everything below happens automatically the moment a lead moves to **Won** (server route `PATCH /api/sales/leads/:id`, function `finalizeWonJob`). All money is stored **ex-GST**; Xero adds GST when it invoices.

- **Won hard gate (server):** on a forward move to Won for a real (non-test) lead, the Hub reads `leads.contract_status`. If it is present and not `signed`, the move is rejected with **422 GATE_BLOCKED** ("Can't move to Won yet — the building contract must be signed."). If the column has not been migrated yet, the move passes (deploy-ahead safety). Test leads and backward moves bypass the gate.
- **Lead record:** `leads.stage` is set to `won`, `leads.won_at` is stamped with today's date, and `leads.won_substatus` is set to `contract_secured` (fail-soft — a pre-migration DB simply skips it, and it is only set when `won_substatus` is currently null).
- **Job flipped to Won:** the linked job (`leads.job_id`) has `jobs.status` set to `won`. This fires database **trigger 096**, which inserts a live Operations row into `projects` (`projects.job_id` = the job id, `projects.address` = the job's address or "Unknown", `projects.status` = `active`). The trigger uses `WHERE NOT EXISTS`, so it never creates a duplicate project.
- **Contract value stamped (ex-GST):** the Hub records `jobs.original_contract_value` and `jobs.contract_value`. The value is taken from the job's own value if already set (`jobs.original_contract_value`, else `jobs.contract_value`), otherwise from the **single** accepted fee proposal on the job (`fee_proposals.status = 'accepted'`, exactly one row), derived ex-GST (inc-GST minus tax, or inc-GST ÷ 1.1, or net + markup). If more than one accepted proposal exists, the value is **not** auto-stamped and a warning is logged.
- **Value propagated to the project:** if `projects.contract_value` is empty it is filled with the same ex-GST value so Finance and the portal read the right number.
- **Contract-secured attribution:** the realised won value is snapshotted to `enquiry_attribution.won_value` for ROI reporting (best-effort).
- **Operator checklist:** the six manual confirmations are saved to `leads.ops_ready_checklist` (jsonb, e.g. `{"proposal_uploaded": true}`) via the same PATCH endpoint. The two auto items are derived live (from `leads.job_id` and `leads.contract_status`) and are never stored.
- **Mark Ops Ready:** pressing the button sends `PATCH /api/sales/leads/:id` with `won_substatus = "ops_ready"`. No emails are sent by this step.
- **No sends in this SOP:** neither the move to Won nor Mark Ops Ready sends any email or notification. The only env-gated sends near this flow are the **contract emails in the Tender stage** — gated by `TENDER_EMAIL_ENABLED` (preview always works; actual sending needs the flag on) — and those belong to SOP 02-22, not here.

`finalizeWonJob` is **idempotent and non-fatal** — re-running it never un-wins a lead, never creates a duplicate project, and any plumbing hiccup is logged rather than blocking the win.

## 12. Edge cases and limits

- **No job yet:** if the PTSA was never marked signed, the lead has no job and the "Job & Ops project created" tick stays empty. Add the site address and create the job first.
- **Multiple accepted proposals:** the value is only auto-stamped when there is exactly one accepted proposal; otherwise set the job value by hand.
- **Advisory items never block:** deposit invoice and council / development approval are tracked in the advisory box but do not gate the handover unless the project flags them itself.
- **Pre-migration behaviour:** before migration 194 the Won gate does not fire (contract status column absent); before migration 195 the sub-status and checklist do not persist (the panel rolls the change back visibly). Apply both before relying on this SOP.
- **Test leads:** a test lead bypasses the signed-contract gate so you can rehearse the whole flow — see SOP 02-13.
- **Auto ticks are read-only:** the top two checklist items cannot be un-ticked by hand; their checkboxes are disabled and they follow the live job and contract status.

## 13. Owner of the process

**Owner:** Admin / Supervisor (Sales).
**Next review:** within 6 months of first sign-off. `last_reviewed` is currently unset — set it on the first review; the next review is then due 6 months after that date (provisional target: 2027-02-28, six months from the current build date).

## 14. Troubleshoot Agent Test Script

**Pre-test setup**
- Migrations **194** (`leads.contract_status`), **195** (`leads.won_substatus`, `leads.ops_ready_checklist`) and **096** (auto-project trigger) are applied.
- Create or pick a **real (non-test) lead** in the **Tender** stage that has a **linked job** (`leads.job_id` is set).
- The job either has a contract value already, or has **exactly one** `fee_proposals` row with `status = 'accepted'`.
- Have a signed contract uploaded (Documents tab, type "Construction contract") so you can set contract status to Signed.
- Sign in as **Admin** (some steps also verify Supervisor / no-role behaviour).

---

**TC-01 — Happy path: win the lead and mark it Ops Ready**
Steps:
1. Open the Tender-stage lead; in the Building contract panel set the status to **Signed**.
2. In the **Advance to Won** panel, press **Move to Won →**.
3. Confirm the banner reads **"Won — contract secured"** with a **Contract secured** badge.
4. Tick all six operator checklist items (Accepted proposal uploaded, Final documents uploaded, Selections / schedules transferred, Contract value pushed to Finance, Start assumptions pushed to the Scheduler, Client & project details confirmed).
5. Press **✓ Mark Ops Ready — hand over to Operations**.
Expected UI result: the two auto items show as ticked/(auto); the counter reaches **8/8**; the button enables; after pressing, the banner becomes **"Ops ready — ready to build"** with a green **Ops ready** badge.
Expected DB record:
- `leads.stage` = `won`, `leads.won_at` = today's date, `leads.won_substatus` = `ops_ready`.
- `leads.ops_ready_checklist` = a jsonb object with all six operator keys `true` (e.g. `{"proposal_uploaded":true,"final_docs":true,"selections_transfer":true,"value_to_finance":true,"start_to_scheduler":true,"details_confirmed":true}`).
- `jobs.status` (row `jobs.id = leads.job_id`) = `won`, and `jobs.original_contract_value` / `jobs.contract_value` hold the ex-GST value.
- A `projects` row exists with `projects.job_id` = the job id and `projects.status` = `active`.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field: Mark Ops Ready blocked with an item unticked**
Steps:
1. On a Contract-secured Won lead, tick only five of the six operator items (leave, say, **Client & project details confirmed** unticked).
2. Attempt to press the Mark Ops Ready button.
Expected UI result: the counter shows **7/8**, the button reads "Complete all 8 items to hand over" and stays **disabled** — it cannot be clicked.
Expected DB record: `leads.won_substatus` remains `contract_secured` (unchanged); `leads.ops_ready_checklist` has `details_confirmed` absent or `false`.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission: re-winning is idempotent**
Steps:
1. On a lead already Won, move it to Won again (or re-fire the stage move via the stepper), then press Mark Ops Ready twice.
Expected UI result: no error; the panel stays on the correct state (Ops ready after the button); no second success banner stacks.
Expected DB record: still **exactly one** `projects` row for that `job_id` (trigger 096's `WHERE NOT EXISTS` prevents a duplicate); `jobs.status` stays `won`; `jobs.original_contract_value` is unchanged (not re-derived or doubled); `leads.won_substatus` = `ops_ready` (single value, not corrupted).
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role: non-admin cannot force the stage via the stepper**
Steps:
1. Sign in as a **Supervisor** (non-admin) and open a Tender-stage lead.
2. Try to jump the lead straight to Won using the header stage stepper.
3. Separately, send `PATCH /api/sales/leads/:id` with no auth token.
Expected UI result: the stepper's jump control is not available to a non-admin (jump is admin-only, `canManage={isAdmin}`, `onJump={isAdmin ? jumpToStage : undefined}`); the Supervisor must use the gated **Move to Won →** advance in the Advance to Won panel instead.
Expected DB record: the unauthenticated PATCH is rejected with **401** (route guarded by `requireAuth`) and `leads.stage` is unchanged; no `jobs.status` flip and no `projects` row created by that call.
- [ ] Pass  [ ] Fail

**TC-05 — Feature-specific edge: Won hard gate on an unsigned contract**
Steps:
1. On a real Tender-stage lead, set Building contract status to **Sent** (not Signed).
2. In the Advance to Won panel, press **Move to Won →**.
Expected UI result: an alert shows "Can't move to Won yet — the building contract must be signed." and the lead stays in Tender. (The button is enabled client-side — `GATE_REQUIREMENTS.won` is empty — so the block is enforced by the server and surfaced via the alert.)
Expected DB record: server returns **422** with code `GATE_BLOCKED`; `leads.stage` remains `tender`; `leads.won_at` and `leads.won_substatus` are unset; the linked `jobs.status` is unchanged (still `tendering`); no new `projects` row.
- [ ] Pass  [ ] Fail

**TC-06 — Feature-specific edge: contract value stamped from a single accepted proposal**
Steps:
1. Use a Won-eligible lead whose job has **no** `contract_value` set but has **exactly one** `fee_proposals` row with `status = 'accepted'` (e.g. `total_inc_gst` 550,000, `tax_amount` 50,000).
2. Move the lead to Won.
Expected UI result: the win succeeds and the Contract secured banner appears (value is not shown on this panel but is recorded on the job).
Expected DB record: `jobs.original_contract_value` = the **ex-GST** derived total (500,000 in the example — inc minus tax), `jobs.contract_value` = the same value, and `projects.contract_value` for that `job_id` = the same value (propagated because it was empty). Then repeat with **two** accepted proposals: the win still succeeds but `jobs.original_contract_value` stays unstamped (null) and a warning is logged.
- [ ] Pass  [ ] Fail

**TC-07 — Feature-specific edge: auto-derived checklist ticks are read-only**
Steps:
1. On a Contract-secured Won lead that has a linked job and a signed contract, look at the top two checklist items.
2. Try to un-tick **Job & Ops project created** and **Signed building contract captured**.
Expected UI result: both items show ticked with an **(auto)** label, are greyed out, and their checkboxes are **disabled** — clicking does nothing.
Expected DB record: `leads.ops_ready_checklist` does **not** contain `job_created` or `contract_signed` keys (these are derived live from `leads.job_id` and `leads.contract_status`, never stored); toggling them writes nothing.
- [ ] Pass  [ ] Fail
