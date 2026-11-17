---
sop_version: 2.0
last_reviewed: 2026-11-17
app_version: register-brief-r01 (not deployed; ships after the Lato-on-Railway check)
screenshot_status: placeholders_only
owner: Director / Project manager
test_status: untested
---

# SOP: Issue the client brief, the Architect Design Brief and the selections documents, and record received documents

**Module:** Sales → Lead → Project brief → Documents
**SOP ID:** 21-03
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Director, project manager and office staff who prepare documents for the client, the architect, consultants, suppliers or the Blue Leaf estimator.

## 2. When to use it
- After a concept meeting: issue the **Preliminary Client Project Brief** so the client can confirm what we heard.
- Before design work starts, and before every drawing issue after that: preview the **Architect Design Brief** to see what the next drawing issue needs and from whom, fix what it lists, then issue it to the architect.
- From the Consultants stage on: issue the **Technical Selections Schedule** to the design team, estimator, suppliers and trades, and the **Client Selections Presentation** to the client. They are two documents made from the same register records, each with its own revisions. Issue either again when it changes.
- Before pricing: issue the **Tender Scope & Pricing Notes** (internal) for the Blue Leaf estimator.
- When an architect, engineer or supplier sends a document (drawings, schedules, quotes): record it under **Received consultant & supplier documents**.

## 3. What this does
Every document is made from the same project brief and register. Nothing is retyped. Before you issue, the Hub shows two boxes: a red **Can't issue yet** box with what stops the issue (a prohibited product such as engineered stone, a dollar figure, an approval with no evidence, a "verified" item with no reference, a room with work but no room brief, no drawing set named, nobody named to receive it), and an amber **Before you send** box with things worth checking that never stop you. For the Architect Design Brief you also see every line exactly as it will print, beside the PDF. Click any line, or any **Fix**, and an edit drawer opens on the thing that fixes it, so you never leave the document. Each issue is a permanent numbered revision (R01, R02 …) with a PDF, a controlled Word copy and a checksum, and every page carries the document number, for example **BLB-ADB-0417-R01**. A new issue replaces the old one, but old revisions are never deleted. Nothing is emailed: you send the PDF yourself.

## 4. Before you start
- You are signed in as Blue Leaf staff, and the project brief is switched on for this lead.
- The project brief has the content you want to issue (see 21-01 and 21-02).
- **Drawings this brief is based on** is filled in on **The project** step (the **Drawings** card). Every document needs it.
- For the Architect Design Brief:
  - every room whose Work is **New**, **Renovated** or **Altered** has a room brief (the **What must this room do?** box on the room, see 21-01);
  - the architect is named on **The project** step's design team, or you will type a name under **Issue to**.
- The database is ready for issuing. If it isn't, the Documents step says "Document issuing needs migration 213 — drafts still preview." The Client Selections Presentation also needs the migration for its own document type.

## 5. Step-by-step process

### A. Open the Documents step
1. Open the lead in **Sales**.
2. Find the **Project brief** card on the lead's stage panel.
3. Click the **Documents** tab. You'll see five rows: **Preliminary Client Project Brief**, **Architect Design Brief**, **Technical Selections Schedule**, **Client Selections Presentation** and **Tender Scope & Pricing Notes**. The documents that belong to the lead's current stage are tagged **This stage**: the client brief at the Winning offer stage; at the Consultants stage, the Architect Design Brief, both selections documents and the tender notes. The tender notes are also tagged **Internal only**.
4. Read the grey line under each name. It says **Draft — not issued**, or the last issue (for example "Issued R01 · 17 Nov 2026 · to Jo Archer, Archer Studio · not emailed").
5. On the **Architect Design Brief** row, read the readiness line before you preview, for example "Draft — not issued · 3 to fix before issuing · 10 worth checking". The first number is the red box and the second is the amber box.
6. On a desktop, click **⤢ Expand** at the top of the project brief to get the full-width workspace. The architect's brief then shows the PDF and the line list side by side.

### B. Preview the Architect Design Brief
1. Click **Preview** on the **Architect Design Brief** row. Any unsaved edits are saved first. The button reads **Previewing…** while the PDF is made.
2. Read the line under the title, for example "Draft R01 · from the register as it is now · previewed 9:41 pm".
3. Find the buttons beside it:
   - **Preview again** makes the PDF again.
   - **Download draft PDF** saves the draft. Its file name says "DRAFT (not issued)".
   - **Open in new tab** opens the draft PDF in a new tab.
   - **Check wording** asks Blueprint to proofread the draft (see step I).
   - **Close** closes the preview.
4. Read the red box **Can't issue yet (n)**, if there is one. Each entry says what is wrong and has a button that fixes it.
5. Read the amber box **Before you send (n)**, with "These don't stop you issuing." under its title. It shows five entries; click **Show n more** for the rest.
6. Read **What will print · n lines**. It lists every line of the brief in print order, under the same numbered headings as the PDF (Cover, 01 The project, 02 Site and constraints and so on). Beside each line, in small grey type, is where it comes from: **Sales**, **Public mapping**, **The project**, **Design team**, a room's name (for example "Kitchen + 4 records"), "4 rooms", **Throughout** or **Site & existing**.
7. Learn the marks on the lines:
   - a red left edge and a red **!** means the line is held up by something in the red box;
   - an amber left edge and an amber **!** means it is worth checking (for example "Budget: To be confirmed by Blue Leaf.");
   - grey italic text with a hollow dot is a gap that stops the issue (for example "Prepared for: The design team" or "Drawing basis: Not yet recorded");
   - in a room's line only the words **Brief to follow.** are grey;
   - a small **changed** tag means you have changed that line since the preview.
8. Click **Only lines with a warning** to see only the marked lines. Click it again to see them all.
9. In the Hub column (not expanded), use the switch **What will print | PDF** to move between the line list and the PDF. **What will print** shows first.

> 💡 **Tip:** The line list and the amber box update as soon as you save a change. The PDF and the red box only update when you click **Preview again**, because the server checks them.

### C. Fix what's in red
Each red entry has its own button. Work from the top: the law comes first, the recipient last.
1. **"Kitchen benchtop names engineered stone. It can't be supplied or installed in Australia — agree another benchtop with the client and change the record."** Click **Fix**. The drawer shows the benchtop with the full guidance under it, and the chip **Engineered stone · not allowed**. Tap that chip to take it off, then tap the benchtop the client agreed (for example **Porcelain**). See the engineered stone box below.
2. **"n new or renovated rooms have no room brief: …"** (the words name the Work: new, renovated or altered). Click **Go room by room**. The drawer opens the first room without a brief.
   1. Type what the room must do in **What must this room do?**. The client's own words are fine.
   2. If the room needs nothing special, tap **Nothing special — standard room** instead. It writes, for example, "Standard bedroom; no special requirements." That counts as a room brief.
   3. Click outside the box. The room's line in the list updates straight away and loses its red mark.
   4. Click **Next room without a brief ›** in the drawer's footer. Repeat until no rooms are left.
   5. A sentence that ends in "-", ":" or "—" doesn't count. The room says "Looks unfinished — it won't print until it's finished." Finish the sentence.
3. **"Say who it's going to: name the architect, or type a name under “Issue to”."** Click **Name the architect**. In the drawer:
   1. Type in **Search people and firms** and pick the person, or
   2. Click **+ Add someone new**, fill **Name (required)** and **Firm** (and the email and phone if you have them), then click **Save**.
   3. The drawer shows "Name — Firm" with **Change**, and "Saved to the client's contacts — Sales shows the same."
   4. You can instead type the name in **Issue to** at the bottom of the preview.
4. **"Record the current drawing set / revision on The project before issuing."** Click **Fix**. Type the set in **Drawings this brief is based on** (for example "DA rev 3") and click outside the box.
5. **"n items are marked client-approved without evidence: …"** Click **Fix** (or **Fix n**). Record who approved, when and how, or step the item back to Proposed.
6. **"n items are marked verified without a technical reference: …"** Click **Fix**. Add the drawing or consultant reference, or step the item back to "needs verification".
7. **"The document would contain a dollar figure — register documents never show prices or allowances."** Click **Fix**. Take the amount out of the record's words. The only dollars the Architect Design Brief may print are the client's confirmed budget band (see step D, item 2).
8. Click **Preview again** (in the drawer's footer, or in the title bar). The red box is checked again by the server.

### D. Check what's in amber
These never stop the issue. Fix the ones that matter to the architect.
1. **The client's story.** For example "The client's vision, must-haves and budget aren't recorded. The brief leaves the first two out and says the budget is “to be confirmed by Blue Leaf”." Click **Add them** and fill the fields in the drawer. They save to the client's details: Sales shows the same.
2. **The budget.** The budget band prints only once it is confirmed with the client:
   1. Click the **Budget** line, or **Confirm the budget** on "The budget isn't marked “Confirmed with the client”, so the brief says it is to be confirmed by Blue Leaf."
   2. Under **Construction budget (ex GST)**, tap the client's band: Under $400k · $400k–$600k · $600k–$800k · $800k–$1m · $1m–$1.5m · Over $1.5m. Use **Exact…** for other figures.
   3. Tick **Confirmed with the client** only when the client has confirmed it.
   4. The Budget line then reads, for example, "$800k–$1m construction budget, ex GST (the client's figure)." Until then it reads "To be confirmed by Blue Leaf."
3. **"No architect named: the brief is addressed to “The design team”."** Click **Name the architect** (as in step C, item 3).
4. **Floors**, for example "Every room is on the ground floor, but the cladding is recorded for the upper level and the living room mentions stairs." Click **Choose upstairs rooms**. Under **Tick the rooms that are upstairs**, tick them, then click **Move n rooms to Upper floor**. With two floors, the brief's room table prints under **Ground floor** and **Upper floor**.
5. **An earlier answer disagrees with a room's work**, for example "Kitchen, Pantry and Laundry: an earlier answer disagrees with the room's work (…)". Click **Fix 3**. The drawer shows the room with the banner "An earlier answer says “New kitchen”, but this room is set to Renovated. Only one can print." Click **Keep Renovated** or **Change to New**. Click **Next room ›** for the next one.
6. **"n points for the next drawing issue have no one named: …"** Click **Name who**. The **Actions** list opens at **No one named yet**. Tap who should act on each one.
7. **"…: the technical check is down to the client. A trade or engineer usually confirms it."** Click **Fix** and change who confirms it.
8. **"n notes look unfinished and won't print: …"** Click **Fix n**. Each note shows under "From [place]: [name]". Finish the words.
9. **"… says “Retain” but is marked New. It won't print until they agree."** Click **Fix**. Change the words or the status so they agree.
10. **"“…”: a client action that doesn't say what's needed. It won't print."** Click **Fix**. Say what is needed, for example "Confirm the rangehood design with the client".
11. **Empty answers**, for example "3 empty answers in the Laundry print nothing: …":
    1. Click **Review** to see them in the drawer first.
    2. Click **Delete all 3**. Under the entry you'll see "Delete 3 empty Laundry answers? They hold nothing." with **Delete** and **Cancel** (Cancel is selected).
    3. Click **Delete**. A message says "Deleted 3 empty answers." with **Undo** for 6 seconds.
    4. Only answers that still hold nothing are deleted. An answer someone has typed into, one that another record points to, or one a received document is linked to, is kept (and isn't offered).
    5. **Undo** puts the very same records back, so anything that pointed at them still does.

### E. Edit a printed line
1. Click any line in **What will print**. The drawer **Edit what prints** opens beside the PDF (on a phone, it opens from the bottom). Its second line repeats the printed words in quotes.
2. Change what the line comes from:
   - **A record** shows as it does in the room: its chips, its ⚑ (Needs action) and its ⋯ menu (**Not decided yet**, **Not needed here**, **Note for the office (doesn't print)**, **Product details…**, **Remove answer**). A record with no chips shows **What it says** and **Product details…**. A small grey "Staff reference" sits at the bottom for the office.
   - **A room** shows its name, floor, **Work** (New · Renovated · Altered · No change), any earlier-answer banner, **What must this room do?**, **Connects to**, the must-haves and **Open the full room ›**. Opening the full room asks first, for example "This closes the preview — open the Kitchen?"
   - **The client's story, budget, funding and timing** show the same fields as **The project** step, with "Saved to the client's details — Sales shows the same."
   - **Prepared for** shows the architect (**Change**), or **Name the architect**.
   - **Site, Client and Project** on the cover are read only here: "From the client's details in Sales. The brief reads it each time it's previewed." Click **Change in Sales ›** to change them.
   - **Drawing basis** shows **Drawings this brief is based on**. **During the works** shows **Moving out**, **Partly lived in** and **Living there**.
   - **Council and zone, Bushfire, Slope and Site complexity** come from public mapping: "From public mapping. It can't be edited here — re-check if the site or address changed." Click **Re-check** to look it up again.
3. Look at the drawer's footer: the save state on the left, then **Next warning ›** (or **Next room without a brief ›**, or **Next room ›**), then **Preview again**.
4. Click **Next warning ›** to move to the next marked line without closing the drawer.
5. Press **Esc** or click **×** to close the drawer.

### F. See what didn't print
1. Click **Not in this brief (n) ▸** at the end of the line list.
2. Read the groups:
   - **In the Technical Selections Schedule instead**: finishes such as floors, paint, cabinetry, benchtops, splashbacks and tapware;
   - **The client's choices (in the client's brief)**;
   - **Still open, with no one named (in the Actions list)**: name who in the Actions list and it prints in 03;
   - **Held back until fixed**, each with a short reason: unfinished, disagrees with the room, contradicts its status, or doesn't say what's needed;
   - **Empty**;
   - **Kept for the office**, including Blue Leaf's own follow-ups, which never print in the architect's brief.
3. Click a record to open it in the drawer. The reason is at the top, for example "Won't print: unfinished — ends with “-”."

### G. Preview again and download the draft
1. After any change, a band across the top of the PDF reads **Changed since this preview** with **Preview again**. While the drawer is open, use **Preview again** in the drawer's footer instead.
2. While the preview is out of date, **Download draft PDF** reads **Preview again to download**, and **Issue** is turned off. This stops you saving or issuing a file that doesn't match the screen.
3. Click **Preview again**.
4. Click **Download draft PDF** to save the current draft.

### H. Issue
1. Check **Issue to**. For the architect's brief it is filled with the named architect and firm. Otherwise type the name of the architect or firm. If you change it after the preview, click **Preview again** so the checks see the new name.
2. Fill **Email (kept on the record — nothing is sent)** if you want the email on the record.
3. Click **Issue R01** (or the next number). It is turned off until it can issue, with the reason under it:
   - "Fix the 3 items in red first." (or "Fix the item in red first.");
   - "Preview again to issue what you see.";
   - "Say who it's going to.";
   - "Recipient changed since this preview — preview again to re-check before issuing."
4. You'll see "Recorded R01 for [name] — not emailed. The controlled PDF is stored permanently; download it below to send." The preview closes.
5. Find the new row in the history table under the document: **Rev**, **Issued**, **To**, **By**, **Status** (**Current**) and **Checksum**.
6. Click **PDF** to download the issued document and send it yourself. **DOCX** is the controlled editable copy.

> ⚠️ **Issue only from a fresh preview.** If someone changes the register between your preview and your issue, nothing is issued and you see "The brief changed since you previewed it — nothing was issued. Re-open the preview to see the current version, then issue again."

[insert screenshot: Architect Design Brief preview in Expand, with the red and amber boxes, the PDF and What will print]
[insert screenshot: edit drawer on a room, with Next room without a brief ›]
[insert screenshot: issue bar with Issue R01 turned off and its reason]

### I. The other documents
1. Click **Preview** on the **Preliminary Client Project Brief**, **Technical Selections Schedule**, **Client Selections Presentation** or **Tender Scope & Pricing Notes** row.
2. Read the red and amber boxes. Fix anything red in the register, then click **Preview again**.
3. Read the PDF. The line under it says what the document includes.
4. Fill **Issue to** and click **Issue R01**, as in step H.
5. **Check wording (optional, any document):**
   1. Click **Check wording** in the title bar. It reads "Checking the wording…".
   2. Blueprint lists its suggestions under the boxes, numbered, with "Suggestions only — nothing has been changed." Each one is highlighted in yellow with its number on a **Highlighted copy** of the draft. Click **Clean draft** to see the plain draft.
   3. Nothing is changed for you. Fix the wording in the register (or tell the office if it is the template's fixed wording), then click **Preview again**.
   4. A suggestion marked "(not marked on the page)" runs across two pieces of text, sits in the header or footer, or prints in more than one place, so it is only listed.
   5. **Check wording** is turned off while the preview is out of date. It never stops or changes an issue, and the issued document is never marked.
6. What each document contains is set out below.

### J. Coordination packs
1. Open **Coordination requests (draft packs from the same register)**.
2. Click a pack: **Architect pack**, **Routleys pack**, **TLI lighting pack**, **Windows pack**, **Engineer pack**, **Joiner pack** or **Energy pack**.
3. A draft Technical Selections Schedule of only that party's items opens in a new tab: the items tagged for them, those citing a document from their discipline, and their requirements and actions. It names who it is for and runs the same checks as an issue, so a superseded source, a price or a prohibited product stops it. It is a working document, not an issued record.

### K. Received documents
1. Open **Received consultant & supplier documents**.
2. Attach the file under **File (PDF)**.
3. Choose **Type** (**Consultant document** or **Supplier schedule / quote**) and **Discipline**.
4. Fill **Issuer**, **Document no.**, **Revision**, **Received** and, if there is one, **Outstanding question**.
5. Click **Add received document**.
6. On the document's row, click **Review & link**. Choose the register items it affects.
7. Type **Review notes (what changed, what was accepted / rejected)…**.
8. On each linked item, click **Set as source**.
9. For a technical check a consultant's document confirms, set the document's status to **Reconciled** first, then click **Mark verified by this document**. A supplier's selection or quote is never technical verification, so it only offers **Set as source**.
10. Enter each product the client chooses as its own record, with its own code and quantity (three tapware products are three records). Accessories that come with it (wastes, grates, isolation stops, flush plates, towel rails) stay in the supplier's document, which the record cites.
11. Set the document's status as you go: **Received** → **Under review** → **Reconciled**, or **Superseded** when a newer revision arrives. Records citing a superseded document must be linked to the current one before the next issue.

> 💡 **Tip:** Received documents never change the register by themselves. You decide what each one changes. That is the reconciliation.

### What the Architect Design Brief contains (adb-2.0, from 17 Nov 2026)

It goes to the architect and the design team. It is short (about a page and a half on a typical extension) and reads coordination first. Each section prints only when it has something in it, and the numbers close up.

- **Cover.** **Prepared for** (the name under Issue to, else the named architect and firm, else "The design team", which stops the issue), **Site**, **Client**, **Drawing basis**, **Project** (for example "Extension · Construction management"), **Document**, **Prepared by** Blue Leaf Building and **Status**. The box under it says what the brief is for and that it doesn't approve a technical solution. A draft adds "Grey text marks what Blue Leaf still has to provide; an issued brief has none."
- **01 The project.**
  - **What's planned**, counted from the rooms' Work, for example "An extension and renovation: 16 rooms, 8 new and 8 renovated."
  - **In the client's words**, **Must-haves** and **What worries them**. Each is left out when it isn't recorded.
  - **Funding and timing**.
  - **Budget**: the band only when confirmed with the client, otherwise "To be confirmed by Blue Leaf."
  - **The client's priorities**, then each settled house-wide requirement under its own name.
- **02 Site and constraints.** From public mapping and what the client told us (a guide only): **Council and zone**, **Bushfire**, **Slope**, **Site complexity**, **Access** and **During the works**.
- **03 Needed for the next drawing issue.**
  - A numbered list: **What's needed** and **Who**. A **By** column appears once any point has a by-when (Next issue, Next meeting or a date).
  - Who reads in this order: Architect, Engineer, Energy assessor, other consultants, Trade / supplier, Client, then **To be agreed**. Where the firm is on the design team, its name prints instead of the role.
  - "(agreed with the client)" prints only when the approval has evidence. A performance goal for a consultant to assess adds "for consultant review", in one note: "(agreed with the client; for consultant review)".
  - Things still in or out of the job in one place are asked once, for example "Retaining and pool: are they part of this job?"
  - A benchtop held open by the engineered stone rule says why it is open ("material still to be chosen; designer to confirm"), never the product.
  - Blue Leaf's own follow-ups never print here. They stay in the Actions list.
- **04 Rooms.** One row per room: **Room**, **Work** (from the room's own Work setting) and **What it must do and contain**.
  - The room brief comes first, then what it connects to, who uses it, its rough size, its must-haves and what the drawings depend on.
  - Rooms with nothing recorded and the same Work share one row at the end.
  - With two or more floors the rows sit under floor headings such as **Ground floor** and **Upper floor**.
  - In a draft, a room with work but no brief starts with **Brief to follow.** in grey italic. The room-brief rule stops the issue, so an issued brief never has one.
- **05 Selections that affect the drawings** (titled **Work and selections that affect the drawings** when house-wide work prints there): door height, ceilings, cladding and main walls, roof and gutters, windows and sliders, fireplace and TV wall, wet-area set-out, laundry and kitchen joinery layout, driveway, fencing, retaining and pool. It closes with "Paint, floor finishes, cabinetry, benchtops, splashbacks and tapware are in the Technical Selections Schedule."
- **06 Outside this job.** Rooms not in this job, work not in this job, a possible later stage, work by others and items the client supplies.
- **What never prints.**
  - Reference codes.
  - Contradictions, notes that stop mid-thought, empty answers, and actions that don't say what's needed. These come back to you as amber entries.
  - Finishes (they are in the Technical Selections Schedule).
  - Typed words print as typed, with a light tidy only (spaces, a leading capital, " - " read as a comma). Spelling isn't corrected, so fix it in the drawer.

> 💡 **Tip:** To ask the architect, engineer or energy assessor for something, tap the record's ⚑ (Needs action), choose **Who** and **By when**. It prints in 03 with that who and by-when. Record the firm on **The project** step's design team so the brief names it.

> 💡 **Tip:** "Nothing special — standard room" is a proper room brief for a WC or a store. A room marked **No change** or **Not in this job** needs no brief.

> ℹ️ **Note:** The brief prints the drawing basis exactly as recorded. When the plans change (for example, the client supplies their own set), update **Drawings this brief is based on** before you issue the next revision. The earlier revision keeps the set it was issued against.

### What the Client Project Brief contains (design cpb-2.4, from 16 Nov 2026)

The brief reads in this order and leaves out any section with nothing in it:
1. **The project:** your Sales description, the client's top three priorities and their own note, and the client vision as the design direction.
2. **Scope of works:** what we propose to build. Then, under a heading that names only the lists shown: what stays, what's outside the scope, by others, items the client supplies, still to be decided, and what still needs checking, with who confirms.
3. **Design direction:** preferences grouped by category, every row naming its room, each status in words, with a key under the last group explaining the statuses used.
4. **Assumptions.**
5. **Decisions to make:** only real actions, 3 to 7 of them, the client's first. Each shows who (an unassigned one reads "To be agreed") and, once a by-when is set, under it "By our next meeting", "By the next drawing issue" or a date ("By 28 Nov").
6. **What happens next:** follows the pathway. The PTSA is only explained before it is signed, never on a plans-supplied or architect-tender lead.

### The Technical Selections Schedule and the Client Selections Presentation

- **Technical Selections Schedule** (A4 landscape):
  - the selections grouped by trade: roof and walls, windows and doors, internal finishes, joinery and benchtops, plumbing fixtures and tiling, lighting and electrical, heating, cooling and services, and external works;
  - each row shows the product, its maker, supplier and code, the finish, a quantity only where one is recorded, the status, and a source key (S1, S2 …) listed under **Source documents** at the end;
  - it lists the requirements the selections must meet and every open action, with who and, once a by-when is set, under it "By the next drawing issue", "By the next meeting" or a date;
  - page 1 says what each status means and how many selections are known, provisional and unresolved.
- **Client Selections Presentation** (A4 portrait):
  - what we need from the client first, then their selections room by room;
  - no references, codes, suppliers' document numbers, technical states, quantities or prices;
  - a preference shows the client's own words, and a product shows only once it's proposed to them or chosen;
  - an item with nothing chosen says **To be decided**, the same as in the technical schedule.
- **Client label and client description** (office fields, under **Product details…**) are what the client reads, for example "Kitchen mixer" and "Luxe pull-down sink mixer". Fill them in for every supplier product before issuing the presentation, especially where the supplier's line is technical or two items share a question (sink and mixer). The supplier's own wording stays in Product for the technical schedule.
- A product from a supplier document still **Received** or **Under review** isn't put to the client. It prints **Being confirmed** until you reconcile the document. A proposal with nothing a client can read prints **To be decided**, and the checks list it.
- In both documents, these stop the issue until you fix them:
  - a record that cites a **superseded** received document, or one no longer on file (link it to the current document);
  - a record **verified** against a document nobody has reviewed;
  - an approval recorded only on the portal board, with no who, when or how. It also prints as Proposed.
- The client brief, the architect's brief and both selections documents print the document number and status on the left of the footer and "Page X of Y" on the right, in the same small grey type.

> ⚠️ **Engineered stone:** Engineered stone is prohibited in Australia from 1 July 2024.
>
> **What stops an issue.**
> - Anything a document would print that names engineered stone, whatever the wording: a scope line, an item kept, a requirement (even "No engineered stone"), a decision or the client's priority note.
> - A selection that names engineered stone in its description, product, colour, supplier, source or chosen option, or the "Engineered stone" chip being chosen. Then the client brief, the architect's brief and the schedule won't issue.
> - Shorthand counts too ("eng. stone", "E-stone", "quartz benchtop", or just "Quartz" on a benchtop, splashback, vanity or laundry bench). The check doesn't read around the words: "Porcelain instead of engineered stone" on a selection still stops the issue.
>
> **Stone that is already there.** Write the line without the material, for example "Remove the existing kitchen benchtops". Mark the record Retain, Remove, Make good or Alter, and put "Engineered stone" in its **Product** field: the brief doesn't print it, the register keeps it, and the WHS warning still shows. Record existing stone on a scope line, not a selection, because the selections schedule prints Product.
>
> In the architect's brief the red entry reads "Kitchen benchtop names engineered stone. It can't be supplied or installed in Australia — agree another benchtop with the client and change the record." The benchtop chip shows as **Engineered stone · not allowed**: tap it to take it off, then choose another with the client.
>
> **What to do.** Agree a compliant alternative with the client if needed (porcelain, sintered stone, natural stone). Then reword the selection to name only what will be supplied, for example "Porcelain benchtop, 20 mm". The register keeps the original wording in its history.
>
> **What only warns.** These are recorded but don't stop the issue:
> - existing stone recorded in the Product field of a record marked Retain, Remove, Make good or Alter. The warning is not WHS clearance: if it is stone already installed, removing, repairing, making a minor modification to, or disposing of it is controlled work, and SafeWork SA must be notified before it starts. Plan it through the job's WHS process
> - the client's own note (unless the document prints it)
> - a brand name such as Caesarstone (check it's a compliant range)
> - the internal Tender Notes
>
> Each message names the record and its room.
>
> ⚠️ **Font warnings:** "Some characters printed in a fallback font" or "may not print in the Blue Leaf font" means a symbol or a character from another language is in a name or description. Check the preview and retype it in plain text. If the issue is refused with "the server needs the Lato font installed", tell the office: the server is missing the Blue Leaf font.

### Tender Scope & Pricing Notes (internal)

1. Open **Documents**. The row is marked **Internal only**.
2. Click **Preview**. **Issue to** is already set to Blue Leaf estimating.
3. Read it against the drawings. It lists included work, existing works, excluded work, work by others, systems and materials, finishes, site facts, risks, undecided items, technical questions, Blue Leaf pricing assumptions and drawing references. Each register line carries its item ID.
4. Click **Issue R01**. It is stored as R01 and is never overwritten. Issue it again and it becomes R02, and R01 stays on file. The message reads "Recorded R01 for Blue Leaf estimating. It's stored permanently for internal pricing. Don't send it to the client, consultants or trades."
5. Use it to price in Buildxact. Don't send it to the client, a consultant or a trade. It has no amounts and no quantities, because Buildxact holds the numbers.

## 6. What happens next
- The issued PDF and its controlled Word copy are stored permanently with the lead and listed in the lead's documents. They can't be deleted from the lead's Documents tab.
- The previous revision of the same document is marked **Superseded** in the same step. It still opens.
- Once a job exists, the job's history records who issued what.
- Nothing is emailed and no portal invitation is made. Download the PDF and send it yourself.
- Changes you make in the edit drawer are saved to the project brief (or to the client's details in Sales) exactly as if you had made them on the room or on The project step.
- Items you mark verified by a received document carry that document's number as their technical reference.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Issuing before naming the drawing set | **Drawings this brief is based on** left blank | Fill it on **The project** step, or click **Fix** on the red entry |
| Leaving rooms without a room brief | The room was set to New or Renovated but nobody wrote what it must do | Click **Go room by room** and write one sentence per room, or tap **Nothing special — standard room** |
| Ticking **Confirmed with the client** because a figure is in Sales | Assuming a number in Sales is agreed | Tick it only when the client has confirmed the band. Otherwise the brief rightly says "To be confirmed by Blue Leaf" |
| Expecting the PDF to change after a fix | The list updates at once, but the PDF doesn't | Click **Preview again** before you download or issue |
| Expecting the Hub to email the PDF | There is an email box under the issue button | The email is a record only. Send the PDF yourself |
| Typing an allowance amount into a description | Habit | Register documents never show prices. The issue is blocked |
| Editing the Word copy and treating it as the record | The DOCX is editable | The issued PDF and its checksum are the record. Change the register and issue again |
| Marking an item verified from an email | No document recorded | Add the received document first, then **Mark verified by this document** |
| Deleting empty answers that someone meant to fill in | **Delete all** looks like a tidy-up | Click **Review** first. Use **Undo** straight away if you deleted by mistake |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Record the current drawing set / revision on The project before issuing." | Drawing basis blank | Click **Fix** and fill **Drawings this brief is based on** |
| "Say who it's going to: name the architect, or type a name under “Issue to”." | No architect named and **Issue to** blank (architect's brief) | Click **Name the architect**, or type a name under **Issue to**, then **Preview again** |
| "Enter who the document is being issued to." | **Issue to** blank (other documents) | Click its **Fix** (it moves you to **Issue to**) and type the name |
| "n new or renovated rooms have no room brief: …" | Rooms with work and no finished room brief | **Go room by room**, then **Preview again** |
| A room still counts as missing its brief after you typed one | The sentence ends in "-", ":" or "—" | Finish the sentence. The room says "Looks unfinished — it won't print until it's finished." |
| "… marked client-approved without evidence …" | Approvals without who, when or how | Record the approval evidence, or step them back to Proposed |
| "The document would contain a dollar figure — register documents never show prices or allowances." | A $ amount in a description, note or pricing link | Click **Fix** and remove the amount. Only a confirmed budget band may print, and only in the architect's brief |
| The red box hasn't changed after a fix | The red box is checked by the server | Click **Preview again** |
| **Issue R01** is greyed out with "Preview again to issue what you see." | Something changed since the preview | Click **Preview again** |
| "Recipient changed since this preview — preview again to re-check before issuing." | **Issue to** was edited after the preview | Click **Preview again** |
| "The brief changed since you previewed it — nothing was issued. …" | Someone else changed the register between your preview and your issue | Preview again, check it, then issue |
| "This document can't be issued yet." followed by reasons | A check failed at issue | Fix each reason, preview again, then issue |
| "Your latest changes haven’t saved yet, so there’s nothing new to preview. …" | A save failed or was changed elsewhere | Check the save state at the top of the project brief, then preview again. Your edits are kept |
| "Budget: To be confirmed by Blue Leaf." although Sales has a figure | **Confirmed with the client** isn't ticked | Confirm with the client, then tick it |
| "The From amount is more than the To amount." | **Exact…** figures the wrong way round | Swap the figures |
| "Couldn't reach the mapping service. Nothing changed." | Public mapping is down or limited | Try **Re-check** later |
| "This record has been removed." in the drawer | Someone deleted it, or you used **Delete all** | Close the drawer. Use **Undo** if it was you |
| "There are no client selections to schedule yet." | Only scope or requirements recorded | Record selections first |
| "Document issuing needs migration 213 — drafts still preview." | Database not updated | Ask the director. The migration needs approval to apply |
| "No register items are tagged for … yet." | No items for that supplier or discipline | Tag items (supplier or category) in the register |
| Someone else issued at the same moment | Two people clicked Issue | One issue wins. The other is retried with the next number automatically |
| "The register changed since this preview. Preview the draft again, then check the wording." | The register was changed in another tab after the preview | **Preview again**, then **Check wording** |
| "The AI model isn't available to this API key …" or "… rate limit …" | Blueprint can't reach its model right now | Try again in a minute. Admin: see SOP 02-05 §8 |
| A wording suggestion is wrong (for example it flags Australian spelling or a product name) | The check is a proofreader, not the record | Ignore it. Nothing changes unless you change the register |

## 9. Related modules
- [21-01 Capture the project brief](21-01_capture_project_brief.md): The project step, rooms, Work and room briefs
- [21-02 Review the register](21-02_register_review_approvals_portal.md): approvals, technical checks and Needs action
- [21-04 Tender, contract baseline and handover](21-04_tender_baseline_handover.md): what happens after the documents
- [02 Sales — lead documents](../02_sales/): where issued documents are listed

## 10. Screenshot placeholders
[insert screenshot: Documents step, five document rows, Architect Design Brief row before preview with "3 to fix before issuing · 10 worth checking"]
[insert screenshot: Architect Design Brief preview in Expand, red "Can't issue yet (3)" and amber "Before you send (10)", PDF on the left, What will print on the right]
[insert screenshot: What will print list with a red-marked room line, the amber Budget line and "Not in this brief (24)" open]
[insert screenshot: edit drawer "Edit what prints" on a room, earlier-answer banner and "Next room without a brief ›" in the footer]
[insert screenshot: edit drawer on the Budget line, band chips and "Confirmed with the client" ticked]
[insert screenshot: PDF with the "Changed since this preview" band and Preview again]
[insert screenshot: amber empty-answers entry asking "Delete 3 empty Laundry answers? They hold nothing."]
[insert screenshot: issue bar, Issue R01 turned off with "Fix the 3 items in red first."]
[insert screenshot: phone, "Can't issue yet · 3 ›" and "Before you send · 10 ›" rows and the Download draft PDF / Open PDF bar]
[insert screenshot: issued Architect Design Brief R01, page 1]
[insert screenshot: issue history showing R01 Superseded and R02 Current]
[insert screenshot: Routleys coordination pack]
[insert screenshot: received document under review with Set as source]

## 11. Automation notes
- Preview: `POST /api/register/leads/:leadId/documents/:docType/preview` with `{ recipientName }`. The browser flushes the store first. The server renders the docx template and converts it to PDF with LibreOffice. Nothing is stored. It returns:
  - `pdf`, `revision` and `itemVersions` (the issue fingerprint);
  - `checks.errors` (red: `registerDocChecks` in issue mode, starting with `releaseBlockers` from `src/lib/registerQuality.js`) and `checks.errorTargets`;
  - `checks.warnings` (amber, server-side) and `checks.content` (amber content checks, `contentChecks`, never block);
  - for `architect_brief` only, `lines` (`architectBriefLines`, each with `ids` and `source: { kind: record | room | fact | meta | consultant | site, key }`) and `notPrinted` (groups `schedule`, `client`, `held`, `empty`, `office`, `waiting`).
- The browser recomputes `architectBriefModel`, `architectBriefLines`, `contentChecks`, `releaseBlockers` and `roomsNeedingBrief` (src/lib/briefModel.js, registerQuality.js) on every change, so the amber box, the line list and the red line marks are live. The red box keeps the server's list until the next preview. The preview is stale when `printKey` (items, rooms, `planRev`, `occupancy`, goals, budget, consultants, site, identity, project type, delivery model) differs.
- Room-brief rule: a room whose `scope` is `new`, `renovated` or `altered` needs an R-004 record whose `description` is non-empty and doesn't end in `-`, `:` or `—` (`hasRoomBrief`). The room's `scope` is the only room scope that prints. Hidden whole-room scope answers (K-001, R-003, L-001 …) that disagree are held back.
- Budget band (owner decision 1): `budgetLine(context)` prints only with `construction_budget_min`/`max` set and `wo_budget_confirmed` reading as yes. It must match `BUDGET_BAND_RX`. `withoutBudgetBand` takes that one line out before the dollar-figure check (`MONEY_RX`).
- Who and by-when: `responsibility` is the one who. `actionRole` (engineer, energy …) applies only to `consultant`. `actionDue` is `next_issue` | `next_meeting` | `YYYY-MM-DD`. The architect's brief prints `dueLabel` ("Next issue"). The client brief decisions and the TSS actions print `byWords` ("By our next meeting" for the client, "By the next meeting" otherwise, "By the next drawing issue", "By 28 Nov") on the line under the who. Blue Leaf's own points (`responsibility = blue_leaf`) never print in 03 (D3).
- Edit drawer writes:
  - records through `updateItem` / `deleteItem` (the same guards: an edit that outruns a client approval drops it to Proposed, contract and baseline locks refuse);
  - rooms through `mutateMeta` plus the room's R-004 record (`upsertItem`);
  - facts through `PATCH /api/sales/leads/:id` (`construction_budget_min`, `construction_budget_max`, `wo_budget_confirmed` = "Yes", `wo_client_vision`, `key_requirements`, `wo_biggest_concern`, `finance_status`, `desired_start_date`);
  - the architect through `POST /api/sales/leads/:id/design-team` (crm_contacts + `leads.consultant_roster`, `leads.architect_name`);
  - a site re-check through `POST /api/register/leads/:id/site/recheck` (rate-limited per lead).
  - The cover's Site, Client and Project lines are read only (D1).
- Delete all empty answers: `deletableEmpty` (`isEmptyRecord`, has a question, not in `referencedIds`, not in `keep`). The Documents step passes `keepIds` (every `register_item_ids` of its received documents) to `contentChecks` and to the click-time `deletableEmpty`, so a record a received document links is never offered or deleted (review R6). Each record is deleted through `deleteItem`, and only if it is still deletable at the click. Undo calls the store's `undeleteItem` (`registerMerge.planUndelete`): the very records come back under their own ids, where they were in the list.
- Not in this brief groups shown: `schedule`, `client`, `waiting` ("Still open, with no one named (in the Actions list)"), `held`, `empty`, `office`; any other group a newer model sends is listed under "Other records" (`notPrintedGroups`), so nothing counted is hidden.
- Issue: `POST /api/register/leads/:leadId/documents/:docType/issue` with `{ recipientName, recipientEmail, expectedVersions }`.
  - A changed fingerprint returns 409 `ISSUE_STALE`. Failing checks return 422 `PREFLIGHT` with `checks`.
  - It uploads the PDF and DOCX to `lead-documents/leads/<leadId>/register/<docType>/` (never overwrites) and computes a SHA-256 checksum.
  - The `register_issue_document` RPC keeps one current issue per type, with unique version numbers under an advisory lock. A database trigger blocks deleting or editing issued rows.
  - `source_snapshot.fixture.architectBrief` keeps `model: "adb-2.0"`, the printed `lines` with their record ids, `notPrinted` and `counts`.
  - With a job, `job_events` gets `register.document.issued`.
- Received documents: `POST /api/register/leads/:leadId/sources` and `PATCH /sources/:docId` write `lead_documents` rows with `document_type` `consultant_document` or `supplier_document`.
- Packs: `GET /api/register/leads/:leadId/packs/:discipline`, generated, not stored.
- No email is sent and no portal invitation is created by anything in this SOP.

## 12. Edge cases and limits
- Two people issuing the same document at once: one waits for the other, and the second gets the next revision number.
- Someone changes the register in another tab after your preview: your issue is refused and nothing is stored. Preview again.
- Internal financials (estimate lines, allowances, margins) never reach any document. Pricing appears only as status words. The one exception is the client's confirmed budget band in the architect's brief.
- Missing story lines (vision, must-haves, worries) only warn. The brief leaves them out.
- A room marked **Not in this job** leaves the rooms table and is listed under **06 Outside this job**. A room marked **No change** needs no brief.
- Changing a room's Work to Altered or New after its brief was written doesn't remove the brief. Changing a room with no brief to Altered adds it to the red entry.
- **Delete all** only deletes answers that are still empty when you click **Delete**, and never one another record points to or a received document is linked to. **Undo** lasts 6 seconds and puts back the same records.
- A record locked under the signed contract opens read only in the drawer, with "change it through a variation".
- The **Next room without a brief ›** button walks the rooms in the room list's order. When none are left, the footer offers **Next warning ›**.
- On a phone the PDF isn't shown in the page: use **Open PDF** or **Download draft PDF** in the bar above the app's navigation. The red and amber boxes are two rows that open as sheets, and the issue box sits at the end of the list.
- Excluded, By others and Deferred items appear in the client brief's scope boundary and the architect's brief's **Outside this job**, not in the selections schedule.
- The DOCX is for controlled edits by Blue Leaf only. The PDF is what is issued.

## 13. Owner of the process
Director / Project manager
Next review date: 2027-05-17

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run against the loopback register sandbox (`scripts/dev/register-sandbox`: SPA :5184, API :8797, gateway :54321), never production. Never read the repo `.env`. Keys and logins come only from `~/.blh-register-sandbox/` and are never printed. Record pass or fail against each item.

### Pre-test setup
- [ ] Sandbox running (`sandbox.mjs postgrest`, `gateway`, `api`, `vite`) with `REGISTER_ENABLED=true` in `hub.env`. LibreOffice and the Lato font are installed (otherwise every issue is refused with "the server needs the Lato font installed"). Signed in as the sandbox staff user.
- [ ] Unit cross-check passes first: `node scripts/tests/register-brief-model.test.mjs` and `node scripts/tests/register-documents-ui.test.mjs`. The real-job numbers below (37 printed lines, 48 of 72 records printed, 24 not, 3 red, 10 amber) come from these tests.
- [ ] **Lead A, the real job.**
  1. Create it with `POST /api/sales/leads`: `name: "BLH TEST Real job"`, `site_address: buildTestJobAddress({ suite: "REGISTER-DOCS", workflowId: "21-03-A" })` (from `scripts/lib/testArtifactPrefixes.mjs`), `suburb: "Seaview Park"`, `project_type: "extension"`, `stage: "consultants"`, `lead_source: "referral"`, `is_test: true`. (Without `lead_source` the create is refused: "lead_source_category is required (or a lead_source we can classify).")
  2. With the sandbox service client, set `delivery_model: "construction_management"`, `finance_status: "cash"`, `desired_start_date: "2027-04-01"`, `site_council: "CITY OF SEAVIEW"`, `site_zone: "Hills Neighbourhood"`, `site_bushfire_prone: true`, `site_complexity: "high"` and `site_enriched_at: now()`.
  3. Load the register from `realJob()` in `scripts/documents/fixtures/real-extension-job.mjs`: `PUT /api/register/leads/:id` with `{ meta: { ...emptyMeta(register.meta), rev: 0 }, changes: register.items.map((i) => makeItem({ ...i, sync: null })) }`, keeping the fixture's room and item ids. Remove each item's `sync`: the fixture's items carry versions, and a new item that carries one is refused (409, conflict reason `missing`, "Some items were changed elsewhere.").
  4. Leave its vision, must-haves, budget and design team empty.
- [ ] **Lead B, a small renovation.**
  1. Create it with `POST /api/sales/leads`: `name: "BLH TEST Small reno"`, `site_address: buildTestJobAddress({ suite: "REGISTER-DOCS", workflowId: "21-03-B" })`, `project_type: "renovation"`, `stage: "consultants"`, `lead_source: "referral"`, `is_test: true`, `wo_client_vision: "A brighter kitchen for a family of four"`, `key_requirements: "Island bench; room for a dining table"`, no budget.
  2. Register: `planRev: "DA rev 1"`. Rooms, all on Ground: Kitchen (`kitchen`, `renovated`), Bedroom 2 (`bedroom`, `new`), Living (`living`, `existing_remain`), WC (`wc`, `not_in_scope`). Two settled client selections in the Kitchen (for example the K-005 benchtop with **Porcelain** chosen, and a sink with words typed), certainty `preference`, so the selections documents have something to issue. No room-brief (R-004) records.
  3. Design team: `POST /api/sales/leads/:id/design-team` with `{ role: "architect", name: "BLH TEST Architect", company: "BLH TEST Studio" }`.
- [ ] Browser devtools open on Console and Network. Desktop window at least 1280 px wide unless a step says otherwise.

### Test cases

**TC-01 — Happy path (standard use)**
1. Lead B → **Project brief** → **Documents** → **Preliminary Client Project Brief** → **Preview**. Expected: **Issue to** is filled with the lead's client name.
2. Replace it with "BLH TEST Client". Expected: **Issue R01** turns off with "Recipient changed since this preview — preview again to re-check before issuing."
3. Click **Preview again** → **Issue R01**.
4. Expected result: green "Recorded R01 for BLH TEST Client — not emailed. The controlled PDF is stored permanently; download it below to send."; the preview closes; the row reads "Issued R01 · [today] · to BLH TEST Client · not emailed"; the history shows R01 **Current** with a checksum and **PDF** and **DOCX** links; the PDF opens.
5. Expected DB record: `lead_documents` row with `document_type = 'client_brief'`, `version = 1`, `revision_label = 'R01'`, `status = 'current'`, `recipient_name = 'BLH TEST Client'`, and `issued_at` and `content_sha256` set.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Lead B → **Technical Selections Schedule** (or any client-facing document) → **Preview** → clear **Issue to**.
2. Expected result: **Issue R01** is turned off with "Say who it's going to." under it.
3. Call `POST /api/register/leads/:id/documents/client_brief/issue` with `recipientName: ""` and the latest preview's `expectedVersions`.
4. Expected result: 422, "This document can't be issued yet.", `checks.errors` includes "Enter who the document is being issued to." For `architect_brief` the error is "Say who it's going to: name the architect, or type a name under “Issue to”."
5. Expected DB: no new `lead_documents` row and no new storage object.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. On Lead B issue the Technical Selections Schedule (**Preview**, **Issue R01**), then **Preview** and issue it again.
2. Double-click **Issue R01** on the second issue.
3. Expected result: one new revision only (the button is turned off while issuing). R01 is **Superseded**, R02 is **Current**, two rows, one current.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. As a portal client JWT, call `POST /api/register/leads/:id/documents/architect_brief/preview` and `/issue`.
2. As staff, try `DELETE /api/sales/leads/:id/documents/:issuedDocId` on an issued document.
3. Expected result: 403 for the client (no PDF, no lines). 409 `ISSUED_IMMUTABLE` for the staff delete, and the file still exists in storage.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. After TC-01, on a lead that has a job, check `job_events` for `register.document.issued` with the document id and `sha256`.
2. Check: the issued PDF text contains no `$` figure (other than a confirmed budget band in an architect's brief), no `{PLACEHOLDER}` text and no "undefined".
3. Check: no email was sent (mail log empty for the run) and no portal invitation exists.
4. Check: previewing alone (TC-12) created no `lead_documents` row.
- [ ] Pass  [ ] Fail

**TC-06 — Money guard**
1. On Lead B put "$4,500 allowance" in a selection's description. **Preview** the Technical Selections Schedule.
2. Expected: red "The document would contain a dollar figure — register documents never show prices or allowances."; **Issue R01** is turned off with "Fix the item in red first."
3. Remove the amount from the selection. Add "$4,500 allowance" to the Kitchen's room brief instead, then preview the Architect Design Brief. Expected: the same red entry, with **Fix** opening the room brief's record in the drawer. Remove the amount → **Preview again** → the entry is gone. (A dollar figure only blocks a document that would print it.)
- [ ] Pass  [ ] Fail

**TC-07 — Received document reconciliation**
1. Add a received engineer document (**Type** Consultant document, **Discipline** Engineer, **Revision** Rev B) → **Add received document** → **Review & link** → link a structural record → set the status to **Reconciled** → **Mark verified by this document**.
2. Expected: the linked item shows **verified** with the document number as its technical reference. The document's status is Reconciled. Before Reconciled, the row says "Mark the document reconciled to verify against it".
- [ ] Pass  [ ] Fail

**TC-08 — Card answers print**
1. Answer W-013 twice (main walls and a feature), W-014 with gutters, W-001 and a W-004 row. Preview the Client Project Brief and the Technical Selections Schedule.
2. Expected: the chosen words appear. Two wall systems are two lines. Gutters say which roof. Project defaults and room exceptions are labelled. Steep access doesn't appear as Included work.
3. Preview the Architect Design Brief. Expected: each answer prints once, in 03 while it is open or in 05 when settled (for example "Main walls", "Upper level", "Main roof"), and nowhere as a "Throughout the house" list.
4. Expected: no Blue Leaf assumption, staff note or review suggestion appears in any of them.
- [ ] Pass  [ ] Fail

**TC-09 — Tender Scope & Pricing Notes**
1. **Preview**. Expected: marked internal, **Issue to** "Blue Leaf estimating", no dollar sign, no quantity, pricing assumptions labelled, and the draft wording says so.
2. **Issue R01**. Expected: "Recorded R01 for Blue Leaf estimating. It's stored permanently for internal pricing. …"; audience internal. Change an item, preview and issue again. Expected: R02 current, R01 superseded and still opens, and its hash is unchanged.
3. Reject paths. No recipient: blocked. A dollar figure in a description: blocked. Changing the register in another tab after the preview: refused as stale. A client login: no document list and no row.
- [ ] Pass  [ ] Fail

**TC-10 — Tab 26 R05 retest follow-ups**
1. Issue any document. Expected: the row reads "Issued R0n · [date] · to [name] · not emailed" and the green message says "— not emailed".
2. Preview the **Client Selections Presentation** with one item that has nothing chosen. Expected: that item says **To be decided** once, with no "TBC" anywhere, and the reading note explains the label. Preview the **Technical Selections Schedule**: the same item says **To be decided**.
3. Mark a requirement that has words but no next action Client-approved (with evidence) while its technical check is **Needs verification**, then preview the Architect Design Brief. Expected: it is a point in **03 Needed for the next drawing issue**, ending "(agreed with the client)." with the Who of the record's owner. A performance goal (W-016) ends "(agreed with the client; for consultant review)." One parenthesis, never two.
4. Look at any two-page preview's footer (client brief or architect's brief). Expected: the document number and "Draft — not issued" on the left and "Page 1 of 2" on the right, in the same small grey type.
- [ ] Pass  [ ] Fail

**TC-11 — Client Project Brief design and identity (doc suite R01)**
1. Preview the Client Project Brief on a lead with scope, preferences and decisions. Expected: every page has the logo, "Client Project Brief" and the address at the top, and "BLB-CPB-[ref] · Draft — not issued" and "Page X of Y" at the bottom. A draft has no revision number.
2. Issue it. Expected:
   - the PDF reads **BLB-CPB-[ref]-R0n · Issued [date]** on every page, the date being today's date in Adelaide (also before 10:30 am);
   - `lead_documents.revision_label` is `R0n`;
   - on R02 or later, the box on page 1 starts "This revision replaces R0[n-1], issued [that revision's date]."; R01 and a draft don't have that line.
3. Expected content:
   - no register codes in the scope or boundary lists (they stay in the decisions table only);
   - no recorded preference listed as a decision, and no decision owner invented ("To be agreed");
   - preferences grouped by category under a header row "WHERE · [CATEGORY] · STATUS", every row naming its room (bold at the start of each room, grey after);
   - a status key under the last group that explains each status shown, including Requirement;
   - a long table repeats its header and never leaves a single row on a page;
   - the closing note never sits on a page by itself;
   - an empty section (for example no decisions) is left out and the numbers close up.
4. On a plans-supplied lead, and on a build-only lead with no plans: no PTSA and no Concept or agreement step.
   - The plans-supplied brief says "You've supplied plans for this project. We'll confirm the consultant information and any remaining details required before pricing."
   - The build-only brief says it is "proceeding on a build-only pathway" and that drawings or approvals needed are confirmed before the price. On a small job with no recorded site or structural check it names no consultant disciplines.
   - The label at the top of page 1 reads "Preliminary / Plans review" (plans supplied) or "Preliminary / Scope review" (build only), never a word about pricing.
5. Add a selection "Engineered stone benchtop" and try to issue. Expected: refused, with the reason. The Tender Notes still issue with a warning.
6. Change it and check each result:
   - "Porcelain instead of engineered stone": still refused (a selection names only what is supplied).
   - "Porcelain benchtop, 20 mm": issues.
   - Add a scope line "Existing vanity top" marked **Retain** with Product "Engineered stone": issues, with a warning that says it is not WHS clearance and that SafeWork SA must be notified before installed stone is removed, repaired, modified or disposed of.
   - Change its description to "Existing engineered stone vanity top", or add a requirement "No engineered stone in the kitchen", or a scope line "New engineered stone island benchtop": each is refused, naming the line.
7. On a new home whose rooms each say only "New [room] as shown on the concept plans", check the scope:
   - it prints one line per group of rooms, with every room named and no category label;
   - where the project description line already names a room (a double garage), there is no separate "New garage" line;
   - mark one room Altered with the description "Full renovation": it keeps its own line;
   - make the scope list long enough to run onto a second page: that page opens with "What we propose to build" again, and a boundary list that runs onto a new page opens it with its label;
   - add enough selections to the ensuite, bathroom and laundry that the bathrooms group runs onto a new page: that page opens with "WHERE · BATHROOMS AND LAUNDRY · STATUS", and its first row names its room.
8. Check site access and the drawing basis:
   - record site access as Steep and Narrow or restricted: "Site access is steep, with narrow or restricted areas.";
   - add Crane or plant access: "Crane or plant access will need to be planned for.";
   - mark the answer Client unsure: "Site access: still to be confirmed (noted so far: …)";
   - issue R01, change the drawing basis on The project step, issue R02: R02 prints the new set, and R01 still opens with the old one.
9. Give a client decision a by-when: ⚑ → **Who** Client → **By when** **Next meeting**. Preview. Expected: under **Decisions to make** its who cell reads "Client" with "By our next meeting" on the line under it. Set **Next drawing issue**. Expected: "By the next drawing issue". Pick 28 November. Expected: "By 28 Nov". A decision with no who reads "To be agreed".
- [ ] Pass  [ ] Fail

**TC-11a — Check wording (Blueprint proofread)**
1. Preview a Client Project Brief. Click **Check wording**.
2. Expected: the button reads "Checking the wording…", then a list headed "Blueprint's wording check: N suggestions" (or "Blueprint's wording check found nothing to fix.") with "Suggestions only — nothing has been changed. …".
3. Expected (if there are suggestions): the preview switches to **Highlighted copy** with each suggestion's words highlighted and its number in red after them. **Clean draft** shows the original draft.
4. Add a typo to a scope line in the register (for example "teh kitchen"), save, **Preview again**, **Check wording**. Expected: a spelling suggestion for it, highlighted on the page.
5. Edit the register on this screen without previewing. Expected: **Check wording** is turned off and the band reads "Changed since this preview". Then edit the register in a second browser tab, return, and click **Check wording**. Expected: "The register changed since this preview. Preview the draft again, then check the wording."; nothing else happens.
6. Issue the document. Expected: the issued PDF has no highlights. `ai_call_log` has a `documentProofread` row with the model and cost (about a tenth of a cent on Haiku 5.5).
- [ ] Pass  [ ] Fail

**TC-12 — Architect Design Brief (adb-2.0) on the real job**
1. Lead A → **Documents**. Expected: the **Architect Design Brief** row is tagged **This stage**, with the hint "The brief to design from, and what the next drawing issue needs." and the grey line "Draft — not issued · 3 to fix before issuing · 10 worth checking".
2. Click **Expand**, then **Preview**. Expected: "Draft R01 · from the register as it is now · previewed [time]", with **Preview again**, **Download draft PDF**, **Open in new tab**, **Check wording** and **Close**.
3. Expected red box **Can't issue yet (3)**, in this order:
   1. "Kitchen benchtop names engineered stone. It can't be supplied or installed in Australia — agree another benchtop with the client and change the record." [**Fix**];
   2. "15 new or renovated rooms have no room brief: Entry, Living, Dining, Pantry, Laundry, Bathroom, Bathroom 2, Ensuite, Bedroom, Bedroom 2, Bedroom 3, Bedroom 4, WC, WC 2, Lounge." [**Go room by room**];
   3. "Say who it's going to: name the architect, or type a name under “Issue to”." [**Name the architect**].
4. Expected amber box **Before you send (10)** with "These don't stop you issuing.". Five entries show, then **Show 5 more**. In order:
   1. "The client's vision, must-haves and budget aren't recorded. The brief leaves the first two out and says the budget is “to be confirmed by Blue Leaf”." [**Add them**];
   2. "No architect named: the brief is addressed to “The design team”." [**Name the architect**];
   3. "Every room is on the ground floor, but the cladding is recorded for the upper level and the living room mentions stairs." [**Choose upstairs rooms**];
   4. "Kitchen, Pantry and Laundry: an earlier answer disagrees with the room's work (Kitchen is Renovated; an earlier answer says “New kitchen”). …" [**Fix 3**];
   5. "5 points for the next drawing issue have no one named: …" [**Name who**];
   6. the technical check down to the client [**Fix**];
   7. "3 notes look unfinished and won't print: …" [**Fix 3**];
   8. "… says “Retain” but is marked New. It won't print until they agree." [**Fix**];
   9. "“Curved micro cement feature rangehood”: a client action that doesn't say what's needed. It won't print." [**Fix**];
   10. "3 empty answers in the Laundry print nothing: …" [**Delete all 3**] [**Review**].
5. Expected list "What will print · 37 lines" under Cover (5), 01 The project (4), 02 Site and constraints (5), 03 Needed for the next drawing issue (8), 04 Rooms (8) and 05 Selections that affect the drawings (7). There is no 06 heading.
   - Source tags: "Prepared for" is grey with a hollow dot. "Budget" is tagged **Sales** and marked amber, not grey. "Drawing basis" is tagged **The project** and "Council and zone" **Public mapping**.
   - The Living line greys only "Brief to follow.".
6. PDF page 1. Expected:
   - header "Architect Design Brief" with the suburb; kicker "Draft / Design coordination"; title "Design brief"; subtitle "Extension, Seaview Park";
   - meta rows: Prepared for "The design team", Drawing basis "DA rev 3", Project "Extension · Construction management", Document "BLB-ADB-[ref]", Prepared by "Blue Leaf Building", Status "Draft — not issued";
   - status box "Draft for review — not issued", ending "Grey text marks what Blue Leaf still has to provide; an issued brief has none."
7. Expected 01 and 02:
   - 01 reads "An extension and renovation: 16 rooms, 8 new and 8 renovated." · "Cash. Target start April 2027." · "To be confirmed by Blue Leaf." · "Natural light and space. Quality priorities: upgraded."
   - 02 opens with the italic "From public mapping and what the client told us: a guide only. Confirm against the title and a planning search." Then Council and zone "City of Seaview. Hills Neighbourhood zone.", Bushfire "In a mapped bushfire area. BAL to be assessed.", Site complexity "High.", Access, and During the works "Part of the home stays lived in."
8. Expected 03:
   - columns **No. | What's needed | Who**, with no By column;
   - the Who column reads, top to bottom: Architect, Architect, Energy assessor, Client, To be agreed ×4;
   - point 2 is "Kitchen benchtop: material still to be chosen; designer to confirm.";
   - point 3 ends "6.0 (agreed with the client; for consultant review).";
   - the last point is "Retaining and pool: are they part of this job?"
9. Expected 04:
   - "One row per room: the work, then what the room must do and contain.", with no floor bands;
   - rows Living, Kitchen, Pantry, Laundry, Bathroom, Bedroom, then "Entry, Bathroom 2, Ensuite, Bedroom 2" (Renovated) and "Dining, Bedroom 3, Bedroom 4, WC, WC 2, Lounge" (New);
   - every row but the Kitchen starts with grey italic "Brief to follow.";
   - the Kitchen reads "Feature range hood, meditrean curved micro cement, love the curves. Layout & family use: island. Storage: full-height, walk-in, drawers. Cooking & exhaust: induction."
10. Expected 05: Internal doors, Ceilings ("Square set, flat."), Upper level, Main roof (ending "By others."), Driveway, All bathrooms, Fencing, then "Paint, floor finishes, cabinetry, benchtops, splashbacks and tapware are in the Technical Selections Schedule."
11. Expected nowhere in the PDF or the list: "engineered stone", a reference code (for example `K005-…`), "New kitchen", "Retain", "stairs -", "curtain", "shouldn't", "Preferred", "Whole house", "(project default)", or a ⚠ symbol.
12. Open **Not in this brief (24) ▸**. Expected groups:
    - "In the Technical Selections Schedule instead (11)";
    - "Held back until fixed (8)", each row with a short reason;
    - "Empty (3)";
    - "Kept for the office (2)".
    No "The client's choices" or "Still open, with no one named" group shows on the real job. The group counts add up to 24. Click the Living "stairs -" row. Expected: the drawer opens with "Won't print: unfinished — ends with “-”." at the top.
13. Click lines and check the drawer:
    - **Drawing basis**: "Drawings this brief is based on" holding "DA rev 3".
    - **Council and zone**: read only, "From public mapping. It can't be edited here — re-check if the site or address changed." and **Re-check**.
    - **Site**: "From the client's details in Sales. The brief reads it each time it's previewed." and **Change in Sales ›**, with no input box.
    - A 03 point: the record row with ⚑ and ⋯, and a small "Staff reference …". No question code anywhere else.
14. Click **Only lines with a warning**. Expected: only marked lines remain. Click **Download draft PDF**. Expected: a file named "Architect Design Brief - DRAFT (not issued) - [date].pdf".
15. Expected DB: none. Previewing stores nothing (no new `lead_documents` row).
- [ ] Pass  [ ] Fail

**TC-13 — Technical Selections Schedule and Client Selections Presentation (tss-1.0, csp-1.0)**
1. On a lead at Consultants with client selections, add a received **Supplier schedule / quote** (Discipline Routleys). Then **Set as source** on two selections and enter their product, maker, code and quantity.
2. Preview the **Technical Selections Schedule**. Expected:
   - A4 landscape, header TECHNICAL SELECTIONS SCHEDULE on every page, document BLB-TSS-[ref];
   - the two rows show the product, "maker · Routleys · code", the quantity and source **S1**, flagged **Source not yet reviewed** while the document is Received;
   - **Source documents** lists S1 with "No revision printed" if none was entered.
3. Set the document to **Superseded** and preview again. Expected: the rows say **Source superseded**, the red box names the record, and the issue is refused. Link the records to a current document. Expected: the error clears.
4. Preview the **Client Selections Presentation**. Expected: A4 portrait, BLB-CSP-[ref]; no Ref column, no code, no S1, no "To verify". Each item marked Proposed is asked about once in the intro to **What we need from you**, not once per row.
5. Issue the presentation, then look at the technical schedule's history. Expected: the presentation is R01 of its own, and the technical schedule's current revision is unchanged.
6. Open the **Routleys pack**. Expected:
   - its kicker reads "Coordination request: Routleys (plumbing fixtures)", and it lists only Routleys items;
   - section 03 reads **What we need from Routleys** and holds only actions owned by Trade / supplier;
   - the client's and Blue Leaf's open items are under **Waiting on others**, for information.
7. Give a kitchen sink and mixer client labels, and a Rylock record a client description. Preview the presentation. Expected: "Kitchen sink" and "Kitchen mixer"; the client description in place of the supplier's line; no room named twice in a group heading. Set the Rylock document to **Under review**. Expected: its products read **Being confirmed**, with the client's own words.
8. Give a Routleys action a by-when: ⚑ → **Who** Trade or supplier → **By when** Next drawing issue. Preview the schedule and the Routleys pack. Expected: the action's who cell reads the who with "By the next drawing issue" on the line under it. **Next meeting** reads "By the next meeting", and a date reads "By 28 Nov".
- [ ] Pass  [ ] Fail

**TC-14 — The room-brief rule blocks the architect's brief**
1. Lead B → **Documents**. Expected: the Architect Design Brief row reads "Draft — not issued · 1 to fix before issuing · 1 worth checking" (the amber one is the missing budget).
2. **Preview**. Expected:
   - red **Can't issue yet (1)**: "2 new or renovated rooms have no room brief: Kitchen, Bedroom 2." [**Go room by room**];
   - **Issue to** reads "BLH TEST Architect, BLH TEST Studio";
   - **Issue R01** is turned off with "Fix the item in red first.";
   - 01 reads "A renovation: 3 rooms, 1 new, 1 renovated and 1 with no change.";
   - 04 shows Kitchen "Renovated · Brief to follow." and Bedroom 2 "New · Brief to follow." (both red-marked), and Living "No change" with no mark;
   - 06 Outside this job reads "Rooms not in this job: WC.".
3. Click **Go room by room**. Expected: the drawer opens on the Kitchen.
4. Type "Family kitchen with an island facing the garden" in **What must this room do?** and click outside the box. Expected without a preview:
   - the Kitchen line reads "Renovated Family kitchen with an island facing the garden." with a **changed** tag and no red mark;
   - the red box still shows its entry;
   - the PDF band reads "Changed since this preview" (text only while the drawer is open);
   - **Issue R01** reads "Preview again to issue what you see.".
5. Click **Next room without a brief ›**. Expected: Bedroom 2.
6. Tap **Nothing special — standard room**. Expected: the box reads "Standard bedroom; no special requirements.". The footer now offers **Next warning ›**.
7. Click **Preview again** in the drawer's footer. Expected: no red box, **Issue R01** turned on, and the PDF's 04 has no "Brief to follow".
8. Change Bedroom 2's sentence to "Big enough for a queen bed -". Expected: "Looks unfinished — it won't print until it's finished." and the line returns to "New · Brief to follow." with a red mark. **Preview again**. Expected: red "1 new room has no room brief: Bedroom 2."
9. Click the Living line → set **Work** to **Altered** → **Preview again**. Expected: "2 new or altered rooms have no room brief: Bedroom 2, Living."
10. While red, call `POST /api/register/leads/:id/documents/architect_brief/issue` with the latest `expectedVersions`. Expected: 422 "This document can't be issued yet." with the room-brief sentence in `checks.errors`, and no new `lead_documents` row.
11. Set Living back to **No change**. Finish Bedroom 2: "Big enough for a queen bed and a desk." **Preview again**. Expected: no red box.
12. Expected DB: `leads.selections_schedule` holds one R-004 record per room with work (Kitchen, Bedroom 2) with the typed `description`. Living and WC have none.
- [ ] Pass  [ ] Fail

**TC-15 — A fix in the drawer clears its warning live, then Preview again**
1. Lead A → Architect Design Brief → **Preview**. Note **Before you send (10)**, "What will print · 37 lines" and "Not in this brief (24)".
2. Click **Show 5 more** → **Fix** on "“Curved micro cement feature rangehood”: a client action that doesn't say what's needed. It won't print."
3. In the drawer, change what the action says to "Confirm the curved micro cement rangehood design with the client" and click outside the box.
4. Expected without a preview:
   - **Before you send (9)**, with that entry gone;
   - "What will print · 38 lines", with a new point in 03 ending "confirm the curved micro cement rangehood design with the client. · Client" and a **changed** tag;
   - **Not in this brief (23)**, with "Held back until fixed (7)";
   - **Download draft PDF** now reads "Preview again to download"; **Check wording** is turned off; **Issue R01** reads "Preview again to issue what you see.";
   - the red box still shows (3).
5. Click **Next warning ›** in the drawer's footer. Expected: the drawer moves to the next marked line without closing.
6. Click **Preview again** in the drawer's footer. Expected:
   - the drawer stays open;
   - the PDF's 03 has nine points, with the new one in the Client group;
   - the stale band is gone and **Download draft PDF** is back;
   - the time on the title line updates;
   - the red box is re-checked and still shows (3).
7. Click a Kitchen line in 04 → **Open the full room ›**. Expected: "This closes the preview — open the Kitchen?". Click Cancel. Expected: the preview stays.
8. Press **Esc**. Expected: the drawer closes.
9. Expected DB: in `leads.selections_schedule` the W-025 action record (i46) has the new `description`. No `lead_documents` row.
- [ ] Pass  [ ] Fail

**TC-16 — The budget band**
1. Lead B → Architect Design Brief → **Preview**. Expected: amber "The client's budget isn't recorded. The brief says the budget is “to be confirmed by Blue Leaf”." [**Add them**]. The line reads "Budget: To be confirmed by Blue Leaf." tagged **Sales**, marked amber, not grey.
2. Click the **Budget** line. Expected: the drawer shows **Construction budget (ex GST)** with the chips Under $400k · $400k–$600k · $600k–$800k · $800k–$1m · $1m–$1.5m · Over $1.5m and **Exact…**, the **Confirmed with the client** control, and "Saved to the client's details — Sales shows the same."
3. Tap **$800k–$1m**. Expected:
   - "Saved ✓";
   - the amber entry becomes "The budget isn't marked “Confirmed with the client”, so the brief says it is to be confirmed by Blue Leaf." [**Confirm the budget**];
   - the line still reads "To be confirmed by Blue Leaf.".
4. Tick **Confirmed with the client**. Expected: the amber entry goes, and the line reads "Budget: $800k–$1m construction budget, ex GST (the client's figure)." with no mark.
5. **Preview again**. Expected: the PDF's 01 Budget row prints that sentence, and no dollar-figure entry is in the red box.
6. Open **Exact…** and type From 900k and To 800k. Expected: "The From amount is more than the To amount." and nothing saved. Call `PATCH /api/sales/leads/:id` with `construction_budget_min: 1200000` only (the stored upper figure is 1,000,000). Expected: refused, "The budget's lower figure is more than its upper figure (…). Change the upper figure first. Nothing was saved."
7. Preview the Client Project Brief. Expected: no dollar figure and no dollar-figure entry.
8. Issue the Architect Design Brief R01 to BLH TEST Architect, BLH TEST Studio. Expected: it issues. The PDF prints the band, and `source_snapshot.fixture.architectBrief.budgetBand` is the same sentence.
9. Untick **Confirmed with the client** → the line returns to "To be confirmed by Blue Leaf." at once.
10. Expected DB: `leads.construction_budget_min = 800000`, `construction_budget_max = 1000000`, and `wo_budget_confirmed = 'Yes'` while ticked.
- [ ] Pass  [ ] Fail

**TC-17 — Issue R01 once red is clear (real job)**
1. Lead A (after TC-15 and TC-18) → Architect Design Brief → **Preview**. Expected: red (3), and **Issue R01** turned off with "Fix the 3 items in red first."
2. Red 1 → **Fix**. Expected: the benchtop record with the full guidance under it and the chip **Engineered stone · not allowed**. Tap it, then tap **Porcelain**. Expected: the benchtop's red mark on its line goes at once.
3. Red 2 → **Go room by room**. Give each of the 15 rooms a sentence, or tap **Nothing special — standard room**, using **Next room without a brief ›**. On Living, replace "stairs -" with a finished sentence. Expected: the button walks 15 rooms, then becomes **Next warning ›**, and no room line is red-marked.
4. Red 3 → **Name the architect** → **+ Add someone new** → Name "BLH TEST Architect", Firm "BLH TEST Studio" → **Save**. Expected: "BLH TEST Architect — BLH TEST Studio" with **Change**, "Saved ✓", and "Saved to the client's contacts — Sales shows the same."
5. **Preview again**. Expected:
   - no red box;
   - **Issue to** reads "BLH TEST Architect, BLH TEST Studio";
   - the amber box is still there (it never blocks);
   - **Issue R01** is turned on with no reason line;
   - the cover reads "Prepared for: BLH TEST Architect, BLH TEST Studio" and no line is grey.
6. Click **Issue R01**. Expected:
   - "Recorded R01 for BLH TEST Architect, BLH TEST Studio — not emailed. The controlled PDF is stored permanently; download it below to send.";
   - the row reads "Issued R01 · [today] · to BLH TEST Architect, BLH TEST Studio · not emailed";
   - the history shows R01 **Current** with a checksum.
7. Open the issued PDF. Expected:
   - kicker "Design coordination"; status box label "Design brief" with no "Grey text marks …" sentence;
   - meta Status "R01 · Issued [date]"; footer "BLB-ADB-[ref]-R01 · Issued [date]" and "Page X of Y";
   - no "Brief to follow" anywhere, and every 04 row has its sentence;
   - architect points in 03 name "BLH TEST Studio" in the Who column.
8. Expected DB:
   - a `lead_documents` row with `document_type = 'architect_brief'`, `version = 1`, `revision_label = 'R01'`, `status = 'current'`, `recipient_name = 'BLH TEST Architect, BLH TEST Studio'` and `content_sha256` set;
   - `source_snapshot.fixture.architectBrief.model = 'adb-2.0'`, its `lines` each carry `ids`, and no room line has `placeholder: true`;
   - a `crm_contacts` row for BLH TEST Architect, and `leads.architect_name` set;
   - no email sent.
9. **Preview** again, then change any record of Lead A in a second browser tab. Back in the first tab click **Issue R02**. Expected: "The brief changed since you previewed it — nothing was issued. Re-open the preview to see the current version, then issue again.", the preview closes, and no new row. (If the first tab already shows "Changed since this preview" with **Issue R02** turned off, that also passes.)
10. **Preview** and **Issue R02**. Expected: R01 **Superseded** (still opens, hash unchanged), R02 **Current**, and R02's status box starts "This revision replaces R01, issued [date]."
- [ ] Pass  [ ] Fail

**TC-18 — Empty answers: Delete all and Undo**
1. Lead A → Architect Design Brief → **Preview** → **Show 5 more**. Expected: "3 empty answers in the Laundry print nothing: …" with **Delete all 3** and **Review**.
2. Click **Review**. Expected: the drawer lists the three Laundry records, each under "From Laundry: …". Close it.
3. Click **Delete all 3**. Expected: under the entry, "Delete 3 empty Laundry answers? They hold nothing." with **Delete** and **Cancel**, and Cancel selected. Click **Cancel**. Expected: nothing deleted.
4. Click **Delete all 3** → **Delete**. Expected:
   - "Deleted 3 empty answers." with **Undo**;
   - the amber box drops by one entry;
   - "Not in this brief" drops by three and the Empty group goes;
   - the PDF shows "Changed since this preview".
5. Click **Undo** within 6 seconds. Expected: the three records come back under their own ids (`i62`, `i63`, `i64`) and the entry returns.
6. Open **Review**, tap a chip on (or type into) one of the three, and close the drawer. Expected: the entry now reads "2 empty answers …" with **Delete all 2**. Click it → **Delete**. Expected: "Deleted 2 empty answers." and the answered record is kept.
7. Expected DB: after the save, the deleted records are gone from `leads.selections_schedule` and the answered one remains.
8. Linked-record path: on a fresh Lead A, add a received document (21-03 K) and link it to `i64` (**Review & link**, without **Set as source**). Preview again. Expected: the entry reads "2 empty answers in the Laundry print nothing: …" with **Delete all 2**; `i64` is never offered or deleted.
- [ ] Pass  [ ] Fail

**TC-19 — Widths: Hub column, Expand and phone**
1. Desktop 1280 px, project brief not expanded. Lead A → Architect Design Brief → **Preview**. Expected: the switch **What will print | PDF**, with **What will print** selected. **PDF** shows the frame.
2. Click **⤢ Expand**. Expected: two panes, the PDF on the left and the line list on the right. **Exit full width ✕** returns.
3. Resize to a phone (390 px wide), reload and **Preview**. Expected:
   - the rows "Can't issue yet · 3 ›" and "Before you send · 10 ›", each opening a sheet with the same entries and buttons;
   - no PDF frame;
   - a sticky bar with **Download draft PDF** and **Open PDF** above the app's navigation;
   - the issue box at the end of the list.
4. Tap a line. Expected: the drawer opens from the bottom at about 90% of the screen. The text boxes are 16 px (no zoom on iOS). Make a change. Expected: the bar's button reads "Preview again to download".
5. Reset the window to desktop.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (no request left loopback)
- [ ] Database records created with correct field values
- [ ] BLH TEST leads left for the test-artifact cleanup policy (issued documents are never deleted)
- [ ] Update `test_status` in the front matter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
