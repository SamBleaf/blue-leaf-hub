---
sop_version: 2.0
last_reviewed: 2026-11-17
app_version: register-brief-r01 (register rebuild, not deployed)
screenshot_status: placeholders_only
owner: Director / Project manager
test_status: untested
---

# SOP: Review the register — Not finished, Needs action, approvals, technical checks, pricing links and the client portal

**Module:** Sales → Lead → Project brief → Register (and ⋯ → Product details… on a room, Throughout or Site & existing row)
**SOP ID:** 21-02
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Director, project manager, estimator, office staff.

## 2. When to use it
- In the office after a client meeting, to tidy what was captured.
- Before issuing a brief (see 21-03) and before tender (see 21-04).
- When a client approves something, so the approval is recorded with its evidence.
- When a drawing, consultant or supplier document confirms or changes something.
- When selections are ready for the client to choose in the client portal.

## 3. What this does
The **Register** tab is the office view of every record captured in the meeting and onsite: one row per record, in one table. Nothing is copied: a change here is the same record the room screens show.

Each record has four separate answers. They are never mixed into one status:
- **Client status**: Not discussed · Preference · Proposed · Client-approved. (On a requirement the box offers **Client wants** for a preference.)
- **Technical**: Not required · Needs verification · Verified. Verified always carries a reference.
- **Pricing**: Not reviewed · Allowance / estimate · Quoted & reviewed. It is a link to the estimate line, never a price.
- **Scope**: New · Included · Alter · Existing to Remain · Remove / demolish · Make Good · By Others · Excluded · Deferred / future · N/A · Undecided. A site fact, a risk, a requirement or an action shows **Not scope**: it isn't building work, so there is no scope word to set.

A client can approve a window choice while the window still needs a technical check. Both show, and the row stays on the **Not finished** list until the check is done.

Every row also has the **⚑** (Needs action from…). It says who has to do something, what, and by when. You decide which selections the client sees in the client portal. Nothing goes to the client by itself.

## 4. Before you start
- The brief has been captured (see 21-01).
- You are signed in as staff (Admin). Portal clients never see this screen.
- The register is switched on for this lead (pilot). If it isn't, the stage shows the old schedule lists instead. Ask the director to add the lead to the pilot.
- The client portal controls appear only once the brief is on a project record. Before that, the brief is kept on the lead and selections can't be issued.

## 5. Step-by-step process

### A. Open the Register
1. Go to **Sales → Pipeline** and open the lead.
2. In the stage panel, find the **Project brief** card.
3. Click **Continue brief →**. (It reads **Start brief →** when nothing has been recorded yet.)
4. Click **Register** in the row of tabs. It sits after the divider, beside **Tender** (from the Consultants stage) and **Handover** (at the Won stage, or at any stage once the contract is signed). The tabs before the divider (**The project**, **Rooms**, **Throughout**, **Site & existing**, **Documents**) are the capture screens.
5. Look at the badge beside **Project brief**:
   - **Lead brief**: the brief is still kept on the lead.
   - **Project record · pre-construction** or **Project record · live (Operations)**: the brief is on the project record, and the client portal controls are available.
6. Read the line above the filters. It counts the records and what is left to do, for example **72 items · 36 decisions · 5 to verify · 1 action**. On a project record it adds the portal, for example **portal: 3 staged / 2 issued / 1 to review**.

> 💡 **Not finished is not the Actions list.** If you remember the old "40 outstanding" count, that count now lives here, as the **Not finished** filter. The **Actions** button in the card header (for example **Actions 10**) is a shorter list: only the things waiting on someone. A selection the client hasn't approved yet is "not finished", but nobody has to act on it until you raise a ⚑, so it isn't an action.

### B. Find what still needs work
1. Leave **Not finished** ticked. It is ticked every time you open the Register.
2. Read the rows. Each one has an amber left edge and a chip in the **Open** column: **Decision** (a choice not yet client-approved, a scope word not set, or an answer marked not decided), **Verification** (a technical check is open) or **Action** (a next action isn't done).
3. To see every row, untick **Not finished**.
4. To find one record, type in **Search item, product, ref…**. It looks through the words, the recorded answer, the product, model and supplier, the drawing reference, the next action and the staff reference in the **Ref** column.
5. To narrow by place, choose a room in **All rooms**. **Whole house / site** shows the records that aren't in a room.
6. To narrow by approval, choose a status in **Any client status**.
7. For more filters, click **Advanced filters**. You see **Any type**, **Any category**, **Any scope status**, **Any verification**, **Any pricing**, **Any owner**, and on a project record **Any portal state** (**Staged (internal)**, **On client portal**, **Client choice to review**).
8. While the extra filters are open the button reads **Fewer filters**; it counts the filters in use, for example **Fewer filters · 2** (or **Advanced filters · 2** once you fold them away). Click **Clear** (it shows only while a filter is in use) to turn them all off, or **Fewer filters** to hide them.
9. If nothing fits, you see **Nothing matches — nothing unfinished.** (or **Nothing matches.** with Not finished unticked).

Rows for the whole house and site come first, then each room in the order of the Rooms list.

### C. Read and work a row
1. Read **Item / direction**. It holds the words typed for the record. When no words were typed, the box shows the recorded answer in grey.
2. Under the words, read the record type (**Scope / works**, **Requirement**, **Selection** or **Action / verification**), the category, the product and the drawing reference. An amber **Blue Leaf assumption: Standard** (or Upgraded, Premium) chip means nothing is chosen yet and a pricing assumption is in use. It is staff-only. It isn't a client choice, an approval or a price, and it goes as soon as the client chooses.
3. Set the **Scope** column if it needs a scope word. A row that shows **Not scope** has nothing to set.
4. Read the **Status** column:
   - the client status (selections and requirements only), green once **Client-approved**;
   - **Tech:** not required, needs verification (amber) or verified (green);
   - **Price:** not reviewed, allowance / estimate or quoted & reviewed, followed by the link (selections and scope only).
5. Find the **⚑** at the top of the **Owner / next action** column. It is on every row:
   - grey outline: nothing is needed;
   - amber outline with a dot: something is open (a technical check, a choice not decided, an element still in or out) but no one has been asked;
   - a pill such as **Architect · Next issue** or **Client · 28 Nov**: someone has been asked, by then;
   - **✓ Done**: closed.
6. Tap the **⚑** (or its pill) to open the **Needs action from…** sheet. Choose **Who**; the words and the by-when are filled in for you. Everything about the sheet (Who, By when, What's needed, Done, Checked, Clear) and the Actions list is in [SOP 21-05 — Needs action and the Actions list](21-05_needs_action_and_actions_list.md).
7. Under the ⚑, the **owner —** box and the **next action** box write the same record as the sheet. Use whichever is quicker. A row with an open check or action and no owner shows **Assign an owner** in amber.
8. Click **Edit** to open the whole record under the row. You see the answer card from the meeting, and on the right **Office fields** (or **More**, for a record typed by hand).
9. Click **Office fields** (or **More**) to show the office boxes. Click **Less** to fold them, and **Close** (where **Edit** was) to close the record.
10. Click **×** at the end of a row only to remove a record. It goes at once; there is no "are you sure?". A record on the client portal or in the signed contract can't be removed (see K).

> 💡 The Register saves by itself about a second after you stop typing. The card header reads **Saving…**, then **Saved** with the time (for example **Saved 9:41 pm**). There is no sync button. **Save** in the header saves straight away.

### D. Record a client approval (with its evidence)
1. Click **Edit** on the row, then **Office fields** (or **More**).
2. In **Client status**, choose **Client-approved**.
3. A yellow box opens: **Record the client approval**.
4. Choose how the client approved it: **In a meeting**, **By email**, **Signed document** or **Client portal choice**.
5. Type a reference in the box, for example the meeting date or the email's date and subject.
6. Click **Confirm**. The box says who and when: **Recorded as** your name and today's date.
7. The record now shows **Client approval:** your name · the date · how · the reference, and the **Status** column reads **Client-approved** in green.
8. If nothing else is open on it, the row drops off the **Not finished** list. Untick **Not finished** to see it again.
9. Changed your mind before confirming? Click **Cancel**. Nothing changes.

The same **Client status** box is in **Product details…** on a room row (see H). An approval is never a technical check and never a fixed price: record those separately.

### E. When an approved record is changed (it steps back to Proposed)
An approval covers what the client agreed:
- on a **requirement, scope or action**: its words, and its recorded answer;
- on a **selection**: its product, manufacturer, model, finish or colour and supplier, and its recorded answer. A selection's own words in **Item / direction**, the client wording, notes, the owner, next action, technical check, references and pricing don't count.

1. Change something the approval covers, for example type a word into **Item / direction** on an approved requirement.
2. The record steps back to **Proposed** at once. The **Status** column reads **Proposed**, and a notice appears at the top of the card: **“[the record's words]” changed after client approval — it's back to Proposed until the client re-confirms.**
3. If the change was a slip, put back exactly what the client approved: the same words (spaces and capital letters don't matter), the same product, the same answer.
4. The approval and its evidence come back, the **Status** column reads **Client-approved** again and the notice goes.
5. If the change was real, ask the client to confirm it and record the new approval with its evidence (see D).

> ⚠️ The approved version is kept only while this page stays open on this device. After a reload, or in another tab or on another person's screen, typing the original words back no longer restores the approval: record the client's approval again (see D). Choosing a **Client status** yourself also ends it.

> 💡 Changing spaces or capital letters only (for example "existing" → "Existing") is not a change: the record stays Client-approved and no notice appears.

### F. Record a technical check (it needs a reference)
1. Click **Edit** on the row, then **Office fields** (or **More**).
2. In **Technical verification**, choose **Verified**.
3. A yellow box opens: **Record what verified it (drawing / consultant document)**.
4. Type the reference, for example **A301 Rev D detail 4** or **engineer letter 12 Nov**. If the record already has a drawing reference, the box starts with it: check it is the document that verified it. **Confirm** stays greyed out while the box is empty.
5. Click **Confirm**. The record shows **by** your name **—** the reference, and the **Status** column reads **Tech: verified**.
6. No reference to hand? Click **Cancel**. The record stays **Needs verification** and stays on the Not finished list.

You can also close a check from the ⚑: tap the pill, then **Checked**, type the **Drawing or document reference** and click **Save** (see 21-05). In **Product details…** the same box is called **Technical check**.

### G. Link the pricing (never a price)
1. Click **Edit** on a selection or scope row, then **Office fields** (or **More**).
2. In **Pricing (link — never a price)**, choose **Allowance / estimate** or **Quoted & reviewed**.
3. In the box under it (**estimate line / RFQ / quote ref**), paste the estimate line, RFQ or quote reference.
4. The **Status** column reads, for example, **Price: allowance / estimate · EST-14**.
5. Leave **Quantity (blank = not measured)** blank until it is measured. Blank is never shown as 0.

Never type a dollar figure into a note, a link or a description. The document checks stop any brief or schedule that holds one (see 21-03). Pricing and quantity are set only here, in the Register; **Product details…** has neither.

### H. By others, Excluded, Deferred and Existing to remain: set them in Product details
In the meeting, a product or finish row shows its choices only. The four settled answers, **By others**, **Excluded**, **Deferred** and **Existing to remain**, are in **Product details…**.

1. Open the room (or **Throughout**, or **Site & existing**) and find the row.
2. Tap **⋯** at the top right of the row (beside the ⚑). The menu reads: **Not decided yet** · **Not needed here** · **Note for the office (doesn't print)** · **Product details…** · **Remove answer**.
3. Tap **Product details…**. On a tablet or computer a **Product details** panel opens under the row, with **Close**. On a phone it opens as a sheet named after the row, for example **Toilet: product details**.
4. Under **Settle it as**, tap **By others**, **Excluded**, **Deferred** or **Existing to remain**. A tick shows on the one you chose.
5. The row's status line under its name now shows that answer, and the Register's **Scope** column shows the same.
6. To take it back, tap the same answer again. It goes back to undecided.

**Settle it as** appears only on product and finish choices. **By others**, **Excluded** and **Deferred** take a selection off the client's list. **Existing to remain** doesn't. Product details also holds **Product**, **Manufacturer**, **Model or code**, **Finish or colour**, **Supplier**, **What the client reads: name** and **What the client reads: description**, **Supplied by**, **Client status**, **Technical check** and **Drawing or supplier reference**, and on a project record the client portal buttons. The record type and the full list of scope words stay in the Register table (the **Scope** column).

### I. Add a coordination check (architect, engineer, windows, energy)
1. Scroll to **Technical coordination (office / consultant — not client questions)** under the table.
2. Open **Choose a coordination check…** and pick the check. The checks are grouped by topic (Site & demolition, Structure & interfaces, Envelope …), and each one starts with a short staff reference before its name. Add one only when that system is in scope.
3. Click **Add**.
4. A new row appears at the end of the whole-house rows (just before the first room's rows) as an **Action / verification** with **Tech: needs verification**, owned by the usual person for that check, and its ⚑ is amber. It is never a question for the client. In the list it now reads **(added)** and can't be added twice.

### J. Release choices to the client portal (project record only)
1. Make sure each selection has a product, or options for the client to choose from. A selection with neither is held back.
2. To release several at once, tick them in the first column. Only staged selections have a tick box. (Untick **Not finished** first if a ready selection is hidden.)
3. Read the bar above the table: it changes from **Tick staged selections to issue them to the client portal** to, for example, **2 selected**.
4. Click **Issue to client portal**. The ticks clear and the button greys out.
5. To release one only: click **Edit** on its row, then **Office fields**, then **Issue to client portal**.
6. Open **Edit** on the record: its chip has changed from **Staged (internal)** to **On portal · awaiting client**.
7. To take one back, click **Withdraw from portal**. The button isn't there once the client has approved it.
8. When the client chooses in the portal, the record shows **Client chose — review**, with **Client chose** and the product, and the line above the filters counts **to review**. On a room row the status line says **The client chose on the portal — see Product details**.
9. To accept it, click **Approve**, add a reference if you have one, then click **Confirm**. It is recorded as Client-approved with the portal choice as its evidence, and the chip reads **Approved · on portal**.
10. To send it back instead, click **Return to client**.
11. If the client asked for a change, a yellow box reads **Client requested a change** with their words. Update the proposed product, then issue it again.

> 💡 **Staged (internal)** means the client can't see it. Scope, requirements and actions can never be issued. Releasing at handover is in 21-04.

### K. Records you can't change here, and why
The screen always says why a record is read-only:
- **Approved under the contract**: a selection ordered or installed, or approved on a live project. Its words and **Scope** are greyed out in the row, and **Edit** shows **Approved under the contract — product changes go through a variation.** The owner, next action, references and technical check stay open.
- **Part of the signed contract**: a record in the signed contract baseline. **Edit** (and the room row) shows **Part of the signed contract — change it through a variation.**
- On both, the ⚑ sheet opens read-only with **Locked by the contract — raise a variation.** A chip such as **Locked (ordered)** shows on a locked selection.
- **On the client portal**: an issued selection can't be removed or taken off the client's list (for example settled as **By others**) until you withdraw it. In a room's **Other things recorded here**, its ⋯ shows **On the client portal — withdraw it first** instead of **Remove**. A room that holds one shows **Can't remove: it holds items on the client portal or in the contract** (use **Not in this job** instead).
- **Client-approved on the portal**: it can't be withdrawn.

[insert screenshot: Register tab on the real job, Not finished ticked, the line "72 items · 36 decisions · 5 to verify · 1 action" and the Actions 10 button in the header]
[insert screenshot: Register row for Gutters with the amber ⚑, and the same row after Architect is chosen, showing the pill "Architect · Next issue"]
[insert screenshot: Register row opened with Edit and Office fields, showing Client status, Technical verification and Pricing (link — never a price)]
[insert screenshot: the notice "… changed after client approval — it's back to Proposed until the client re-confirms." with the Status column reading Proposed]

## 6. What happens next
- Every change is saved to the brief itself (on the lead, or on the project record once it exists). On a project record each change is logged in the job history.
- A ⚑ with someone named appears in the **Actions** list and prints where it belongs: the architect's brief for the design team, the client's brief for the client. Blue Leaf's own follow-ups stay on our list and don't print (see 21-05 and 21-03).
- A client approval with evidence prints in the architect's brief as "(agreed with the client)" after the record's words. A record stepped back to Proposed loses that note until the approval is restored or recorded again.
- Issuing a selection puts it on the client's Selections board with a "Select …" task. The client gets a notice in the portal and, where the new portal is on and the project has the client's portal email, an email headed **A new selection is ready for you**. **Return to client** sends **Please review a selection**. No new portal invitation is ever sent from here.
- Once the building contract is signed, approved selections are locked: changes go through a variation (see 21-04).

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Reading **Not finished** as "what people must do" | It used to be the one outstanding count | Not finished includes selections waiting for approval. The **Actions** list is what's waiting on someone |
| Treating **Verified** as the client's approval | One status used to mean both | Client status and Technical are separate: set both |
| Marking Verified with no reference | Wanting the row to go green | The screen won't confirm it without one. Record the drawing sheet and revision or the consultant's document |
| Typing a dollar figure into a note or the pricing link | Habit | Links only. The document checks stop any figure |
| Fixing a typo in an approved requirement and leaving it | It looks harmless | It steps back to Proposed. Put the approved words back now, or record the client's re-approval |
| Looking for **By others** or **Excluded** on the room row | They used to sit under the choices | ⋯ → **Product details…** → **Settle it as** |
| Issuing every selection at once | Wanting the client to "see everything" | Issue only items ready for the client to choose |
| Typing "0" for an unmeasured quantity | Field looks required | Leave it blank: blank means not measured |
| Removing a row by accident with × | There is no confirmation | Check the row first. A removed record can be captured again from its room |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| **“…” changed after client approval — it's back to Proposed until the client re-confirms.** | You changed the words of an approved requirement, scope or action, or the product of an approved selection | Put back exactly what was approved (the notice goes), or record the client's re-approval |
| Typed the original words back but it stays **Proposed** | The page was reloaded or reopened since the change, or a Client status was chosen in between | Record the client's approval again with its evidence |
| A requirement's **Client status** box reads **Not discussed** but the Status column says **Proposed** | The requirement box has no Proposed choice, so it shows its first entry | Trust the **Status** column. Choose **Client-approved** (with evidence) or **Client wants** to set it |
| **“…” changed after client approval — it needs the client's re-confirmation.** | The page was out of date and still said Client-approved | The record is reloaded; check it and record the re-approval if it changed |
| **Confirm** is greyed out under **Record what verified it** | No reference typed | Type the drawing or document reference |
| **“…” needs a technical reference before it can be marked verified.** | Verified was sent without a reference | Set it again from **Technical verification** and type the reference |
| **“…” was not removed — it is on the client portal — withdraw it before deleting or re-classifying.** | You clicked × on an issued selection | **Withdraw from portal** first (not possible once the client approved it) |
| **“…” is on the client portal — withdraw it before deleting or re-classifying.** and the row says **Not saved — see the note at the top** | You settled an issued selection as By others, Excluded or Deferred, or changed its record type | Withdraw it first, then settle it |
| **“…” is approved under the signed contract — change it through a variation.** | The selection is ordered, installed or approved on a live project | Raise a variation |
| **“…” is part of the signed contract baseline — change it through a variation.** | The record is in the signed baseline. The row's words box may still let you type, but the save is refused | Raise a variation |
| **Not ready to release: add at least one option, or a specified product (not a placeholder like TBC), to the selection first. Nothing was issued.** | The ticked selections have no product and no options | Add the product (Office fields or Product details) and issue again |
| No tick box or no **Issue to client portal** | Still a lead brief, the selection is already issued, or it is hidden by **Not finished** | Check the badge reads Project record; untick Not finished |
| No **Withdraw from portal** button | The client has approved it | Leave it; change it with the client and record the new approval |
| **“…” was also changed elsewhere (…) — the latest value is shown.** | Someone else saved the same record | Re-check the record and change it again if needed |
| **Nothing matches — nothing unfinished.** | Every row that fits your filters is finished | Untick **Not finished**, or click **Clear** under Advanced filters |
| A row disappeared just after you approved, verified or settled it | It is finished now, so the **Not finished** filter hides it | Untick **Not finished** |
| The ⚑ is grey on a row with a **Decision** chip | The client still has to choose, but no one has been asked | Tap the ⚑ and name who, if someone has to act |
| **Not saved — retrying** in the header | No connection | Wait; it saves when the connection is back. Your typing is kept |

## 9. Related modules
- [21-01 Capture the project brief](21-01_capture_project_brief.md): where the records come from
- [21-05 Needs action and the Actions list](21-05_needs_action_and_actions_list.md): the ⚑ sheet, the Actions button and list
- [21-03 Issue briefs and the selections schedule](21-03_issue_briefs_and_schedule.md): what prints, and the checks before issue
- [21-04 Tender summary, contract baseline and handover](21-04_tender_baseline_handover.md): locks, variations, releasing selections at handover
- [11 Client portal SOPs](../11_client_portal/): what the client sees

## 10. Screenshot placeholders
[insert screenshot: Register tab, Not finished unticked, all 72 rows with the Open column chips]
[insert screenshot: Register, Advanced filters open with Any portal state set to Client choice to review]
[insert screenshot: Record the client approval box open, In a meeting chosen, reference typed]
[insert screenshot: Record what verified it (drawing / consultant document) with Confirm greyed out]
[insert screenshot: a room row with ⋯ open, showing the five menu items]
[insert screenshot: Product details panel on the Toilet row, Settle it as with By others ticked]
[insert screenshot: bulk issue bar with "2 selected" and Issue to client portal]
[insert screenshot: Client chose — review with Approve and Return to client]
[insert screenshot: a locked selection opened with Edit, showing Locked (ordered) and "Approved under the contract — product changes go through a variation."]
[insert screenshot: Other things recorded here, ⋯ open on an issued record, showing "On the client portal — withdraw it first"]

## 11. Automation notes
- **Saving.** `useRegister` keeps edits local, then autosaves (1.2 s debounce) `PUT /api/register/leads/:leadId` with `{ changes, deletes, meta }`. Lead mode: `saveLead` writes `leads.selections_schedule` (conditional on `leads.updated_at`). Project mode: `saveProject` → `register_apply` (one transaction; any conflict → nothing written, 409 with `conflicts[]`). Guard refusals come back as notices from `GUARD_REASONS` and the header shows the `rejected` state.
- **Not finished** = `register.outstandingReasons(item)` → `decision` / `verification` / `action`. The count line and the **Open** chips come from the same function. On the real-job fixture: 72 items, 40 Not finished (36 decision, 5 verification, 1 action).
- **⚑** = `NeedsActionFlag` (NeedsAction.jsx) in every Register row's Owner / next action cell. `needsAction.flagState`: `none` (grey), `open` (amber; `briefModel.isOpenPoint`), `set` (pill, `pillWords`), `done`. Fields: `responsibility`, `actionRole` (consultant only), `nextAction` (`next_action` column), `actionDue` (`next_issue` | `next_meeting` | `YYYY-MM-DD`, in `register_detail`), `resolved` (`register_detail`). The header **Actions** count = `needsAction.actionsSummary` (`openPoints`, scope `next_issue`, `merge: false`): 10 on the real job, 5 unnamed. Setting an action never changes `certainty` or `evidence` (`parkPatch` skips approved and locked records).
- **Approval step-back.** `register.editOutrunsApproval(item, partial)`: true when `certainty === "client_approved"`, the partial doesn't set `certainty`, and (selection: a `PRODUCT_FIELDS` change — product, model, manufacturer, colour, supplier; requirement/scope/action: `approvalWords(description)` differs — whitespace collapsed, case ignored; any kind: `answerMaterialChanged`). The store then writes `{ ...partial, certainty: "proposed", evidence: null }` and pushes the notice.
- **Approval restore (fix round 2, working tree).** `useRegister.updateItem` runs every edit through `registerMerge.approvalStep(item, partial, kept)` and keeps `approvedCopy` (a `useRef` Map, id → `{ item, notice }`) for the life of the mounted store. `stepped` stores the pre-edit item as the copy; on a later edit `approvalRestore(approved, next)` returns `{ certainty, evidence }` from the copy when `next` is the same id and kind, still `proposed` with no evidence, and `editOutrunsApproval(approved, next without certainty/evidence)` is false (`restored`: the copy and its notice are removed). Any partial that sets `certainty` ends the copy. The copy isn't in the device draft, so a reload or remount loses it. On a project record the restored selection gets a fresh `client_selections.approved_at`; `approval_evidence` is the original.
- **Server rule (same in both modes).** `registerStore.answerGuardReason` / `wordsOutrunApproval` / `freshApproval` (lead: `leadApprovalReason`), and `register_apply` `sel_update` `v_prod_changed`: a changed record still sent as `client_approved` without fresh evidence (`at`, `by`, method ≠ `board`, differing from the stored evidence) → 409 `reapproval_required`, message "An item changed after client approval — step it back to Proposed or record the client's re-approval. Nothing was saved."
- **Verified needs a reference.** `register_apply` → `technical_evidence_required` when `technical_status = 'verified'` without `technical_evidence.at` and `.ref` (project mode). Lead mode doesn't refuse it on the server; the screen won't confirm without a reference and `itemIssues` shows "Verified needs a technical reference (drawing / consultant document)."
- **Product details** = `PromptRow` office mode (ChoiceRow ⋯, EditDrawer, OtherRecorded). Settle-outs: `registerChoice.settleOptions` (only `dispositionUse === "settled_only"`) → `settlePatch` (a second tap → `undecided`). `by_others` / `excluded` / `deferred` / `na` take a selection out of `client_selections` (`NON_SELECTION_DISPOSITIONS`): re-classifying an issued one → `issued_locked`.
- **Locks.** `roomScreen.contractFixed` = `sync.baselined || sync.locked`; `sync.locked` = status `ordered`/`installed`, or `approved` on a project that isn't pre-construction. RegisterTable's row disables the words box and Scope on `sync.locked` only. `needsAction.isLocked` makes the sheet read-only. `roomScreen.removalBlocked` = `contractFixed || sync.clientVisible`.
- **Portal.** `POST /api/register/leads/:leadId/portal/issue|withdraw|return` → `portalAction` → `register_apply`:
  - `sel_issue`: `client_visible = true`, `status = 'awaiting_client'` (unless approved, ordered, installed or in review), plus one pending `client_actions` row (`selection_decision`, "Select <item_name>"). Release gate: at least one `selection_options` row or a genuine product, else held (`selection_not_ready`); all held → 409 `SELECTION_NOT_READY`.
  - `sel_withdraw`: `client_visible = false`, `status = 'not_started'`, pending `client_actions` deleted; refused `approved_locked` once approved.
  - `sel_return`: `status = 'awaiting_client'`, `client_actions` back to pending.
  - `notifyClient` (only when `projects.portal_v2_enabled`): `portal_notifications` in-app row per active client user, deduplicated per user, type, selection and day ("A new selection is ready for you" / "Please review a selection"), and an email through `sendPlainMail` to `projects.portal_client_email` when set (subject = the same title). No `project_client_users` invitation is created.
  - **Approve** on a portal choice: `updateItem(id, { certainty: "client_approved", evidence: { at, by, method: "portal_choice", ref: <typed> || "Client choice via portal" } })` then `flush`; `register_apply` sets `status = 'approved'`, `approved_at`, `approved_by_user_id`.
- **Tables.** `client_selections` (`certainty`, `technical_status`, `technical_evidence`, `pricing_status`, `pricing_ref`, `approval_evidence`, `client_visible`, `status`, `responsibility`, `next_action`, `register_detail`); `room_scope_items` (the same readiness columns, `certainty`, `baselined_at`).
- **Events.** Project mode writes `job_events`: `register.item.created`, `register.item.updated`, `register.item.deleted`, `register.item.issued`, `register.item.withdrawn`, `register.item.returned`. Lead mode writes none.
- **Brief effect.** `briefModel` prints "(agreed with the client)" after a record's words only when it is `client_approved` with evidence (`approvalNote`).
- **Access.** `requireAuth` refuses `role = 'client'` with 403 `Forbidden`; `room_scope_items` has the `deny_clients` RLS policy.

## 12. Edge cases and limits
- Two people approving the same item: the second sees a conflict and nothing is overwritten.
- The approved version kept after a step-back lives only in the page that made the change. Another person, another tab or a reload doesn't have it.
- Spaces and capital letters never count as a change to approved words.
- On a selection, a change to its own words, the client wording, a note, the owner, the next action, the technical check, a reference or the pricing never steps an approval back.
- Withdraw is refused once the client has approved a selection.
- By others, Excluded, Deferred and N/A selections are scope answers, not client choices. They never appear in the client's list.
- On a lead brief, the technical reference is asked for on screen. The server's own refusal applies once the brief is on the project record. A Verified with no reference shows an amber line on the record and is flagged by the document checks (see 21-03).
- In the table row, the words box and Scope grey out only for a selection approved under the contract. A record in the signed baseline still lets you type there, but the save is refused with the reason (open **Edit** to see it greyed out).
- Quantity blank = not measured. It is never shown as 0.
- The ⚑ and Not finished are two different rules. A row can be Not finished with a grey ⚑ (a selection waiting for the client), and a record can be on the Actions list without being Not finished.

## 13. Owner of the process
Director / Project manager
Next review date: 2027-05-17

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run against the loopback register sandbox (`scripts/dev/register-sandbox`), never production. Never run the repo's e2e, playwright or batch-a suites. Record pass/fail against each item.

### Pre-test setup
- [ ] Sandbox up: `sandbox.mjs postgrest`, `gateway`, `api`, `vite` (SPA `http://localhost:5184`, API `:8797`), with `REGISTER_ENABLED=true` in `~/.blh-register-sandbox/hub.env` (restart `api` after changing it). Signed in as the sandbox staff user from `credentials.local.json`.
- [ ] **Lead A (real job, lead brief).** Create a test lead with `POST /api/sales/leads` (`is_test: true`, `stage: "consultants"`, `project_type: "extension"`, `lead_source: "referral"` (the create refuses a lead with no source: "lead_source_category is required…"), `site_address: buildTestJobAddress({ suite: "REGISTER-2102", workflowId: "REAL-A" })` from `scripts/lib/testArtifactPrefixes.mjs`). Read its `meta.rev` with `GET /api/register/leads/:id`. Load the real job: `PUT /api/register/leads/:id` with `meta = { ...realJob().register.meta, rev: <that rev> }`, `changes = realJob().register.items` with each item's `sync` removed, `deletes = []` (`realJob` from `scripts/documents/fixtures/real-extension-job.mjs`). Expected: 72 items, 16 rooms, badge **Lead brief**.
- [ ] **Lead B (real job, project record).** As Lead A (`workflowId: "REAL-B"`), then `PUT` the Bathroom selections `i15` (Toilet), `i16` (Vanity) and `i17` (Basin) again, each with the `sync` a fresh GET returns, adding `product` `Test cistern A`, `Test vanity A` and `Test basin A`. Create the job and project with the service key (`jobs`, then `projects` with `is_preconstruction: true`, `build_phase: "pre_construction"`, `portal_v2_enabled: true`, `portal_enabled: true`, and `portal_client_email` left blank), set `leads.job_id`, and reopen the lead (or `POST /api/register/leads/:id/promote`). Expected: badge **Project record · pre-construction**; `client_selections` and `room_scope_items` rows exist with `source_register_item_id` = the item ids; every selection `client_visible = false`.
- [ ] A sandbox portal client user linked to Lead B's project (`user_profiles.role = 'client'`, `project_client_users` row), created as `scripts/tests/sandbox-client-portal.test.mjs` does.
- [ ] **Order.** TC-06, TC-08, TC-09, TC-10 (steps 1–7) and TC-12 each expect the untouched real job: give each a fresh Lead A (a new BLH TEST lead loaded from the fixture). The Lead B tests build on each other: run TC-01, TC-02, TC-03, TC-04, TC-05, TC-07, TC-10 step 8, then TC-11.
- [ ] Two whole-house defaults share words with Bathroom rows (Toilet and Vanity). Where a step names a Bathroom row, pick the one whose **Room** column reads **Bathroom**.
- [ ] Browser devtools open on Console and Network.

### Test cases

**TC-01 — Happy path (technical check with a reference, and a pricing link)**
1. Lead B → **Register**. Search `Concealed cistern`. Click **Edit** on the row whose Room is **Bathroom** (the Toilet), then **Office fields**.
2. **Technical verification** → **Verified**. Type `A-201 Rev C`. Click **Confirm**.
3. **Pricing (link — never a price)** → **Allowance / estimate**. Type `EST-14` in the box under it.
4. Wait for the header to read **Saved** with a time.
5. Expected result: the record shows **by** the staff name **— A-201 Rev C**; the Status column reads **Tech: verified** and **Price: allowance / estimate · EST-14**.
6. Expected DB record: `client_selections` row with `source_register_item_id = 'i15'`: `technical_status = 'verified'`, `technical_evidence.ref = 'A-201 Rev C'` (with `at` and `by` set), `pricing_status = 'allowance_or_estimate'`, `pricing_ref = 'EST-14'`; a `job_events` row `register.item.updated` for it.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field (Verified with no reference)**
1. Lead B → **Register** → search `Wall-hung` → **Edit** on the Bathroom row (the Vanity) → **Office fields** → **Technical verification** → **Verified**.
2. Leave the reference blank. Expected: **Record what verified it (drawing / consultant document)** shows and **Confirm** is greyed out.
3. Click **Cancel**. Expected: **Technical verification** still reads what it read before; the row isn't verified.
4. Via the API, send `PUT /api/register/leads/<B>` with the Vanity item (its current `sync`) changed to `technicalStatus: "verified"`, `technicalEvidence: null`.
5. Expected result: 409, `error` "An item needs a drawing / consultant reference to be marked verified. Nothing was saved.", `conflicts[0].reason = "technical_evidence_required"`.
6. Expected DB: the Vanity row's `technical_status` and `updated_at` unchanged; no new `job_events` row for it.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (issue twice)**
1. Lead B → **Register**. Untick **Not finished**. Tick the Bathroom Toilet and Bathroom Vanity rows. Expected: the bar reads **2 selected**.
2. Click **Issue to client portal** twice quickly.
3. Expected result: after the first click the ticks clear and the button greys out; **Edit** on each shows the chip **On portal · awaiting client**; the count line reads **portal: … / 2 issued**.
4. Send the same `POST /api/register/leads/<B>/portal/issue` again with the old `sync` values. Expected: 409, reason `stale` ("An item changed elsewhere since you opened it (+1 more). Nothing was saved."); nothing changes.
5. Expected DB: exactly one `register.item.issued` event per item (two, not four); one pending `client_actions` row (`selection_decision`) per item; at most one `portal_notifications` row per client user per selection today.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Sign in as the portal client. Call `GET /api/register/leads/<B>` and `PUT /api/register/leads/<B>` with the client's token.
2. Expected result: 403 `{ ok: false, error: "Forbidden" }` for both.
3. Query `/rest/v1/room_scope_items?project_id=eq.<B project>` with the client's token. Expected: zero rows.
4. Open `/client-portal/selections` as the client. Expected: only the issued Toilet and Vanity show; the staged Basin doesn't.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (portal choice and Approve)**
1. With the service key add two `selection_options` rows to the issued Toilet (`label` Option A / Option B, `product_name` `Test cistern A` / `Test cistern B`).
2. As the client, at `/client-portal/selections`, choose Option B.
3. As staff, reload Lead B → **Register** → untick **Not finished** → **Advanced filters** → **Any portal state** → **Client choice to review**. Expected: the Toilet row only; the count line ends **/ 1 to review**.
4. **Edit** → expected chip **Client chose — review** and the line **Client chose Test cistern B**. Click **Approve**. Expected: **Approve the client's portal choice: Test cistern B**. Leave the reference blank. Click **Confirm**.
5. The row leaves the "to review" filter. Click **Clear** and open **Edit** on the Bathroom Toilet. Check: chip **Approved · on portal**; Status column **Client-approved**; there is no **Withdraw from portal** button.
6. Check DB: `client_selections` (Toilet): `client_visible = true`, `status = 'approved'`, `certainty = 'client_approved'`, `approval_evidence.method = 'portal_choice'`, `approval_evidence.ref = 'Client choice via portal'`, `selected_product = 'Test cistern B'`.
7. Check: `job_events` rows `register.item.issued` and `register.item.updated` for it; a `portal_notifications` row titled "A new selection is ready for you"; no new `project_client_users` row; no email attempted (blank `portal_client_email`; sandbox blocks outbound mail).
8. Reject path: `POST /portal/withdraw` for the Toilet. Expected: 409, reason `approved_locked`; it stays on the portal.
- [ ] Pass  [ ] Fail

**TC-06 — Approval step-back and restore (requirement words, real job)**
1. Lead A → **Register**. Search `existing AC`. Expected: one row, Status **Client-approved** and **Tech: needs verification**, Open chip **Verification**.
2. Click at the end of **Item / direction** (`existing AC for whole house - linear grilles on ceiling`) and type `s`.
3. Expected result: a notice at the top: "“existing AC for whole house - linear grilles on ceiling” changed after client approval — it's back to Proposed until the client re-confirms."; Status column **Proposed**.
4. Wait for **Saved**. Expected: `GET /api/register/leads/<A>` → item `i08` has `certainty = "proposed"`, `evidence = null`.
5. Press Backspace once (the words are exactly as approved again).
6. Expected result: the notice has gone; Status column **Client-approved**.
7. Wait for **Saved**. Expected DB: item `i08` has `certainty = "client_approved"` and `evidence` equal to `{ at: "2026-11-15T11:07:00Z", by: "Sam Morris" }`, as before the test.
8. Change only the case: `existing` → `Existing`. Expected: no notice; stays **Client-approved**. Change it back.
9. Reject path (API, a screen that kept "client-approved"): `PUT` item `i07` (the weathertightness requirement, still Client-approved) with a changed `description`, `certainty: "client_approved"` and its evidence unchanged. Expected: 409, `conflicts[0].reason = "reapproval_required"`, error "An item changed after client approval — step it back to Proposed or record the client's re-approval. Nothing was saved."; `i07` unchanged.
10. Reject path (a reload loses the kept copy): on the `existing AC` row type `s` again, wait for **Saved**, reload the page, reopen **Register**, delete the `s`. Expected: stays **Proposed**; no notice. Then **Edit** → **Office fields** (or **More**) → **Client status** → **Client-approved** → **In a meeting**, reference `TC-06 re-approval` → **Confirm**. Expected: **Client-approved** with the new evidence.
11. Reject path (choosing a status ends it): on the `existing AC` row (Client-approved again after step 10), type `s` (the step-back notice appears), then **Edit** → **Office fields** → **Client status** → **Client wants**, then delete the `s`. Expected: Status reads **Preference**, not Client-approved; no new notice appears, and the step-back notice from typing `s` stays until you dismiss it with its **×**.
- [ ] Pass  [ ] Fail

**TC-07 — Approval step-back and restore (selection product)**
1. Lead B → **Register** → untick **Not finished** (an approved Basin is finished and would drop out of the list) → search `Inset` → **Edit** on the Basin row → **Office fields** → **Client status** → **Client-approved** → **In a meeting**, reference `Meeting 17 Nov` → **Confirm**. Wait for **Saved**. Expected DB: Basin `client_selections.status = 'approved'`, `approval_evidence.method = 'meeting'`.
2. In **Product** (`Test basin A`) type `X` at the end. Expected: notice "“Inset - built in ” changed after client approval — it's back to Proposed until the client re-confirms." (the record's words exactly as stored, the fixture's trailing space included, not the product); Status **Proposed**. Wait for **Saved**: `certainty` is no longer `client_approved` and `approval_evidence` is null.
3. Delete the `X`. Expected: notice gone; Status **Client-approved**; after **Saved**, `status = 'approved'` and `approval_evidence` has the same `method`, `ref` and `at` as in step 1.
4. Not covered by the approval: type `Basin` in **Client label (presentation)**, type a word into **Item / direction**, set **Owner (next decision)**. Expected: no notice; stays **Client-approved**.
- [ ] Pass  [ ] Fail

**TC-08 — The ⚑ on a Register row**
1. Lead A → **Register**, **Not finished** unticked. Expected: one ⚑ per row (count `[data-testid^="needs-action-"]` inside `register-table` = 72); header button **Actions 10** with an amber dot.
2. Search `Half round`. Expected: the Gutters row (Item / direction shows the answer in grey). Its ⚑ has an amber outline with a dot and the title "Open: no one has been asked yet".
3. Tap the ⚑. Expected: sheet **Needs action from…**, subject **Throughout · Gutters**; **Architect** marked **suggested**; **By when** on **Next drawing issue**; **What's needed** reads `Confirm half round`; footnote "Prints in the architect's brief under “Needed for the next drawing issue”."
4. Tap **Architect**. Expected: toast "Architect · next drawing issue — added to Actions"; the row's ⚑ becomes the pill **Architect · Next issue**; the owner box reads **Architect / designer** and the next action box `Confirm half round`; the Open column adds **Action**; the count line reads **· 2 actions**; header still **Actions 10**, with the amber dot (4 points still have no one named).
5. Expected DB: item `i27`: `responsibility = "architect"`, `nextAction = "Confirm half round"`, `actionDue = "next_issue"`, `resolved = false`; `certainty` and `answer` unchanged.
6. Contrast: search `solid core`. Expected: the Internal doors row has Open chip **Decision** but a grey ⚑: Not finished isn't the Actions list.
7. Approved records keep their approval: search `weathertightness`, tap its ⚑ (**Energy assessor** is suggested), tap **Energy assessor**. Expected: pill **Energy assessor · Next issue**; Status still **Client-approved**; no step-back notice.
8. Reject path: on the Internal doors row tap the grey ⚑, then clear **What's needed**. Expected: the Who chips grey out with **Say what's needed first**. Close with **X**. Expected: the ⚑ is still grey and nothing was saved. (The rest of the sheet is tested in SOP 21-05.)
- [ ] Pass  [ ] Fail

**TC-09 — Not finished**
1. Lead A → **Register**. Expected: **Not finished** ticked; line **72 items · 36 decisions · 5 to verify · 1 action**; badge **Lead brief**; 40 rows, each with an amber left edge and an Open chip.
2. Untick **Not finished**. Expected: 72 rows; rows with no Open chip have no amber edge.
3. Tick it again. **Any client status** → **Client-approved**. Expected: 2 rows (the weathertightness requirement and the existing AC requirement), each **Client-approved** with **Tech: needs verification** and chip **Verification**: approved but still not finished.
4. Untick **Not finished**. Expected: 3 rows (adds the electrical requirement, which has no words typed and no Open chip).
5. Tick **Not finished**; **All rooms** → **Kitchen**. Expected: **Nothing matches — nothing unfinished.**
6. **Advanced filters** → **Any verification** → **Needs verification**. Expected: the button (now **Fewer filters**, because the filters are open) reads **Fewer filters · 1**, and **Clear** shows. Click **Clear**. Expected: the button reads **Fewer filters** and **Clear** goes. Click **Fewer filters**. Expected: the button reads **Advanced filters**.
- [ ] Pass  [ ] Fail

**TC-10 — By others, Excluded, Deferred and Existing to remain in Product details**
1. Lead A → **Rooms** → **Bathroom**. Find the **Toilet** row (under **More choices** if not shown). Tap **⋯**.
2. Expected: exactly **Not decided yet** · **Not needed here** · **Note for the office (doesn't print)** · **Product details…** · **Remove answer**.
3. Tap **Product details…**. Expected: **Settle it as** with **By others**, **Excluded**, **Deferred**, **Existing to remain**; boxes **Product**, **Manufacturer**, **Model or code**, **Finish or colour**, **Supplier**, **What the client reads: name**, **What the client reads: description**, **Supplied by**, **Client status**, **Technical check**, **Drawing or supplier reference**; no record type, no scope list, no pricing and no quantity.
4. Tap **By others**. Expected: ✓ on it; the row's status line shows **By Others**.
5. Open **Register**. Expected: the Toilet row's Scope reads **By Others** and it is no longer listed under **Not finished**; the line reads **35 decisions**.
6. Back in the room, Product details → tap **By others** again. Expected: the tick goes; Register Scope **Undecided**; the row is back under Not finished (**36 decisions**).
7. Expected DB: item `i15` `disposition` went `by_others`, then `undecided`.
8. Reject path: on Lead B, the issued Vanity → Product details → **By others**. Expected: refused with "“…” is on the client portal — withdraw it before deleting or re-classifying."; the row says **Not saved — see the note at the top**; DB unchanged (`client_visible = true`).
- [ ] Pass  [ ] Fail

**TC-11 — Read-only records show why (contract and portal)**
1. Lead B → **Register** → click **×** on the issued Vanity row. Expected: notice "“…” was not removed — it is on the client portal — withdraw it before deleting or re-classifying."; the row comes back; `client_selections` row still there.
2. Lead B → **Rooms** → **Bathroom** → the room's ⋯. Expected: **Can't remove: it holds items on the client portal or in the contract** (greyed), hint **Use “Not in this job” instead.**
3. With the service key set the Basin's `client_selections.status = 'ordered'`. Reload Lead B → **Register** → untick **Not finished** → search `Inset`.
4. Expected: the Basin row's **Item / direction** box and **Scope** are greyed out. **Edit** shows chip **Locked (ordered)** and "Approved under the contract — product changes go through a variation."; **Product** is greyed out; **Owner (next decision)** and **Next action** still take typing.
5. Tap the Basin's ⚑. Expected: "Locked by the contract — raise a variation."; the Who chips are greyed out.
6. Via the API change the Basin's `product`. Expected: 409, reason `post_contract_locked`, error "An item is approved under the signed contract — change it through a variation. Nothing was saved."
- [ ] Pass  [ ] Fail

**TC-12 — A coordination check becomes an owned action**
1. Lead A → **Register** → **Choose a coordination check…** → pick the first option that isn't greyed out (on the real job, "E-001 Siteworks" under Site & demolition) → **Add**.
2. Expected: a new Whole house row at the end of the whole-house rows (just before the first room's rows), **Action / verification**, **Tech: needs verification**, Open chip **Action**, the owner box showing the check's usual owner (for the first check in the list, **Engineer / consultant**) and an amber ⚑; the count line reads **2 actions**; the option now reads **(added)** and is greyed out.
3. Expected DB: a new item with `itemKind = "action"`, `section = "tech"`, `technicalStatus = "needs_verification"`.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Test leads, jobs, projects, client user and selection options removed afterwards (BLH TEST leads only)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
