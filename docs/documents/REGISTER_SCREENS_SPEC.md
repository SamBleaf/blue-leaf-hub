# Register and architect's brief: screen spec (proposal, not built)

16 November 2026. The owner agreed the review's direction (`REGISTER_TO_DOCUMENTS_REVIEW.md`) and asked to see the screens before anything is built.

**How this spec was made**
- Three engineers read the register code: rooms and scope; the project story, site and consultants; actions, click-to-edit and checks.
- Three designers worked from different angles: onsite speed, output-first and meeting flow.
- A design lead scored the three and merged them into this spec.
- The screens were then drawn on a design canvas from this spec. Each group of screens was reviewed independently and fixed.

**Canvas (private):** https://claude.ai/artifact/8NtM41a5B8UDCzJLa5Y6fb
- Each row puts today's screen beside the proposal.
- The six owner decisions are on the canvas notes and at the end of this file.

**Sample data:** the real job from the review (BLA67068), with client details removed.

## Corrections found while drawing (these override the text below)

Screen heights, measured from the drawn screens (the estimates in the spec below are lower):

| Screen | Today | Drawn | Note |
|---|---|---|---|
| The project | ~2,280 px | ~2,400 px | About the same length, but it now holds the story, budget, site and design team; the room table moved to Rooms |
| The Kitchen on a tablet | ~2,500 px | ~1,650–1,700 px | With "How this reads" collapsed |
| The Kitchen on a phone | ~3,800 pt | ~2,150–2,200 pt | |

Changes made to the screens:
- **S2 (Rooms):**
  - The summary reads "8 new · 8 renovated". The "Brief needed" filter already carries the count.
  - "+ Add room here" shows on the floor header only when the job has 2 or more floors.
  - In tick mode, line 2 of each row is hidden, except an "Unfinished" tag.
- **S3 (A room):**
  - The room bar has no ‹ › buttons, because the sticky footer already names the previous and next rooms.
  - On a room screen the save state lives in the room bar, not the header.
  - Dates show the Adelaide day, so the house strip reads "✓ Confirmed 16 Nov".
- **S4 (Needs action):**
  - The sheet's footer ("Checked" · "Clear") appears only once an action is set.
  - The by-when pill shows only when a by-when is set.
- **S5 (Documents):** while the edit drawer is open, the stale band is text only and "Preview again" sits in the drawer footer.
- **S6 (the brief):**
  - Only gaps that block issue print in grey.
  - Lato only, no Playfair, as for the rest of the document suite.
  - "Surfmist" is capitalised.

Onsite speed: simplicity and taps 5 · brief model 4 · data integrity 4 · feasibility 3 · copy 4 · fixes the evidence 5 (25/30).
Output-first: simplicity and taps 3 · brief model 5 · data integrity 4 · feasibility 3 · copy 3 · fixes the evidence 5 (23/30).
Meeting-flow: simplicity and taps 4 · brief model 4 · data integrity 5 · feasibility 4 · copy 5 · fixes the evidence 4 (26/30).

The onsite design is the base. Simplicity and taps onsite is the owner's top priority, and that design has the flattest room screen (one-line choice rows, a visible ⚑ for Needs action, office detail behind ⋯) and the fewest taps. Meeting-flow scored highest overall on integrity and copy, so I took four things from it whole: its storage choices, its plain wording, its inline add-rooms panel and its 'Checked needs a reference' rule. From output-first I took the budget band chips, the 'Not in this brief' list with reasons, fixing levels by ticking rooms on the list itself, hiding the engineered-stone chip, and one shared brief-model module. That module feeds the PDF, the 'What will print' list, the Actions panel and each room's 'How it reads' line, so what staff see is what prints. The room's single Work setting is the only scope that prints, and the Actions list uses exactly the rule that fills the brief's numbered next-issue list, so contradictions, empty rooms and orphan actions can't reach the page. C1 to C5 need no new database columns and no migrations: two new item fields carried like the answer field, two answer keys, and one new room-scope value added in two steps.

Conflicts resolved:
1. Room layout. Rejected output's two-column room with a live panel and meeting's right rail. The room is one column at every width; the printed row is a collapsed line under the brief.
2. Work words. Rejected meeting's four words. Five values (New · Renovated · Altered · No change, plus 'Not in this job' behind ⋯); Altered arrives in a two-step release. 'No change' replaces 'Stays as is' and 'Existing — Remain'.
3. Who. Rejected onsite's actionWho, which would be a second copy of the owner. responsibility stays the only 'who'; a new actionRole is set only when the who is a consultant (engineer or energy assessor). Plus actionDue.
4. By when. Dropped 'This week'. Choices are Next drawing issue · Next meeting · Pick a date, with a default set by who.
5. Open-points list. Replaced 'Open points 10', 'Follow-ups 7' and 'Actions 1 + suggestions' with one 'Actions' list. It uses the brief's next-issue rule, is grouped by who in print order, and shows rows with no one named with inline who chips.
6. Needs action. Stays a visible ⚑ on every row (onsite), not inside ⋯ (meeting), so it takes 2 taps.
7. House choices in a room. Rejected onsite's lifted rows that create exceptions. One 'Same as the rest of the house' strip; an open or blocked house line shows inside it and opens the house record itself.
8. Adding rooms. Meeting's inline panel: the work word is chosen once, there is no silent 'Renovated' preset, and each chip adds a room.
9. Fixing levels. Tick mode on the Rooms list itself (output), not a separate sheet.
10. Budget. Band chips plus 'Exact…'. The band prints only if the owner agrees (question 1) and 'Confirmed with the client' is ticked.
11. Checks. Two boxes, not three. Red 'Can't issue yet' holds the legal and safety rules, the recipient, the drawing basis and the agreed room-brief rule, each saying why. Amber never blocks. A missing vision or must-haves only warns (question 2).
12. Gaps on paper. Only neutral words print, in grey and only in drafts: 'Brief to follow', 'Budget: to be confirmed by Blue Leaf', 'Prepared for: The design team'. Required gaps block issue, so they never appear on an issued brief. Missing story lines are left out. Contradictions, fragments and empty records never print. The benchtop line prints why it's open, never the stone.
13. Rejected output's 'Prints in:' tags on every card: they repeat system terms.
14. Not adopted: meeting's agenda card (a one-line gap strip replaces it) and swiping between rooms.
15. The brief has six sections, each printed only when it has content. There is no 'Throughout' section: its items print once, in 03 or 05.
16. Tabs: The project · Rooms · Throughout · Site & existing · Documents | Register · Tender.


## S1 The project (Project step)  [Tablet and desktop: Hub column 754 px, and Expand (content max 760 px, centred). Phone (390 pt) rules at the end of layout.]  covers: C3, C6, site and planning constraints, drawing basis, A3 gaps shown where they are fixed

### purpose
In a meeting: record the client's story and budget in their words, see what public mapping says about the site, name the architect and set the drawing basis, all on one screen. The gaps that would weaken the architect's brief show at the top.

### whatChangesFromToday
- The read-only 'On file in Sales — not re-entered here' grid with P-codes (ContextStep.jsx:79-113) becomes one editable card, 'The client's story'. Today that grid reads 'Not on file' for this job and points to Sales fields that are hidden at the Consultants stage (LeadDetail.jsx:1730-1733). The new card saves straight to the lead, the only copy, through the existing patchLead (RegisterWorkshop.jsx:117 → PATCH /api/sales/leads/:id). The same release adds 'consultants' to LeadDetail.jsx:1730-1733, so Sales shows the same fields.
- Site lookup results move here, read-only and in plain words. Today they appear only in the Site step strip (SectionStep.jsx:90-104) and print nowhere.
- 'architect: —' (ContextStep.jsx:104) becomes a Design team card with 'Name the architect'.
- 'Project setup' is folded in:
  - drawing basis → Drawings card;
  - occupancy → one control in Site and planning (Site's W-007 is folded into it);
  - delivery model → identity line;
  - the 'Existing-building prompts' checkbox follows the project type, with an office override in the register ⋯ menu.
- The 16-row room table (ContextStep.jsx:135-164) moves to Rooms (S2). 'Areas in the project' (P-006) moves to Site & existing. 'Decisions before next milestone' (P-009) is replaced by Needs action (S4) and shows only if it already holds a record.
- No P-codes and no 'Sales fact (lead)' (ContextStep.jsx:25,117,120,123).
- Height: about 1,500 px on desktop (today about 2,280 px with the room table) and about 1,600 pt on a phone (today about 3,750 pt).

### layout
SHARED FRAME (every register step; replaces today's header rows)
F1 Header, 56 px, white, hairline bottom border.
- Left: 'Project brief' (13 px bold, primary), with a 12 px muted subline.
- Right, in order:
  - save state, 12 px (accent 'Saved 9:35 pm' / warning 'Saving…' / red 'Not saved — retrying');
  - [Save], unchanged;
  - pill [Actions 10], 32 px, hairline border, with an amber dot when any open point has no one named (opens the S4 panel);
  - [⤢ Expand], desktop and tablet only;
  - 'Collapse' link.
F2 Step tabs, 44 px.
- Capture tabs: The project · Rooms · Throughout · Site & existing · Documents.
- Then a 1 px divider and the office tabs Register · Tender, in muted text.
- Active tab: primary fill, white text, rounded-lg.
- Phone: the row scrolls sideways and the active tab scrolls into view.
- The 'Show detailed prompts' checkbox and the '40 outstanding ▾' bar no longer appear on capture tabs.

S1 BODY
General styling:
- single column, 16 px gutters, 12 px between cards;
- cards white, hairline border, rounded-card 12 px, padding 16;
- card titles 16 px semibold ink; field labels 13 px muted;
- inputs 15 px (16 pt on phone, so iOS doesn't zoom), at least 44 px tall.
Gap style, for an empty field the brief needs: a 3 px warning (#D4A24C) left rule on the input and a 12 px dark-warning caption under it.

Regions, top to bottom:
- R1 Gap strip (only while gaps exist): full width, at least 48 px tall, warning at 12% tint, 1 px #D4A24C border, radius 12. Left: one sentence, each gap an underlined link. Right: the count, 13 px.
- R2 Identity line: 36 px, 13 px muted, one line, items separated by ' · '. Delivery model is dotted-underlined (tappable). Right: text link 'Change in Sales ›'.
- R3 Card 'The client's story'.
  - Header: title on the left, 12 px muted caption on the right.
  - Fields, 12 px apart:
    - (a) textarea, 3 rows;
    - (b) textarea, 3 rows;
    - (c) textarea, 2 rows;
    - (d) chip row, at most 3 chosen (40 px chips, wrapping), plus a muted 'Noted earlier' line with a text button.
  - Hairline divider, then the subheading 'Budget and timing' (14 px semibold).
    - (e) budget band chip row (40 px). 'Exact…' opens two currency inputs inline (50/50, numeric keypad).
    - (f) toggle chip, on its own row.
    - (g) chip row.
    - (h) two selects side by side: month 160 px, year 120 px.
  - Footer: one text link.
- R4 Card 'Site and planning'.
  - Title, with a 12 px muted caption under it and a 'Re-check' text button on the right.
  - Definition grid: label column 150 px, values 14 px ink, 40 px rows, 6 rows.
  - Then a label and a full-width 3-segment control (44 px).
  - Then one muted line holding an earlier note, with a text button.
- R5 Card 'Design team'.
  - 56 px rows separated by hairlines: role label (150 px) · value or empty state · action button on the right.
  - Final row: '+ Another consultant'.
  - A muted 'Noted earlier' line, then a 12 px footnote.
- R6 Card 'Drawings': one input (280 px) and a caption with a link.
- R7 Collapsed 48 px row 'Who does what (construction management) ▸'. It holds the existing management questions, unchanged, closed by default.

PHONE (390 pt)
- R1 becomes a sticky 44 pt line under the tabs: '4 gaps for the architect's brief ›', which opens the list.
- R2 wraps to 2 lines.
- R3 shows (a), (b), (e) and (h). The rest sit behind 'More about the client (4) ▸' (44 pt).
- R4 collapses to one 56 pt summary row, 'City of Marion · Hills Neighbourhood · Bushfire area · High complexity ›', which opens the full card as a bottom sheet. The 'During the works' control stays visible under it.
- R5 shows only the Architect row, plus 'Engineer, energy assessor and others ›'.
- R6 is a single row.

### content
F1:
- 'Project brief'
- subline 'Extension · Seacliff Park · Drawings DA rev 3 · 16 rooms'
- 'Saved 9:35 pm' · [Save] · [Actions 10 •] · [⤢ Expand] · 'Collapse'
F2: The project (active) · Rooms · Throughout · Site & existing · Documents | Register · Tender

R1: 'Still missing for the architect's brief: the client's vision · must-haves · budget · the architect's name'. Right: '4 gaps'.

R2: 'Client · Site address, Seacliff Park · Extension · Construction management · PTSA draft', with the link 'Change in Sales ›'. The live screen shows the real client name and address.

R3 'The client's story'. Caption: 'Saved to the client's details — Sales shows the same'.
(a) 'What they want, in their words'
- Empty. Placeholder: 'Write it the way they said it.'
- Gap caption: 'Not recorded — the architect's brief opens with this.'
(b) 'Must-haves'
- Empty. Placeholder: 'One per line — what the design can't do without'.
- Gap caption: 'Not recorded.'
(c) 'What worries them'
- Empty. Placeholder: 'Their biggest concern about the build'.
- No caption (optional).
(d) 'Top priorities (pick up to 3)'
- Chips: Space · Natural light · Comfort · Privacy · Entertaining · Storage · Accessibility · Low maintenance · Energy use. None ticked.
- Muted line: 'Noted earlier: Natural light, Space', with 'Use these'.
Subheading 'Budget and timing':
(e) 'Construction budget (ex GST)'
- Chips: Under $400k · $400k–$600k · $600k–$800k · $800k–$1m · $1m–$1.5m · Over $1.5m · Exact…. None chosen.
- Gap caption: 'Not recorded — the brief will say “to be confirmed by Blue Leaf”.'
- 'Exact…' opens '$ From' and '$ To'.
(f) Toggle chip 'Confirmed with the client': off.
(g) 'Paying by': Cash ✓ · Need finance · Pre-approved · Unsure.
(h) 'Target start': [April ▾] [2027 ▾].
Footer link: '+ What they're most excited about'.

R4 'Site and planning'. Caption: 'From public mapping — a guide only. Check before relying on it.' Button: 'Re-check'.
- Council — City of Marion
- Planning zone — Hills Neighbourhood
- Bushfire — warning-tint chip 'In a mapped bushfire area', then 'BAL to be assessed'
- Slope — 'Not known' (muted)
- Site complexity — High
- Access — 'Standard driveway' (link)
'During the works': Moving out · Partly lived in ✓ · Living there.
Earlier-note line: 'Earlier note: “not sure if they want to live in - shouldn't -”', with 'Tidy up'.

R5 'Design team'.
- Architect — 'Not named' in warning colour — outline primary button 'Name the architect'
- Engineer — muted 'Not named' — '+ Add'
- Energy assessor — muted 'Not named' — '+ Add'
- '+ Another consultant'
- Muted line: 'Noted earlier: “client architect - and blue leaf aid”', with 'Edit'.
- Footnote: 'The architect's brief is addressed to the architect. Until one is named it says “The design team”.'
Name-the-architect sheet:
- Title 'Name the architect'.
- Search box 'Search people and firms'. Results appear after 2 letters, as 56 px rows 'Name · Firm · role'.
- Last row '+ Add someone new' opens Name (required), Firm, Email and Phone, with [Save].
- Footnote: 'Saved to the client's contacts — Sales shows the same.'
- After a pick, the row reads '<Name> — <Firm>', with ⋯ (Change · Remove from this job).

R6 'Drawings'.
- Label 'Drawings this brief is based on'. Value: 'DA rev 3'.
- Caption: 'No drawing files with Blue Leaf yet · Upload in Files ›'.

R7: 'Who does what (construction management) ▸'.

### interactions
Saving the story fields
- Text fields save 1.2 s after the last keystroke, or on blur, through patchLead.
- An inline 'Saved ✓' shows for 2 s, and the register context reloads so every step reads the new value.
- If the save fails: red 'Not saved — try again' under the field. The typed text is kept.

Gaps
- A gap link scrolls to its field and focuses it (the iPad keyboard opens).
- A gap leaves R1 as soon as its field saves. R1 hides at zero.

Budget
- One tap on a band chip writes both min and max for that band. A second tap clears both.
- 'Exact…' opens From and To.
- An existing range that matches no band shows as a selected chip 'Exact: $… – $…'.

Priorities
- 'Use these' ticks the chips whose labels match the earlier words, and removes the matched words from the note. Words that don't match stay.

Identity line
- Delivery model opens a 4-option popover: Design & build · Build only · Construction management · Other. It saves through the existing facts endpoint.
- Project type can be edited only while blank, as today.
- 'Change in Sales ›': on desktop it focuses the lead's details card (focusLeadControl); on a phone it opens the Summary tab.

Site and planning
- Council, zone, bushfire, slope and complexity have no edit control.
- 'Re-check' shows 'Checking public mapping…', then 'Updated 16 Nov'.
- If the lookup fails: 'Couldn't reach the mapping service. Nothing changed.'
- A null bushfire value reads 'Not confirmed', never 'not bushfire-prone'.
- 'Standard driveway' opens the Site & existing access question in the edit drawer.
- 'During the works' saves on tap.
- 'Tidy up' opens the earlier W-007 record in the edit drawer, to reword it or remove it ('Remove this note?' confirm).

Design team
- 'Name the architect': picking a contact saves at once. The gap, the Documents recipient default and 'Prepared for' update immediately.

After the PTSA (once a job exists)
- The story, budget, paying-by and start fields still save to the lead.
- Project type, estimated value, delivery model and architect save through the job's facts service.
- Nothing changes on screen.

Read-only users see the values with no inputs.

### taps
Vision: 1 tap plus typing. Today it can't be done at this stage: the Sales field is hidden (LeadDetail.jsx:1730-1733), and the register shows it read-only.

Budget band: 1 tap, plus 1 for 'Confirmed'. Today this can't be done here.

Priorities from the earlier words: 1 tap.

Naming the architect:
- contact already exists: 2 taps plus 2–3 letters;
- new contact: 2 taps plus 4 fields.
- Today you leave the register and scroll to the roster, and the contact must already be in the CRM. Even then the brief prints 'Architect' (registerContext.mjs:101-102).

Whole story at a Discovery meeting (vision, must-haves, budget, paying by, start): 6 taps and 2 typed lines, with no navigation.

### dataMapping
Lead columns, all written only via patchLead (PATCH /api/sales/leads/:id) and read through loadRegisterContext (registerContext.mjs:85-95). Register them as Lead-spine facts in jobFactRegistry and dictionary §11. The register keeps no copy, and they stay on the lead after conversion.
- Vision → leads.wo_client_vision
- Must-haves → leads.key_requirements
- What worries them → leads.wo_biggest_concern
- Excited about → leads.wo_most_excited_about
- Budget band / Exact → leads.construction_budget_min and leads.construction_budget_max. The bands are $400k steps written as numbers, ex GST.
- Confirmed with the client → leads.wo_budget_confirmed
- Paying by → leads.finance_status (LEAD_FINANCE_STATUS_LABELS, constants.js:392-397). Add server-side validation of the value.
- Target start → leads.desired_start_date (this job: 2027-04-01)

Register records and meta:
- Top priorities → register record P-005 (sample i26). Chips write answer.selected; the 'Noted earlier' words are i26.description.
- During the works → meta.occupancy, using the existing options (ContextStep.jsx:123-125); this job is 'partly'. The earlier note is W-007 (i12), which is hidden on the Site step unless it has a record.
- Access → W-001 (i69).
- Design team note → M-001 (i25).
- Drawing basis → meta.planRev ('DA rev 3'). The file hint comes from context.drawings (none).

Identity line and job facts:
- Identity line → context.identity, projectType, deliveryModel and commercial.ptsaStatus.
- Delivery model is written via PUT /api/register/leads/:leadId/facts → setDeliveryModel (registerContext.mjs:118-130).
- Before a job exists, project type and estimated value go through patchLead. After it exists they go through the same PUT …/facts, extended to accept projectType and estimatedValue → setFact. This fixes today's write-lead/read-job bug (registerContext.mjs:80,87).

Site rows → context.site (job or lead): council, zone, bushfire, slopeBand and complexity. These are generated and display-only. 'Re-check' → POST /api/geo/enrich/leads/:id.

Design team:
- Written through a new non-admin POST /api/sales/leads/:id/design-team. It creates the crm_contacts row if needed, upserts a lead-scoped job_contact_roles row and adds the consultant_roster entry.
- Read back through loadRegisterContext, with the roster/roles merge fixed (registerContext.mjs:101-102).

## S2 Rooms (the list, grouped by floor; includes 'Choose upstairs rooms' tick mode)  [Tablet and desktop: Hub column 754 px and Expand. Phone rules at the end of layout.]  covers: C1 (one Work word per room), C4 (floors and the bulk fix), C2 status ('Brief needed'), C5 action counts, A3 warnings in place

### purpose
See every room in walk order, grouped by floor, with what is happening to it, whether it has a brief and whether anything is open. Add, duplicate, move and re-floor rooms quickly while walking the plans with the client. The Rooms tab now opens on this list.

### whatChangesFromToday
Today the room list is a 16-row form on the Project step (ContextStep.jsx:135-164). Each row has a free-text level box (w-20), name, type select, scope select, 'Sheet / rev', an item count, 'Open' and ×. Problems with it:
- The 'Add on level' box resets to 'Ground' on every visit (ContextStep.jsx:34).
- Every new room on an extension is silently preset to 'Renovated' (ContextStep.jsx:59).
- Nothing shows whether a room has a brief.
- The Rooms tab opens straight into a room, with a dropdown picker (RoomsStep.jsx:75-88).

New:
- Floors become groups, chosen from chips.
- Work is one tappable pill per room, and it is the only scope control.
- Each row shows a brief preview or 'Brief needed'.
- A disagreeing earlier answer shows as 'Check work'.
- Rooms are added from an inline panel, with the Work word chosen once.
- 'Choose upstairs rooms' turns the list into tick boxes.
- Type and drawing sheet move to the row's ⋯ menu.

### layout
R1 Title row, 56 px.
- Left: 'Rooms' (18 px semibold), with a summary under it (13 px muted).
- Right: primary '+ Add room' (44 px). It opens the add panel on the first floor group.

R2 Floor banner. Shown only while every room is on one floor but records mention an upper level or stairs.
- Warning tint, radius 12, padding 12.
- One sentence, then two buttons side by side (44 px): secondary 'Choose upstairs rooms' and text 'Not now'.

R3 Filter: segmented control, 40 px, full width, 3 segments.

R4 One block per floor.
- Group header, 40 px, sticky inside the list, page background: floor name (13 px uppercase muted, letter-spaced) and count. Right: '+ Add room here'.
- Inline add panel (opens under the header, white, radius 12, padding 12):
  - Line 1: 'Add to Ground floor as' plus a 4-segment control [New] [Renovated] [Altered] [No change], 44 px. Nothing is preselected the first time; the choice is remembered for the session.
  - Line 2: room chips, 40 px, wrapping. They are muted and disabled until a Work word is chosen.
  - [Done] on the right.
- Room rows: one white rounded-card per floor, hairline separators. Each row is at least 64 px tall (72 pt on phone), padding 12/16.
  - Line 1: room name (15 px semibold). Right-aligned, in order: the Work pill (28 px tall, 44 px hit area), an action pill (only when there are actions), and ⋯ (44 px).
  - Line 2 (13 px, one line, ellipsis): the brief preview in ink; or a warning dot with 'Brief needed', then a muted must-haves summary. Tags sit at the end of the line, in amber outline: 'Check work' or 'Unfinished'.
  - Tapping the row body opens S3.
- Work pill styles:
  - New: accent #2E6B4F text on accent at 10%;
  - Renovated: primary text on primary at 8%;
  - Altered: primary text with a dashed primary outline;
  - No change: muted text on page grey;
  - Not in this job: grey pill, and the room name muted with a strike-through.

R5 Footer link '+ Add a floor', with options Upper floor · Lower ground · Other….

TICK MODE ('Choose upstairs rooms')
- R2 and R3 hide, and the title becomes 'Tick the rooms that are upstairs'.
- Each row gains a 44 px checkbox on the left; the pills hide.
- Sticky bottom bar, 64 px: left 'Cancel' (text); right primary 'Move 0 rooms to Upper floor', disabled at 0.

PHONE
- Same structure.
- '+ Add room' becomes a 44 pt round button in the title row.
- In each row the Work pill moves to the start of line 2, and the preview moves to line 3.
- Banner buttons stack full width.
- Add-panel chips wrap.
- The tick-mode bar sits above the Hub bottom nav.

### content
R1: 'Rooms'. Summary: '16 rooms · 8 new · 8 renovated · 15 need a brief'. Button: '+ Add room'.

R2: 'Is anything upstairs? Every room is on the ground floor, but the cladding is recorded for the upper level and the Living room mentions stairs.' Buttons: 'Choose upstairs rooms' · 'Not now'.

R3: 'All 16' (selected) · 'Brief needed 15' · 'Check work 3'.

Group header: 'GROUND FLOOR · 16', with '+ Add room here'.

Add panel chips: Entry · Living · Dining · Kitchen · Pantry · Scullery · Laundry · Bathroom · Ensuite · WC · Bedroom · Robe · Study · Stairs · Garage · Alfresco · Outside · Other….

Rows, in walk order (name | Work pill | line 2 | right side):
1. Entry | Renovated | 'Brief needed'
2. Living | New | 'Brief needed', plus tag 'Unfinished: “stairs -”'
3. Dining | New | 'Brief needed'
4. Kitchen | Renovated | 'feature range hood - meditrean curved micro cement - love the curves', plus tag 'Check work'
5. Pantry | Renovated | 'Brief needed · Walk-in, appliance garage, full-height', plus tag 'Check work'
6. Laundry | Renovated | 'Brief needed', plus tag 'Check work' | pill '1 action'
7. Bathroom | New | 'Brief needed · Bath'
8. Bathroom 2 | Renovated | 'Brief needed'
9. Ensuite | Renovated | 'Brief needed'
10. Bedroom | Renovated | 'Brief needed · sliding doors to robe in bedrooms'
11. Bedroom 2 | Renovated | 'Brief needed'
12. Bedroom 3 | New | 'Brief needed'
13. Bedroom 4 | New | 'Brief needed'
14. WC | New | 'Brief needed'
15. WC 2 | New | 'Brief needed'
16. Lounge | New | 'Brief needed'

Work pill popover: New · Renovated · Altered · No change · divider · Not in this job.

Row ⋯ menu: Rename · Duplicate · Move to another floor ▸ · Move up · Move down · Room type and drawing sheet… · Remove room….

Remove confirm: 'Remove Laundry and its 6 answers? Anything already on the client portal is kept.' Buttons: [Remove] (red) · [Cancel].

Toasts:
- after an add: 'Added Bedroom 5 on the ground floor · Undo';
- after a duplicate: 'Added Bedroom 5 below Bedroom 4 — its answers weren't copied · Undo'.

Tick mode:
- Title: 'Tick the rooms that are upstairs'.
- All 16 rows unticked. Which rooms are upstairs isn't on file, so nothing is guessed.
- Bar: 'Cancel' · 'Move 0 rooms to Upper floor'. The count follows the ticks, e.g. 'Move 5 rooms to Upper floor'.
- After saving, the groups read 'GROUND FLOOR · 11' and 'UPPER FLOOR · 5', and R2 disappears.

Empty state (no rooms): 'Add the rooms off the drawings, in the order you'd walk through. You can rename, move and reorder any time without losing anything.' Button: '+ Add room'.

### interactions
Adding rooms
- '+ Add room here' or '+ Add room' opens the add panel for that floor.
- Choose a Work word once. Each chip tap then adds a numbered room at the end of that floor ('Bedroom' → 'Bedroom 5'), with that type and Work word, and shows the undo toast. The panel stays open for the next room.
- 'Other…' asks for a name.

Changing a room
- Tapping the Work pill opens the popover. A tap saves and closes. If an earlier answer now disagrees, the 'Check work' tag appears.
- 'Duplicate' copies type, floor and Work, names the copy with the next free number and places it directly below. Answers and the room brief are not copied, so the copy shows 'Brief needed'.
- 'Move to another floor ▸' lists the floor chips and saves on tap.
- Reordering: drag on desktop, or 'Move up' / 'Move down' in ⋯.

Filters and the banner
- 'Brief needed' and 'Check work' filter the list.
- The filter and the banner's 'Not now' are remembered per viewer in localStorage, wrapped in try/catch.
- 'Not now' hides the banner for this job on this device; the warning still appears in Documents.

Tick mode
- Tap rows to tick them, then 'Move n rooms to Upper floor'. This is one save, with 'Undo' for 10 s.
- 'Cancel' with ticks asks 'Discard 3 floor changes?' with [Discard] [Keep ticking].
- '+ Add a floor' asks for a short name (e.g. 'Lower ground'). The new floor becomes a chip everywhere on this job.

Floor names are trimmed and given a capital first letter, so 'upper' joins 'Upper'.

If the storeys fact is on file and the rooms span more floors than it says, the muted line 'Rooms are on 2 floors; the job says 1 storey — check in Sales.' shows under the title. Storeys is never written.

### taps
Add a renovated kitchen on the ground floor: 3 taps ('+ Add room here', Renovated, Kitchen). Each further room on that floor is 1 tap. Today it takes 2 taps, plus 2 to fix the silent 'Renovated' preset on new rooms, plus typing in the level box when it isn't 'Ground'.

Add six new rooms upstairs: 8 taps ('+ Add room here' on Upper floor, New, 6 chips). Today it's about 19 taps plus typing 'Upper'.

Move 5 rooms upstairs: 7 taps (Choose upstairs rooms, 5 ticks, Move), no typing. Today it's about 15 taps plus typing 'Upper' five times.

Duplicate a room: 2 taps (⋯, Duplicate). Today it can't be done.

Change a room's work: 2 taps (pill, word).

### dataMapping
Rows → meta.rooms[] (makeRoom, register.js:468-479): id, name, level, roomType, scope, order and sheet. Writes go through mutateMeta. A bulk floor move is one mutateMeta call. level is already a merge-safe room field (ROOM_FIELDS, registerMerge.js:12).

Work pill → room.scope, the only scope control (C1). Labels:
- new = New
- renovated = Renovated
- altered = Altered (new value, two-step release; see storage)
- existing_remain = No change
- not_in_scope = Not in this job

Floor chips write the room.level string: 'Ground' shows as 'Ground floor', 'Upper' as 'Upper floor', a custom name as typed. The UI only ever writes chip values. Items' own level snapshots are never written or printed; documents read the live room.

Brief preview → description of the room's R-004 record. When it's empty, or a fragment (ends in '-', ':' or '—'), the row shows 'Brief needed' plus the muted selected labels and words of the room-type must-have records (K-002/K-003, B-002, D-002, V-002, L-002, H-005, O-002). A must-have that only names the room itself ('Pantry' in a pantry) is skipped.

'Check work' → a whole-room scope record (R-003, K-001, B-001, L-001, V-001, D-001) whose disposition disagrees with room.scope. Agreement rules:
- new ↔ new;
- renovated or altered ↔ alter;
- existing_remain ↔ retain;
- not_in_scope ↔ excluded.
On this job: i18 (Kitchen), i55 (Pantry), i59 (Laundry). A record with no disposition but typed words (i19) doesn't count as disagreeing.

'n action(s)' → the room's own records that are open under the Actions rule (S4); Laundry has i61.

Banner evidence (read-only):
- every room shares one level, and
- a record has zone 'upper_level' (i04) or a room record's words contain 'stair' (i24).
The storeys fact (project_metrics.storeys, jobFactRegistry.mjs:56-58) is read only.

Duplicate → makeRoom with a new id. Remove → the existing removeRoom path (ContextStep.jsx:67-72).

## S3 A room on a tablet (Kitchen, in a client meeting)  [Tablet: iPad portrait in the Hub column (754 px), and iPad landscape in Expand (1180 px, content max 760 px centred). Single column at every width.]  covers: C1 (Work set once; room-type scope questions hidden), C2 (room brief first), C5 (⚑ Needs action on every row), C4 (floor in the room bar), A3 contradiction fixed in place

### purpose
Brief one room with the client. Work is set once at the top. The room brief comes first: what the room must do, what it connects to, its must-haves, and who uses it and rough size when known. Only the choices that matter for this room follow. Office detail is one tap away, and the screen shows how the room will read in the architect's brief.

### whatChangesFromToday
Today the Kitchen is about 2,500 px:
- a 5-input header (RoomsStep.jsx:90-97);
- the 'From Whole House' panel;
- up to 7 topic sections with 4 nested 'Explore more' groups (RoomsStep.jsx:103-117);
- 19 cards, each with a kind chip, a question code (PromptRow.jsx:93), a category chip, help text, 'Office fields' (PromptRow.jsx:201), 'Recorded: …', and 'Not decided · N/A · + Note' (ProgressiveChoiceCard.jsx:148-156).
Scope is asked three times (room card, K-001, R-003), and there is nowhere to say what the room must do.

New:
- Work is one segmented control. The whole-room scope questions are hidden; their earlier answers show only as a banner when they disagree, or under 'Other things recorded here'.
- The 'Room brief' card leads, holding the sentence, 'Connects to' and the must-have chips.
- Choices are flat one-line rows with no codes, chips or help text. Each row has a ⚑ (Needs action) and a ⋯ menu (Not decided yet, Not needed here, office note, product details).
- House-wide finishes shrink to one 'Same as the rest of the house' strip. Any open or blocked house line zoned to this room shows inside the strip.
- One 'More choices (n)' replaces all the accordions. Detailed questions always sit there, so the 'Show detailed prompts' toggle is retired. Office-only questions sit in a collapsed 'Office only' group at the end.
- The R-010 'Undecided / follow-up' card and 'This room at a glance', with its raw owner keys (RoomsStep.jsx:139,143), are replaced by 'Actions in this room'.
The Kitchen falls to about 1,100 px. The same compact row is used on the Throughout and Site & existing steps.

### layout
1 Sticky room bar: 56 px, white, hairline bottom border.
- Left: text button '‹ Rooms' (44 px).
- Centre: room name (17 px semibold), over a 13 px muted line in which the floor is a tappable link with ▾.
- Right: save state (12 px), then two 44 px icon buttons ‹ › (previous and next room; the room names are their tooltip and aria-label).

2 Work row, 52 px.
- Label 'Work' (13 px muted, 64 px wide).
- A 4-segment control: each segment at least 96 × 44 px; the selected one is primary fill with white text.
- Then ⋯ (44 px).

3 Earlier-answer banner (only when an earlier whole-room answer disagrees).
- Warning at 10% tint, 3 px warning left rule, radius 12, padding 12.
- One sentence (14 px), then two 44 px outline buttons side by side.

4 Card 'Room brief': white, radius 12, 3 px primary left rule, padding 16.
- Header row: title on the left; a status caption on the right (12 px).
- Label, then an auto-sizing textarea: 2–4 lines, 15 px, at least 72 px tall, spellcheck on.
- Under an empty textarea only: one quick chip.
- 'Connects to' label, then a chip row (40 px chips, wrapping).
- 'Must-haves': one or two labelled chip rows from the room-type layout questions, each label 12 px muted above its row. A muted 'Noted earlier' line with a 'Use these' text button appears only when typed words exist.
- A text link that reveals 'Who uses it' chips and a 'Rough size' number input (96 px, unit m²).
- Footer: a collapsed 40 px row 'How this room reads in the architect's brief ▸', which expands to the printed row text (13 px, page-grey box).

5 Card 'Choices for this room': white, radius 12, no inner cards.
- Each choice is one row, at least 56 px, hairline separators:
  - left: label (14 px semibold), with an optional 13 px status sub-line;
  - under it: chips (40 px), wrapping;
  - top right: ⚑ and ⋯ icon buttons, 44 px each.
- A ⚑ that has been set becomes a pill under the row.
- At the bottom, a full-width 48 px disclosure row 'More choices (n) ▾'. When expanded, the same row style shows, and last comes a collapsed 'Office only (n) ▸'.

6 Strip 'Same as the rest of the house': page-grey, 56 px collapsed.
- Title, then a one-line muted summary (ellipsis).
- Right: either '✓ Confirmed 15 Nov' or a small primary 'Confirm all (n)', then a 'Different here' text button.
- Under it, one line per house choice for this room that is still open (amber) or not allowed (red): the text plus a text button.

7 Section 'Actions in this room'.
- 56 px rows: subject · what's needed · a 'who · by when' pill · ✓.
- Or the empty text.
- Then a 44 px dashed outline button.

8 Collapsed 'Other things recorded here (n) ▸'. Shown only when there are records that no row shows.

9 Sticky footer: 64 px, white, hairline top border.
- Left: text button with the previous room.
- Right: primary button with the next room, at least 160 × 48 px.

### content
Sample room: Kitchen, today's data.

1 Room bar: '‹ Rooms' | 'Kitchen' over 'Ground floor ▾ · Room 4 of 16' | 'Saved 9:41 pm' | ‹ (Dining) › (Pantry).

2 Work row
- 'Work' — New · Renovated (selected) · Altered · No change.
- ⋯ menu: 'Not in this job' · 'Room details (name, type, drawing sheet)' · 'Duplicate room' · 'Remove room…'.

3 Banner
- Text: 'An earlier answer says “New kitchen”, but this room is set to Renovated. Only one can print.'
- Buttons: [Keep Renovated] [Change to New].

4 Room brief
- Title: 'Room brief'.
- Status caption: 'In the architect's brief' (muted). When the box is empty and the Work is New, Renovated or Altered, it reads instead, in warning colour: 'Needed before the architect's brief can go'.
- Label: 'What must this room do?'
- Value: 'feature range hood - meditrean curved micro cement - love the curves'.
- Placeholder when empty: 'Who uses it, what happens here, what it must be near or keep. Their words are fine.'
- Quick chip (only when empty): 'Nothing special — standard room'.
- 'Connects to': Living · Dining · Pantry · Laundry · Entry · Outside · + More rooms. None selected.
- 'Must-haves':
  - 'Layout & family use': Island ✓ · Peninsula · Scullery · Pantry · Circulation · Family use.
  - 'Storage': Full-height · Walk-in · Drawers · Appliance garage · Bins · Pantry shelving · Integrated appliances. None ticked. Under it: 'Noted earlier: Full-height, Walk-in, Drawers', with 'Use these'.
- Link: '+ Who uses it · Rough size'. It reveals:
  - 'Who uses it': Whole family · Adults · Children · Guests · Working from home;
  - 'Rough size' [   ] m².
- Footer row: 'How this room reads in the architect's brief ▸'. Expanded: 'Kitchen | Renovated | Feature range hood, meditrean curved micro cement, love the curves. Layout & family use: island. Storage: full-height, walk-in, drawers. Cooking & exhaust: induction.' Under it, muted: 'Not printed: the earlier answer “New kitchen” (disagrees with the room).'

5 Choices for this room
- 'Cooking & exhaust': Induction ✓ · Gas · Outdoor connection · Ventilation [⚑] [⋯].
- 'Sink & mixer': Undermount · Topmount · Water filter · Hot tap [⚑] [⋯]. Choosing Undermount or Topmount reveals 'Single bowl · Double bowl' inline.
- 'More choices (6) ▾'. Expanded:
  - 'Appliances — who supplies?':
    - element chips: Cooktop · Oven · Rangehood · Dishwasher · Fridge · Microwave · Wine storage;
    - a 3-segment control 'Mostly supplied by': Blue Leaf (default) · Client · Others.
  - 'Power, lighting & data'
  - 'Doors, windows & openings'
  - 'Existing-to-new junctions & make good'
  - 'Supplied / installed by others?'
  - 'Budget drivers & unresolved choices'
  - Then 'Office only (5) ▸': Detail, price & documentation status · Tolerances & installation constraints · Joinery hardware & setouts · Appliance procurement & warranty · Coordinate product dimensions.
- Row ⋯ menu: 'Not decided yet' · 'Not needed here' · 'Note for the office (doesn't print)' · 'Product details…' · 'Remove answer'.

6 Strip
- 'Same as the rest of the house' — 'Floor: engineered timber · Walls: warm palette · Ceiling: square set, flat · Cabinetry: flat-panel laminate' — '✓ Confirmed 15 Nov' — 'Different here'.
- Red line: 'Benchtop: engineered stone can't be used — choose another with the client', with [Change]. Its ⚑ pill reads 'Architect · not asked yet'.
- Amber line: 'Splashback: tiles allowed, client to decide', with [Open].

7 'Actions in this room': 'Nothing waiting on anyone here.' Button: '+ Needs action from…'.

8 'Other things recorded here (1) ▸'. Inside: 'Earlier answer: Renovate — agrees with the room', with ⋯ (Remove).

9 Footer: '‹ Dining' · primary 'Next: Pantry ›'. On the last room the primary reads 'Done — back to Rooms'.

Other states:
- Work = No change: cards 4 and 5 collapse to one line, 'No work planned here — no brief needed.'
- Work = Not in this job: only the room bar and 'This room isn't part of the job. [Bring it back]' show.

### interactions
Saving
- Every tap saves, through the existing autosave (1.2 s, version check, merge on conflict). The room bar shows 'Saved 9:41 pm'.
- Chips toggle on tap; a selected chip shows ✓ on a primary fill. Single-select rows behave like radio buttons.
- The keyboard's 'Done' closes the textarea.

Work and the earlier-answer banner
- Work segments save at once.
- [Keep Renovated] deletes the disagreeing record (i18). Toast: 'Removed “New kitchen”. Undo'.
- [Change to New] sets the Work to New and deletes whichever earlier answers now disagree (here i53 'Renovate'), with the same undo.
- After the contract, the baseline guard refuses the delete (registerStore.mjs:421), and the banner shows 'This room is part of the signed contract — change it through a variation.'
- If a second earlier answer still disagrees, the banner shows it next.

Room brief
- The first keystroke creates the room's brief record; the status caption flips to muted.
- If the text ends in '-', ':' or '—', an amber line shows under the box: 'Looks unfinished — it won't print until it's finished.'
- 'Nothing special — standard room' writes 'Standard <room type>; no special requirements.' in one tap (subject to owner question 3).
- 'Use these' ticks only chips whose labels match the noted words exactly, and removes those words; unmatched words stay.
- 'Connects to' chips toggle. The link also shows on the other room as a muted 'Connects to Kitchen (set from the Kitchen)', read live; nothing is copied.
- The floor link in the room bar opens the floor chips (Ground floor · Upper floor · + Floor) and saves on tap.

Choices
- ⚑ opens S4.
- 'Not decided yet' parks the choice as unresolved.
- 'Product details…' opens the edit drawer with the full office fields: product, manufacturer, model, colour, supplier, client wording, supplied by, technical check, drawing ref.
- Disposition and record-type selects are not offered here; they stay in the Register table.
- Appliances: tapping an element chip creates one record per appliance, supplied by the 'Mostly supplied by' value. Tapping a selected chip opens a mini menu: Blue Leaf · Client · Others · Remove.
- The Benchtop option 'Engineered stone' is never offered as a chip. It shows only as the existing value, marked not allowed.

House strip
- [Change] on the red line opens the house benchtop record (already zoned to the kitchen) in the edit drawer. It edits that record, never other rooms.
- 'Different here' lists the house lines, each with 'Different here', which creates a room exception (existing logic).
- 'Confirm all' writes the room's default confirmations.

Actions and moving between rooms
- '+ Needs action from…' adds a follow-up row with a focused input 'What's needed?', then shows the S4 'Who' chips inline.
- Next and previous flush the save first, then move in walk order across floors.
- If the save fails you stay on the room: 'Not saved yet — check your connection. Your answers are kept.'

### taps
Renovated kitchen, the same content as today's baseline (island, 2 storage choices, tile splashback, undermount + single bowl, 4 appliances, induction + ventilation, one follow-up with an owner, next room):
- New: about 21 taps and no typed line. That's add 1 + open 1, confirm house 1, island 1, storage 2, splashback via the strip 2, sink 2, More + 4 appliances 5, induction + ventilation 2, ⚑ + Client 2 (text prefilled, by-when defaulted), Next 1.
- Today: about 29 taps and 1 typed line.

Adding the room brief (1 tap + typing) and 2 'Connects to' chips brings it to about 24 taps and 1 typed line. Today that information can't be captured at all.

New bedroom upstairs:
- New: 8 taps and 1 typed line (Upper floor add panel: New, Bedroom, open, Confirm all, brief, 2 must-haves, Next).
- Today: about 11 taps plus typing 'Upper', and no brief.

A minor room (WC 2): 3 taps (open, 'Nothing special', Next).

### dataMapping
Room bar, Work and floor → meta.rooms[] (name, level, scope) via mutateMeta. Room details → room.roomType and room.sheet.

Room brief = one R-004 record per room:
- the sentence → item.description (Kitchen: existing i22);
- created on the first keystroke with roomId, promptKey 'R-004', itemKind 'requirement' and category 'layout';
- 'Connects to' → answer.connectsTo [roomId | 'outside'] (names read live from meta.rooms, never snapshotted);
- 'Who uses it' → answer.usedBy [whole_family | adults | children | guests | home_office];
- rough size → item.quantity + item.unit 'm²'.
Unknown answer keys survive older screens (registerAnswer.js:170-184). Living's existing i24 ('stairs -') shows as unfinished.

Must-haves → the existing room-type layout records: Kitchen K-002 (i20 'Island') and K-003 (i21, words 'Full-height, Walk-in, Drawers'). Room types with no layout question (garage, other) show R-004's own chips instead (Storage · Circulation · Accessibility · Light and privacy · Entertaining · Durability).

Choices → existing records by question:
- K-009 i54 (Induction);
- K-007 (none yet; created on the first tap);
- K-008 repeat records, one per appliance (answer.element; supplyBy from 'Mostly supplied by'), each through upsertItem with its repeat key.
'More choices' = promptsFor('room') for this room type, minus the hidden scope questions, the brief questions, the face rows and the house-strip rows; office-only tier in 'Office only'. The counts are computed; the sample's 6 + 5 need confirming in the build.

Hidden scope questions: R-003, K-001, B-001, L-001, V-001, D-001, H-001 and O-001 are in a presentation list in register.js, shown only when a record exists (the hiddenAlias pattern, RoomsStep.jsx:37). i18 (disagrees) feeds the banner; i53 (agrees) sits under 'Other things recorded here'.

House strip:
- summary → roomInheritedLines (register.js:572-588) and room.defaultConfirmations (Kitchen confirmed 2026-11-15: i32, i36, i28, i33);
- red line → i38 (K-005, zone kitchen, isDefault, unresolved designer_to_confirm, responsibility architect);
- amber line → i39 (K-006, zone kitchen, note 'Tiles Allowed/ Client to decide').

⚑ → responsibility, actionRole, nextAction, actionDue, resolved (S4).

'+ Needs action from…' → a new R-010 action record for this room, with nextAction set. This is an existing question, so the bank doesn't change.

'How this room reads' → briefModel.roomRow() from the same shared module the PDF uses. It stores nothing.

## S3p A room on a phone (Kitchen, onsite)  [Phone 390 pt wide (iPhone), portrait, Hub bottom nav visible]  covers: C1, C2, C5, C4

### purpose
The same Kitchen, used one-handed while standing in it: big targets, one decision per row, and no typing except the brief and a follow-up.

### whatChangesFromToday
Today the phone Kitchen is about 7,600 px (@2x), roughly 3,800 pt:
- the 5-input header wraps to three lines;
- 'From Whole House' fills the first screen;
- the lead's sticky stage bar ('Next: Finish the consultant documents') and the app nav (about 130 pt together) cover the bottom of the page.
The new screen is about 1,400 pt. It shows no codes, hides the stage bar while a room is open, and has one sticky 'Next' bar.

### layout
Full width, 16 pt gutters. The app header, lead header and register tabs scroll away.

1 Sticky room bar, 52 pt.
- Left: '‹' (44 pt), back to Rooms.
- Centre: two lines; the room name (17 pt semibold), then 'Ground floor · 4 of 16 · Saved' (12 pt muted).
- Right: ⋯ (44 pt).

2 Work: a full-width 4-segment control, 44 pt tall (about 86 pt per segment), 14 pt labels.

3 Earlier-answer banner: the sentence (15 pt), then two full-width 44 pt buttons stacked.

4 Room brief card:
- textarea full width, 3 lines (88 pt), 16 pt text;
- chip rows wrap, with 44 pt chips and 8 pt gaps;
- labels sit above each chip row;
- the 'How this room reads ▸' row is 44 pt.

5 Choices card. Each row has:
- a label line with ⚑ and ⋯ (44 pt each) on the right;
- a status sub-line;
- chips wrapping below.
16 pt between rows. Then 'More choices (6) ▾' at 52 pt.

6 House strip (56 pt): title and a truncated summary. Tapping it opens a bottom sheet listing each house line, with 'Confirm all' and a 'Different here' per line. The red benchtop line stays visible under the strip.

7 Actions in this room, then '+ Needs action from…' (dashed, full width, 44 pt).

8 Sticky footer: 64 pt plus safe area, sitting directly above the Hub bottom nav. A full-width primary 'Next: Pantry ›' (52 pt).

Previous room is in ⋯; there is no swipe, so rooms can't change by accident onsite. The Hub's global stage bar is hidden while a room is open.

### content
Same copy and sample values as S3, with these phone differences:
- Room bar: '‹' · 'Kitchen' over 'Ground floor · 4 of 16 · Saved' · ⋯.
- ⋯ menu: '‹ Previous room: Dining' · 'Floor: Ground floor ▸' · 'Not in this job' · 'Room details' · 'Duplicate room' · 'Remove room…'.
- Work: New · Renovated (selected) · Altered · No change.
- Banner: 'An earlier answer says “New kitchen”, but this room is set to Renovated. Only one can print.' Buttons stacked: [Keep Renovated] / [Change to New].
- Brief card, in order:
  - 'What must this room do?', with the S3 value;
  - 'Connects to' chips;
  - 'Layout & family use' (Island ✓);
  - 'Storage', with 'Noted earlier: Full-height, Walk-in, Drawers · Use these';
  - '+ Who uses it · Rough size';
  - 'How this room reads ▸'.
- Choices: 'Cooking & exhaust' (Induction ✓) · 'Sink & mixer' · 'More choices (6) ▾'.
- House strip: 'Same as the rest of the house · ✓ 4 confirmed ›'.
  - Red line: 'Benchtop: engineered stone can't be used' [Change].
  - Amber line: 'Splashback: client to decide' [Open].
- Actions: 'Nothing waiting on anyone here.' · '+ Needs action from…'.
- Footer: 'Next: Pantry ›'.

### interactions
Same as S3, with these phone differences:

Sheets
- The S4 sheet, ⋯ menu, house lines, floor chips and product details open as bottom sheets: drag handle, at most 90% height, swipe down or tap the scrim to close.

Typing
- While you type in the brief, the footer hides and the keyboard toolbar shows 'Done'.
- The textarea scrolls itself above the keyboard.

Layout behaviour
- A chip tap never makes the page jump.
- After 'Keep…' or 'Change…', the banner collapses with a 150 ms height animation and focus moves to the brief.

Offline or weak signal
- Chips still change on the phone, and the room bar shows 'Not saved — will retry' in warning colour.
- 'Next' waits for the save with a spinner for up to 8 s, then shows: 'Still not saved. Stay here or carry on — your answers are kept on this phone.' [Stay] [Carry on].

Every target is at least 44 pt (the existing min-h-[40px] rows are raised). There is no hover; help text opens on long-press.

### taps
Same counts as S3: a renovated kitchen takes about 21 taps (24 with the brief and 'Connects to') against about 29 today; a new upstairs bedroom takes 8 taps and 1 typed line. Scrolling drops from about 3,800 pt to about 1,400 pt for the Kitchen.

### dataMapping
Identical to S3: the same components and the same writes. The only phone-only state is hiding the Hub stage bar (primaryAction, LeadDetail.jsx:2628) while a room is open. That is a view rule in the register wrapper and stores nothing.

## S4 Needs action from… (the ⚑ control, its sheet, and the Actions list)  [All devices.
- The control is on every record row: room choices, the house strip, Throughout and Site & existing rows, Register table rows, and inside the S5 drawer.
- Sheet: a 360 px popover anchored to the ⚑ on desktop and tablet; a bottom sheet on phone.
- Actions list (from the header pill): a 420 px right drawer on desktop and tablet; a full-screen sheet on phone.]  covers: C5. It feeds the brief's numbered 'Needed for the next drawing issue' list (B) and the A3 'no one named' warning.

### purpose
Give any record a who, a what and a by-when in 2 taps, and close it in 1. See everything waiting on someone in one list, grouped by who, in the same order the architect will read it.

### whatChangesFromToday
Today:
- the owner dropdown ('owner —') and the Done tick show only on action cards (PromptRow.jsx:116-125, 141-148);
- on every other record, owner and next action are behind 'Office fields' (PromptRow.jsx:201, 232-235);
- there is no by-when anywhere;
- 0 records on this job have a next action, so the brief's actions table prints headings and no rows;
- owners show as raw keys in 'This room at a glance' (RoomsStep.jsx:139,143);
- '40 outstanding' mixes unapproved finishes with real actions.

New:
- one ⚑ on every row, one sheet, and a by-when that defaults sensibly;
- one Actions list that uses exactly the rule that fills the brief;
- action questions lose 'Not decided / N/A'.

### layout
A. The ⚑ on a row, 44 px hit area. States:
- outline grey: nothing needed;
- outline amber: open (a technical check, an unresolved choice, or an in-or-out decision) but no one asked;
- set: becomes a pill under the row (28 px tall, 44 px hit area, warning at 12% tint, ink text) reading '<Who> · <By when>';
- done: a muted pill '✓ Done'.

B. Sheet, top to bottom:
- header (52 px): title, 13 px muted subject line, close X (44 px);
- 'Who' label (12 px uppercase muted), then chips, 44 px, single-select: 3 per row on phone, 6 in 2 rows on tablet. The suggested chip has a primary outline and a 10 px 'suggested' label;
- 'By when' chip row (44 px);
- 'What's needed' one-line input (44 px), prefilled;
- 12 px muted footnote saying where it prints;
- footer (only once set): on the left 'Done' (accent outline), or 'Checked' for a technical check, which reveals a required 'Drawing or document reference' input and [Save]; on the right a muted text button 'Clear'.

C. Actions list:
- header (56 px): title and count on the left, X on the right;
- under it, a 2-segment filter (40 px) and a text button 'Copy list';
- groups by who, in print order, each with a sticky 36 px header (12 px uppercase muted, count; 'No one named yet' in amber).
- Rows, at least 56 px:
  - line 1: subject (14 px semibold) · place (13 px muted);
  - line 2: what's needed (ink) or an amber prompt;
  - right: a by-when pill and a 44 px ✓ button;
  - rows with no one named show inline who chips instead of the by-when: [Architect] [Engineer] [Energy assessor] [Client] [More…] (36 px).
  - Tapping the row body opens that record in the S5 edit drawer.
- Footer (56 px): '+ Needs action for the whole job'.

### content
Sheet, example 1: Gutters (a check with no one named).
- Title: 'Needs action from…'. Subject: 'Throughout · Gutters'.
- 'Who': Client · Architect (suggested) · Engineer · Energy assessor · Blue Leaf · Trade or supplier. Once a person is on the design team, the chip reads e.g. 'Architect — <firm>'.
- 'By when': Next drawing issue (default for the design team) · Next meeting (default for Client and Blue Leaf) · Pick a date….
- 'What's needed': prefilled 'Confirm half round', with all text selected on focus.
- Footnote for the design team: 'Prints in the architect's brief under “Needed for the next drawing issue”.' For Client: 'Prints in the client's brief under “Decisions we need from you”.' For Blue Leaf: 'Our list only — doesn't print.'
- Footer once set: 'Checked' (this is a technical check) · 'Clear'.
- Toast after a Who tap: 'Architect · next drawing issue — added to Actions'.
- The pill on the row afterwards: 'Architect · Next issue'.

Prefill rules:
- a record with recorded words or chips → 'Confirm <words>';
- a choice with no answer → 'Decide the <subject>';
- an in-or-out element → 'Decide whether <subject> is part of this job';
- an action record → its own words.

Suggested Who: the record's owner; otherwise the question's owner or coordinator. A technical check never suggests Client.

Actions list for this job. Filter: 'Next drawing issue (10)' (selected) | 'Everything open (12)'.

ARCHITECT · 2
- 'Windows & glazing priorities' · Throughout — amber 'Nothing asked yet — tap to say what's needed' — pill 'No date'.
- 'Kitchen benchtop' · Kitchen — 'Designer to confirm' — red tag 'Engineered stone can't be used'.

ENERGY ASSESSOR · 1
- 'Envelope quality (comfort, energy, moisture)' · Throughout — amber 'Nothing asked yet'.

CLIENT · 2
- 'Heating, cooling, ventilation & hot water' · Throughout — amber 'Nothing asked yet' — tag 'A technical check — usually not the client's'.
- 'Outstanding whole-house decision' · Throughout — 'Curved micro cement feature rangehood' — tag 'Say what's needed — won't print until it does'.

NO ONE NAMED YET · 5 (each with inline who chips)
- 'Gutters' · Throughout — 'Check still open'
- 'Main walls' · Throughout — 'Check still open'
- 'Washer / dryer layout' · Laundry — 'Not decided'
- 'Retaining' · Site & existing — 'In or out of this job?'
- 'Pool' · Site & existing — 'In or out of this job?'

'Everything open (12)' adds, under CLIENT:
- 'Bedroom floor' · Throughout — 'Deciding later'
- 'Splashback' · Kitchen — 'Tiles allowed, client to decide'

Empty state: 'Nothing is waiting on anyone.'

'Copy list' copies plain text, e.g. 'Architect — Windows & glazing priorities (Throughout): confirm double glazed aluminium, Jolong, white frames — next drawing issue'.

### interactions
Setting an action
- Tapping a Who chip saves at once, with the prefilled text and the default by-when. The pill appears on the row behind the sheet.
- The sheet stays open so by-when or text can still change; each change saves on tap or blur. Tapping outside, swiping down or X closes it; nothing is lost.
- If 'What's needed' is emptied, the Who chips disable with the hint 'Say what's needed first'.
- 'Pick a date…' opens the native date picker; the pill reads e.g. '28 Nov'. A past date adds a red 'Overdue' tag.
- Setting an action on a choice with no answer also parks it as unresolved, with the matching existing reason: Client → decide later; Architect, Engineer or Energy assessor → designer to confirm; Blue Leaf → Blue Leaf to advise. Counts stay consistent.

Closing an action
- 'Done' sets it resolved; the pill becomes '✓ Done'. Toast: 'Marked done. Undo'. It leaves Actions and stops printing, and its history is kept.
- 'Checked' needs a reference, then sets the technical check as verified with who, when and the reference (the existing rule: 'verified' needs a reference).
- Typing new text on a done action reopens it (existing rule: a new next action clears resolved).
- 'Clear' removes who, by-when and text. The owner stays if the question has a default owner.

Actions list
- ✓ marks a row done; the row fades into a collapsed 'Done today (n)' group with Undo for 5 s. On a technical check, ✓ opens the 'Checked' reference field instead.
- An inline who chip assigns in 1 tap; the row moves to its group with a 200 ms fade.
- The header pill count updates live.
- 'Copy list' shows the toast 'Copied 10 actions'. Nothing is ever sent from the Hub.

Locked records
- A client-approved record keeps its approval: an action isn't a content change.
- Contract-locked records show the sheet read-only, with 'Locked by the contract — raise a variation.'

### taps
Who, with by-when defaulted and the text prefilled: 2 taps (⚑, Architect). Changing the by-when: 1 more.

Marking done: 1 tap in the Actions list, or 2 from a row (pill, Done).

Naming who for the 5 unnamed points: 5 taps in the Actions list.

Seeing every open action: 1 tap (header pill).

Today: owner plus next action takes 4 taps and typing (Office fields, owner select, option, next-action box). There is no by-when, the control isn't on most cards, and there is no single list of actions.

### dataMapping
Who → item.responsibility, the existing column (RESPONSIBILITIES, register.js:95-101):
- Client = client
- Architect = architect
- Engineer = consultant, with actionRole 'engineer'
- Energy assessor = consultant, with actionRole 'energy'
- Blue Leaf = blue_leaf
- Trade or supplier = trade
responsibility stays the single 'who'. The new item.actionRole only says which consultant. adbWho (registerDocuments.mjs:583-598) reads actionRole before guessing from the question.

What's needed → item.nextAction (existing; next_action column in project mode).

By when → new item.actionDue: 'next_issue' | 'next_meeting' | 'YYYY-MM-DD' | ''.

Done → item.resolved (existing; register_detail). Checked → technicalStatus 'verified' plus technicalEvidence {at, by, ref} (existing).

Storage for the new fields:
- actionRole and actionDue are added to makeItem (register.js:349-390), merged automatically via ITEM_FIELDS (registerMerge.js:10), saved in register_detail via detailOf (registerStore.mjs:161-168), and read back in selRowToItem / rsiRowToItem.
- When an incoming item lacks a key, the server keeps the stored value, like carryAnswer (registerStore.mjs:391). No migration.
- client_selections.due_date is never used; it belongs to the portal.

New whole-job follow-ups → a W-025 action record. Room follow-ups → R-010. Both are existing questions.

The Actions rule is one shared pure function, openPoints(register, context) in src/lib/briefModel.js. An item is open when it is not resolved AND any of these holds: nextAction is set; itemKind is 'action'; technicalStatus is 'needs_verification'; answer.state is 'unresolved'; or it is a scope element with disposition undecided.
'Next drawing issue' keeps:
- actions;
- anything owned by the design team;
- technical checks;
- drawing-impact records;
- requirements;
- in-or-out decisions.
It leaves out client finish choices; those go to the client brief and the Technical Selections Schedule.
On this job: i06, i38, i07, i08, i46, i27, i47, i61, i71, i72. 'Everything open' adds i29 and i39.
Group order: Architect, Engineer, Energy assessor, Trade, Client, Blue Leaf, No one named yet. The same function feeds the S2 counts, the header pill and the brief's section 03. The Register table keeps the old outstandingReasons as an office filter, relabelled 'Not finished'.

## S5 Documents: what will print, beside the PDF, with release blockers and content warnings kept apart, and a click-a-line edit drawer  [- Desktop and iPad landscape in Expand (1180 px): two panes, line list on the right and PDF on the left.
- Hub column (754 px): a 'What will print | PDF' switch, with the lines as the default.
- Phone (390 pt): line list only, plus 'Open PDF' and 'Download draft PDF'.
- The edit drawer is a 440 px right panel on desktop and tablet, with the PDF still visible, and a 90% bottom sheet on phone.]  covers: A2 (click a printed line to edit its record, room, lead fact or architect), A3 (content warnings, separate from legal and safety blockers), the shipped draft download, the agreed C2 rule at issue

### purpose
Before sending the architect's brief, see what stops it issuing apart from what only weakens it. See every line as it will print. Fix any line's source in a drawer without losing the preview, then preview again.

### whatChangesFromToday
Today each document card has 'Preview draft'. The preview shows one flat list of red and amber strings with no links (DocumentsStep.jsx:185-190), then a 28 rem PDF frame and the issue controls. 'Download draft PDF' and 'Open in new tab' are already shipped (DocumentsStep.jsx:199-201). Fixing anything means leaving the step, which unmounts the preview (RegisterWorkshop.jsx:256-258). Every architect's brief preview also carries a false 'wording addressed to the client' warning (registerDocuments.mjs:1195).

New:
- a readiness line on the document row before you preview;
- two boxes, red 'Can't issue yet' and amber 'Before you send', with a Fix on every entry;
- a 'What will print' list grouped as printed, where each line opens the edit drawer;
- 'Not in this brief (n)', so every record stays reachable and shows why it didn't print;
- a stale overlay with 'Preview again';
- the recipient defaults to the named architect;
- the false warning is gone.

### layout
A Document list: five 56 px rows, each with name, tag(s), a muted status/readiness line and a [Preview] button (44 px). The selected row expands into B–F.

B Title bar, 56 px.
- Left: document name, with a muted line under it.
- Right: [Preview again] (filled primary when stale), [Download draft PDF] (outline), 'Open in new tab' (text), 'Close' (text).

C 'Can't issue yet' box: red-50 background, red-700 text, 1 px red-200 border, radius 12, padding 12. Title with count, then numbered entries, each a 44 px row: sentence on the left, outline button on the right.

D 'Before you send' box: warning at 12% tint, 1 px #D4A24C border, radius 12. Title, sub-line 'These don't stop you issuing.', then the same row pattern. Shows 5 entries, then 'Show 5 more'.

E Main area (Expand).
- Left pane, 58%: the PDF iframe at viewport height minus the bars. When stale, a white 90% band across its top (56 px) with text and a primary 'Preview again'.
- Right pane, 42%: the 'What will print' list.
  - Header: title and count, plus a toggle chip 'Only lines with a warning'.
  - Sticky 36 px section subheaders, page grey, as printed.
  - Line rows, at least 44 px: printed text (14 px, 2-line clamp), a right-aligned 12 px muted source tag, and ›.
  - A line with a warning has a 3 px amber left rule. A line held by a blocker has a 3 px red rule. A grey draft placeholder has a hollow dot and muted italics.
  - Template and computed lines are muted and not buttons.
  - At the end, a collapsed 'Not in this brief (n) ▸' with subgroups.
- In the 754 px column, E becomes a 2-segment switch 'What will print' (default) | 'PDF'.

F Issue bar, sticky bottom, 64 px: 'Issue to' input (200 px); 'Email (kept on the record — nothing is sent)' input (240 px); primary 'Issue R01', disabled with a 12 px reason line under it.

G Edit drawer.
- Header, 64 px: 'Edit what prints' (15 px semibold) and X (44 px); line 2 is the printed line in quotes (13 px muted, 2-line clamp).
- Body scrolls, by source kind:
  - record: the S3 compact row (label, chips, words, ⚑, ⋯ → Product details). A line built from several records stacks each under a 13 px caption 'From <place>: <subject>'.
  - room: a mini room card with name input, floor chips, the Work segments, the earlier-answer banner if any, the 'What must this room do?' box, 'Connects to', the must-have chips, then 'Open the full room ›'.
  - fact: one labelled field with the caption 'Saved to the client's details — Sales shows the same'.
  - architect: the 'Name the architect' search.
  - site: read-only text plus 'Re-check'.
  - template: read-only text.
- Staff reference: 11 px muted, records only.
- Sticky footer, 64 px: save state on the left ('Saved ✓ 9:41 pm'); text button 'Next warning ›' (or 'Next room without a brief ›' in a room drawer); primary 'Preview again'.

PHONE
- C and D collapse to two 52 pt rows, 'Can't issue yet · 3 ›' and 'Before you send · 10 ›', each opening a sheet.
- E shows the line list only.
- A sticky 56 pt bottom bar above the app nav holds [Download draft PDF] and [Open PDF] (new tab); there is no iframe.
- F stacks at the end of the list.

### content
A Rows
- 'Preliminary Client Project Brief' — 'Draft — not issued' — [Preview]
- 'Architect Design Brief', tag 'This stage' — 'Draft — not issued · 3 to fix before issuing · 10 worth checking' — selected
- 'Technical Selections Schedule' 'This stage'
- 'Client Selections Presentation' 'This stage'
- 'Tender Scope & Pricing Notes' 'This stage' 'Internal only'

B 'Architect Design Brief'. Muted line: 'Draft R01 · from the register as it is now · previewed 9:41 pm'.

C 'Can't issue yet (3)'
1. 'Kitchen benchtop names engineered stone. It can't be supplied or installed in Australia — agree another benchtop with the client and change the record.' [Fix]
2. '15 new or renovated rooms have no room brief: Entry, Living, Dining, Pantry, Laundry, Bathroom, Bathroom 2, Ensuite, Bedroom, Bedroom 2, Bedroom 3, Bedroom 4, WC, WC 2, Lounge.' [Go room by room]
3. 'Say who it's going to — name the architect, or type a name under “Issue to”.' [Name the architect]

D 'Before you send (10)' — 'These don't stop you issuing.'
1. 'The client's vision, must-haves and budget aren't recorded. The brief leaves the first two out and says the budget is “to be confirmed by Blue Leaf”.' [Add them]
2. 'No architect named — the brief is addressed to “The design team”.' [Name the architect]
3. 'Every room is on the ground floor, but the cladding is recorded for the upper level and the Living room mentions stairs.' [Choose upstairs rooms]
4. 'Kitchen, Pantry and Laundry: an earlier answer disagrees with the room's work (Kitchen is Renovated; an earlier answer says “New kitchen”). The room's setting prints; the earlier answer is held back.' [Fix 3]
5. '5 points for the next drawing issue have no one named: Gutters, Main walls, Washer / dryer layout, Retaining, Pool.' [Name who]
— 'Show 5 more' —
6. 'Heating, cooling, ventilation & hot water: the technical check is down to the client. A trade or engineer usually confirms it.' [Fix]
7. '3 notes look unfinished and won't print: “stairs -” (Living), “floor to ceiling curtain -” (window furnishings), “not sure if they want to live in - shouldn't -” (living on site).' [Fix 3]
8. 'Trees, retaining & external structures says “Retain” but is marked New. It won't print until they agree.' [Fix]
9. 'Rangehood: a client action that doesn't say what's needed. It won't print.' [Fix]
10. '3 empty answers in the Laundry print nothing: Doors, windows & openings; Supplied / installed by others?; Appliance supply.' [Delete all 3] [Review]

E List header: 'What will print · 37 lines' · chip 'Only lines with a warning'. The lines are exactly the S6 text, grouped as printed, with these source tags:
- COVER (5): Prepared for [Design team, amber] · Site [Sales] · Client [Sales] · Drawing basis [The project] · Project [Sales].
- 01 THE PROJECT (4): What's planned [Rooms] · Funding and timing [Sales] · Budget [Sales, amber] · The client's priorities [The project · Site & existing · 2 records].
- 02 SITE AND CONSTRAINTS (5): Council and zone, Bushfire, Site complexity [Public mapping — ⓘ instead of ›] · Access [Site & existing] · During the works [The project].
- 03 NEEDED FOR THE NEXT DRAWING ISSUE (8):
  - 1 [Throughout]
  - 2 [Throughout · Kitchen, red]
  - 3 [Throughout]
  - 4 [Throughout, amber]
  - 5 [Throughout, amber]
  - 6 [Throughout, amber]
  - 7 [Laundry, amber]
  - 8 [Site & existing · 2 records, amber]
- 04 ROOMS (8): each tagged with its room and record count, e.g. [Kitchen + 4 records, amber]. The grouped rows are tagged [4 rooms] and [6 rooms] and open a room picker.
- 05 SELECTIONS THAT AFFECT THE DRAWINGS (7): [Throughout] or [Site & existing].

'Not in this brief (24) ▸':
- 'In the Technical Selections Schedule instead (11)': floors ×4, paint ×4, kitchen and scullery cabinetry, splashback, tapware.
- 'Held back until fixed (8)': Kitchen “New kitchen”; Pantry “New kitchen”; Laundry “New”; Trees, retaining & external structures “Retain”; Living “stairs -”; “floor to ceiling curtain -”; “not sure if they want to live in - shouldn't -”; Rangehood action.
- 'Empty (3)': the three Laundry records.
- 'Kept for the office (2)': Design coordination owner “client architect - and blue leaf aid”; Electrical note “Already complete”.

Stale overlay: 'Changed since this preview' [Preview again].

F
- 'Issue to': empty; placeholder 'Name of the architect or firm'.
- 'Email (kept on the record — nothing is sent)'.
- [Issue R01], disabled. Reason: 'Fix the 3 items in red first.' When stale: 'Preview again to issue what you see.'

G Drawer examples
1. Room line '04 · Kitchen | Renovated | Feature range hood…'.
   - Header: 'Edit what prints'.
   - Body: name 'Kitchen'; floor chips 'Ground floor' ✓ · 'Upper floor'; Work 'Renovated' ✓; banner 'An earlier answer says “New kitchen”, but this room is set to Renovated. Only one can print.' [Keep Renovated] [Change to New]; 'What must this room do?' with the current text; 'Connects to'; 'Layout & family use'; 'Storage'; 'Open the full room ›'.
   - Footer: 'Saved ✓' · 'Next room without a brief ›' · [Preview again].
2. Fact line 'Budget: To be confirmed by Blue Leaf.'
   - The S1 budget chips, 'Exact…' and 'Confirmed with the client'.
   - Caption: 'Saved to the client's details — Sales shows the same.'
3. Architect line 'Prepared for: The design team': 'Name the architect', search 'Search people and firms', '+ Add someone new'.
4. Record line '5 · Gutters: confirm half round. · To be agreed'.
   - Caption 'From Throughout: Gutters'; chips Half round ✓ · Quad · Box · Other.
   - ⚑ in amber outline, which opens S4 inside the drawer.
5. Site line 'Council and zone: City of Marion…': 'From public mapping. It can't be edited here — re-check if the site or address changed.' [Re-check].
6. Template line: 'Standard wording in every architect's brief. It can't be changed here.'

### interactions
Previewing
- 'Preview' and 'Preview again' flush the save first (as today), then render. The response now carries the lines and the content checks.

Opening the drawer
- 'Fix', or tapping a line, opens the drawer on its target; the preview stays mounted.
- 'Go room by room' opens the first room without a brief, with 'Next room without a brief ›' (15 → 0).
- 'Choose upstairs rooms' opens the S2 list in tick mode inside the drawer.
- 'Name who' opens the S4 Actions list filtered to 'No one named yet', inside the drawer.
- 'Delete all 3' asks 'Delete 3 empty Laundry answers? They hold nothing.' [Delete] [Cancel].
- A 'Not in this brief' record opens in the drawer with its reason at the top, e.g. 'Won't print: unfinished — ends with “-”.'
- 'Open the full room ›' leaves the step, after the confirm 'This closes the preview — open the Kitchen?'

After any save in the drawer
- The amber box and the line list recompute in the browser from the same shared modules the server uses. A fixed warning disappears with a 1 s green tick, and the edited line gets a small 'changed' tag.
- The PDF shows the stale overlay. 'Issue R01' disables, and 'Download draft PDF' changes to 'Preview again to download', so a stale file can't be saved by mistake.
- The red box is re-checked by the server on 'Preview again'.
- 'Preview again' keeps the list's scroll position and open group.
- 'Next warning ›' jumps to the next warned line without closing the drawer.
- Esc or X closes; unsaved text is kept and saved on close.

Saving rules in the drawer are the same as everywhere:
- records go through PromptRow/updateItem: an edit that outruns a client approval drops it back to Proposed, with a notice; Client-approved needs evidence; Verified needs a reference;
- portal-locked and post-contract records open read-only, with the reason shown.

Issuing
- 'Issue to' is prefilled with the named architect and firm, in design-team order. Changing it after a preview asks you to preview again, as today.
- 'Issue R01' is enabled only when the preview is current, the red box is empty and 'Issue to' has text.
- The server still refuses a stale issue (ISSUE_STALE, registerDocuments.mjs:1429-1431).
- Content warnings never block.
- 'Download draft PDF' keeps 'DRAFT (not issued)' in the file name.

### taps
Fix a printed line: 1 tap on the line, the edit, then 1 tap on 'Preview again', without leaving the document. Today it takes about 8–12 taps plus a search: close or leave the step (losing the render), go to the Register tab, search by reference code, Edit, change, return to Documents, 'Preview draft' again.

See why a record didn't print: 2 taps. Today it can't be done.

Work through the 15 missing room briefs: about 2 taps plus a sentence per room ('Next room without a brief ›').

### dataMapping
Preview: POST /api/register/leads/:leadId/documents/architect_brief/preview (registerRoutes.mjs:132-139; previewDocument, registerDocuments.mjs:1401-1415) is extended to return:
- lines: [{ section, group?, text, ids:[itemId…], source:{ kind: record | room | fact | meta | consultant | site | template, key? }, placeholder?, warning? }], in print order, built by a pure printedLines(docType, model) in src/lib/briefModel.js;
- checks.content: [{ key, text, targets:[{kind, id|key}] }], built by a pure contentChecks() in src/lib/registerQuality.js. Issue ignores it.
The server already imports src/lib (registerDocuments.mjs:34-39), so the browser and the server run the same rules.

checks.errors (red), in registerDocChecks (registerDocuments.mjs:1173):
- the existing rules: stone, money, unevidenced approvals, verified without a reference, recipient, drawing basis;
- plus the agreed C2 rule for the architect's brief: a room whose Work is New, Renovated or Altered and whose R-004 record has no finished sentence.
Each error gains a target. The 'addressed to the client' check scans fixture text, not template copy (registerDocuments.mjs:1195).

Every fixture entry carries item ids, not reverse-hashed reference codes.

The drawer gets these props from RegisterWorkshop.jsx:257 (today DocumentsStep gets only updateItem): actor, saveStateOf, deleteItem, onPortalItem, mutateMeta and patchLead. Writes:
- records → PromptRow with question={null} and item (as in RegisterTable.jsx:149-153) → updateItem / deleteItem;
- rooms → mutateMeta, plus the room's R-004 record;
- facts → patchLead before a job exists, setFact after;
- architect → POST /api/sales/leads/:id/design-team;
- site → read-only; Re-check → POST /api/geo/enrich/leads/:id.

Recipient default → designTeam() order (registerDocuments.mjs:578-581), replacing DocumentsStep.jsx:51-58.

'Not in this brief' = every register item id minus the ids on lines, each with its reason.

Issue: the endpoint is unchanged. The fingerprint (registerItemVersions, registerDocuments.mjs:1383) adds each room's name, level, scope and sheet, plus a hash of the facts the brief prints. It does not use meta.rev, which bumps on every room navigation. The issued snapshot keeps the lines and their ids.

## S6 The output: new Architect Design Brief (adb-2.0), page 1 and the top of page 2, from this job's data as it stands today  [A4 portrait PDF in the existing document design system: header band, kicker, Playfair title, meta rows, status box, numbered sections, tables, Lato body, running footer.]  covers: B (the brief model for the architect's brief), and how C1, C2, C4, C5 and C6 data lands on the page

### purpose
What the architect would receive if it were issued from today's register through the new brief model: the project in a few lines, the constraints, a numbered list of what the next drawing issue needs and from whom, one row per room, and only the selections that change the drawings.

Gaps rule (decided):
- Missing information that the reader needs to know about prints in neutral words: 'Budget: To be confirmed by Blue Leaf', 'Prepared for: The design team', 'To be agreed' in the Who column, and 'Brief to follow' for a room.
- In a draft, 'Brief to follow' prints in grey italic. Because the room-brief rule and the recipient rule block issue, an issued brief never contains it.
- Missing story lines (vision, must-haves, worries) are simply left out.
- Our own housekeeping never prints: contradictions, fragments, empty records, status-only words, an action that doesn't say what's needed. It comes back to staff as S5 warnings.
- No ⚠ symbol is ever printed.
- A line held by the stone rule prints why it is open, never the prohibited material.

### whatChangesFromToday
Live today: 33 table rows plus a paragraph of preferences, over 2+ pages. adb-1.0 runs to 4 pages, mostly finishes. Problems in both:
- reference codes lead every row;
- contradictions print as they are ('New kitchen and living room', then 'Renovated kitchen and pantry');
- fragments print ('stairs -', 'Retain');
- 9 rooms are never mentioned;
- no site, occupancy or programme prints;
- the actions table is empty.

adb-2.0 has six sections, each printed only when it has content:
- 01 The project
- 02 Site and constraints
- 03 Needed for the next drawing issue: numbered, with Who; a By column appears once any point has a by-when
- 04 Rooms: one row per room, Work from the room card, rooms with nothing recorded grouped at the end, floor bands when there is more than one floor
- 05 Selections that affect the drawings
- 06 Outside this job (by others, supplied by the client, not in this job): omitted here because nothing is left to print
Finishes go to the Technical Selections Schedule. Nothing prints twice. There are no reference codes in the reading text; the ids travel with the lines. On this job: 37 lines, about 1.5 pages, printing 48 of 72 records.

### layout
PAGE 1
- Header band: 'Architect Design Brief' on the left, the suburb on the right.
- Kicker, title (display size), subtitle.
- Meta rows: a 2-column definition grid, 4 rows × 2.
- Status box: tinted, full width, label plus body.
- 01: a definition list, labels 34 mm, values wrapping, 10.5 pt, 4 pt between lines.
- 02: one 9 pt italic intro line, then a definition list.
- 03: one intro sentence, then a table No. (8%) | What's needed (70%) | Who (22%). The By column (14%) is omitted because no point has a by-when yet.
- Footer: document number · status · 'Page 1 of 2'.

PAGE 2 (top)
- Running header.
- 04 Rooms: intro sentence, then a table Room (22%) | Work (14%) | What it must do and contain (64%). The header row repeats on each page. There are no floor bands because every room is on one floor; with two floors, band rows 'Ground floor' and 'Upper floor' would appear.
- 05: a definition list, then a 9 pt closing line.

Grey italic is used only in drafts, only for 'Brief to follow'.

### content
PAGE 1
Header band: 'Architect Design Brief' · 'Seacliff Park'.
Kicker: 'Draft / Design coordination'. Title: 'Design brief'. Subtitle: 'Extension, Seacliff Park'.

Meta rows
- Prepared for — The design team
- Site — Site address, Seacliff Park
- Client — Client (the client's name)
- Drawing basis — DA rev 3
- Project — Extension · Construction management
- Document — BLB-ADB-BLA67068 (existing numbering)
- Prepared by — Blue Leaf Building
- Status — Draft — not issued

Status box
- Label: 'Draft for review — not issued'.
- Body: 'What the client needs the design to achieve, and what we need from the design team for the next drawing issue. Finishes are in the Technical Selections Schedule. This isn't a construction instruction and doesn't approve a technical solution: technical design stays with the architect and the consultants. Grey text marks what Blue Leaf still has to provide; an issued brief has none.'

01 The project
- What's planned — An extension and renovation: 16 rooms, 8 new and 8 renovated.
- Funding and timing — Cash. Target start April 2027.
- Budget — To be confirmed by Blue Leaf.
- The client's priorities — Natural light and space. Quality priorities: upgraded.

02 Site and constraints
Intro (italic): 'From public mapping — a guide only. Confirm against the title and a planning search.'
- Council and zone — City of Marion. Hills Neighbourhood zone.
- Bushfire — In a mapped bushfire area. BAL to be assessed.
- Site complexity — High.
- Access — Standard driveway.
- During the works — Part of the home stays lived in.

03 Needed for the next drawing issue
Intro: 'Please reply against these numbers, quoting the drawing number and revision. A point stays open until we've checked your revised drawings against it.'
No. | What's needed | Who
1 | Windows & glazing priorities: confirm double glazed aluminium, Jolong, white frames. | Architect
2 | Kitchen benchtop: material still to be chosen; designer to confirm. | Architect
3 | Envelope quality: confirm weathertightness system, hd2.5 walls batts, ceiling batts 6.0 (agreed with the client). | Energy assessor
4 | Heating, cooling, ventilation & hot water: confirm existing AC for whole house, linear grilles on ceiling (agreed with the client). | Client
5 | Gutters: confirm half round. | To be agreed
6 | Main walls: confirm rendered AAC. | To be agreed
7 | Laundry washer / dryer layout: still to be decided. | To be agreed
8 | Retaining and pool: are they part of this job? | To be agreed
Footer: 'BLB-ADB-BLA67068 · Draft — not issued · Page 1 of 2'.

PAGE 2 (top)
04 Rooms
Intro: 'One row per room: the work, then what the room must do and contain.'
Room | Work | What it must do and contain
- Living | New | [grey italic] Brief to follow. Layout, outlook & acoustics: gas fire place, in door out door living continuity. Windows, sliders & coverings: stacker. Fireplace: supplied by the client. TV wall: included.
- Kitchen | Renovated | Feature range hood, meditrean curved micro cement, love the curves. Layout & family use: island. Storage: full-height, walk-in, drawers. Cooking & exhaust: induction.
- Pantry | Renovated | [grey italic] Brief to follow. Storage: walk-in, appliance garage, full-height.
- Laundry | Renovated | [grey italic] Brief to follow. Cabinetry, bench & trough: cabinetry, bench, splashback, mixer, trough.
- Bathroom | New | [grey italic] Brief to follow. Layout & priorities: bath. Bath: freestanding. Shower: walk-in, hobless, niche. Toilet: concealed cistern, caroma. Vanity: wall-hung, supplied by samious with mirror. Basin: inset, built in. Wall & floor tiles: full height.
- Bedroom | Renovated | [grey italic] Brief to follow. Sliding doors to robe in bedrooms.
- Entry, Bathroom 2, Ensuite, Bedroom 2 | Renovated | [grey italic] Brief to follow.
- Dining, Bedroom 3, Bedroom 4, WC, WC 2, Lounge | New | [grey italic] Brief to follow.

05 Selections that affect the drawings
- Internal doors — 2340 x 870 solid core doors, DAR pine jambs.
- Ceilings — Square set, flat.
- Upper level — Lightweight cladding, Linea weatherboard. Colour: Surfmist, (potentially hogs bristle QS).
- Main roof — surfmist 27 deg on existing, low pitch roof sheets in surfmist to new. By others.
- All bathrooms — Full-height tiling; concealed cistern; wall-hung vanity, one basin.
- Driveway — New, exposed aggregate.
- Fencing — Replace, steel.
Closing line (9 pt): 'Paint, floor finishes, cabinetry, benchtops, splashbacks and tapware are in the Technical Selections Schedule.'

AFTER A FIX PASS IN S5 (what changes; the values are whatever is recorded)
- 'Prepared for' names the architect and firm, and 03's Who column shows names.
- 01 gains 'In the client's words: “…”', 'Must-haves: …' and 'What worries them: …'. Budget prints as the owner decides in question 1.
- 03 gains a By column ('Next issue' or a date). The rangehood point prints once it says what's needed.
- 04 groups under 'Ground floor' and 'Upper floor'. Every New, Renovated or Altered room shows its one-line brief, plus 'Connects to: …' and a rough size when recorded. No grey text remains, and the issue unlocks.
- Kitchen, Pantry and Laundry keep the Work set on the room card, with nothing contradicting it.

### interactions
None; this is a printed output. In S5 every line opens its source (S5 drawer).

Line rules the brief model follows:
- Every line names its subject, using the zone or element label (Gutters, Main walls, Upper level) or else the library short. There are no reference codes in the reading text.
- Light tidy only:
  - trim trailing spaces;
  - collapse double spaces;
  - ' - ' between words becomes ', ';
  - a cell starts with a capital.
  Typed words otherwise print as typed. Spelling isn't corrected; the A2 drawer is how staff fix 'meditrean'.
- These are held back and warned in S5:
  - text that ended in '-', ':' or '—' before tidying;
  - a record whose only words repeat or contradict its status ('Retain' on a New record);
  - an empty record;
  - an action that doesn't say what's needed.
- Whole-room scope records that agree with the room add only their typed words; ones that disagree never print.
- A must-have that only names the room ('Pantry' in a pantry) is skipped.
- Nothing prints twice: a point in 03 isn't repeated in 04 or 05.
- Rooms with no content and the same Work collapse into one row at the end of 04.
- 03 order: Architect, Engineer, Energy assessor, Trade, Client, Blue Leaf, then 'To be agreed'.
- A section, or a column, prints only when something fills it.

### taps
Not applicable (output). Length: about 1.5 pages and 37 lines, against 2+ pages (33 rows) live and 4 pages for adb-1.0. Every line is either something to act on or a grey gap Blue Leaf must fill before issue.

### dataMapping
Cover
- Prepared for: the recipient, else the first designTeam() person (registerDocuments.mjs:578-581), else 'The design team'.
- Client and Site: context.identity.
- Project: PROJECT_TYPE_LABELS + DELIVERY_MODELS.
- Drawing basis: meta.planRev.
- Document: documentIdentity.

01 The project
- What's planned: projectType + counts of meta.rooms[].scope.
- Funding and timing: context.budget.financeStatus + desiredStart.
- Budget: budget.min/max. Blank prints 'To be confirmed by Blue Leaf'. A band prints only with owner approval and wo_budget_confirmed.
- Priorities: P-005 (i26) + W-009 (i11).
- Vision, must-haves and worries: context.goals (blank, so omitted).

02 Site and constraints
- context.site: council (title-cased), zone, bushfire (true → mapped + 'BAL to be assessed'; null → 'Not confirmed'), complexity. A null slope is omitted.
- Access: W-001 (i69).
- During the works: meta.occupancy.

03 = briefModel.openPoints() with the 'Next drawing issue' filter, minus held-back lines.
- i06 (W-015, architect, check)
- i38 (K-005, unresolved designer_to_confirm; prints the reason, never the option)
- i07 (W-016, consultant → Energy assessor via coord)
- i08 (W-020, client, check)
- i27 (W-014 gutters, no owner)
- i47 (W-013 main walls, no owner)
- i61 (L-002, unresolved)
- i71 + i72 (W-010 retaining and pool, undecided), merged into one line
i46 is held back. Who = adbWho, reading actionRole first. By = actionDue. '(agreed with the client)' prints only when the approval is evidenced (approvalIsEvidenced).

04 Rooms
- Room = the live meta.rooms[] name; Work = room.scope.
- Content, in order:
  1. the R-004 description (Kitchen i22; Living i24 is a fragment, so it's held back);
  2. answer.connectsTo and quantity (none yet);
  3. must-have records: i23, i20, i21, i54, i58, i67 (i57 skipped as it names the room);
  4. the room's drawing-impact selections: i49, i50, i51, i68, i14, i15, i16, i17, and i13 (its full-height chip only);
  5. house defaults zoned to the room: i44 (Laundry);
  6. agreeing scope words: i19.
- Agreeing scope records ride on the Work cell as ids: i48, i52, i53, i56, i60, i65, i66.
- Held back: i18, i55, i59.

05 = the DRAWING_IMPACT presentation map: i01, i02 + i33, i04, i05, i41 + i42 + i43, i10, i70.

Printed nowhere (24, each listed in S5 with its reason):
- Technical Selections Schedule: i28–i32, i34–i37, i39, i40
- held back: i03, i09, i12, i18, i24, i46, i55, i59
- empty: i62–i64
- office: i25, i45

## storageChanges
- No new database columns and no migrations are needed for C1–C5. Everything lives in existing JSON/jsonb (register meta, items' register_detail, answer) and existing lead columns.
- Two new optional item fields:
- actionDue: 'next_issue' | 'next_meeting' | 'YYYY-MM-DD' | ''
- actionRole: 'engineer' | 'energy' | 'surveyor' | 'geotech' | 'other' | '', used only when responsibility is 'consultant'
responsibility (existing column) stays the single 'who'; nextAction and resolved are unchanged.
Where they go:
- makeItem (src/lib/register.js:349-390);
- merged automatically by ITEM_FIELDS (registerMerge.js:10);
- saved in register_detail via detailOf (server/lib/registerStore.mjs:161-168);
- read back in selRowToItem and rsiRowToItem (:63, :119).
The server keeps the stored value when an incoming item lacks the key, following carryAnswer (registerStore.mjs:391), so screens opened before the release can't wipe them. Ship the server with or before the client.
- Room brief = one existing R-004 'How the room must work' record per room:
- description = the sentence;
- quantity + unit 'm²' = rough size;
- answer.connectsTo [roomId | 'outside'] and answer.usedBy [key] are new answer keys. They need no schema change: normaliseAnswer keeps unknown keys, so older screens can't strip them (registerAnswer.js:170-184).
One metadata-only change to the question bank: widen R-004's rooms list (scripts/register/build-question-library.mjs:108, today without garage) to every room type, then regenerate src/lib/registerQuestions.js with the generator. No Tab 21 wording or option ids change.
- Room scope adds 'altered' (label 'Altered'; maps to disposition 'alter' in documents, tender and baseline) in two releases:
1. makeRoom (register.js:468-479) and the server keep an unknown scope instead of turning it into 'new'.
2. The value is added to ROOM_SCOPES (register.js:122-127) with its labels.
Only the on-screen labels of existing keys change: existing_remain = 'No change', not_in_scope = 'Not in this job'. No migration: all 16 rooms already have a scope.
- Room level stays the existing string. The UI writes only chip values ('Ground', 'Upper' or a named floor, trimmed, with a capital first letter). Level is already a merge-safe room field (ROOM_FIELDS, registerMerge.js:12). The storeys job fact is never written from the register.
- Presentation lists in src/lib/register.js (never the generated bank):
- HIDDEN_ROOM_SCOPE_PROMPTS: R-003, K-001, B-001, L-001, V-001, D-001, H-001, O-001, shown only when a record exists;
- ROOM_BRIEF_PROMPTS: R-004 plus the must-haves K-002, K-003, B-002, L-002, V-002, D-002, H-005, O-002;
- W-007, hidden unless it has a record (folded into the Project step's occupancy);
- DRAWING_IMPACT, keyed by question plus option, element or zone. Examples: W-018 door height but not hardware; W-019 ceiling but not palette; W-013; W-014; W-015; V-004; V-005; B-003, B-004, B-006, B-007 and B-009 full height; L-003; W-010 driveway, fencing, retaining and pool;
- the K-005 'Engineered stone' chip, hidden unless it is already chosen.
- Lead story facts: no new columns. Register these as Lead-spine facts in jobFactRegistry.mjs and dictionary §11, written only through PATCH /api/sales/leads/:id:
- wo_client_vision
- key_requirements
- wo_biggest_concern
- wo_most_excited_about
- construction_budget_min / construction_budget_max
- wo_budget_confirmed
- finance_status (add server-side validation against LEAD_FINANCE_STATUS_LABELS)
- desired_start_date
Add 'consultants' to the stage lists at LeadDetail.jsx:1730-1733 so Sales shows the same fields.
- PUT /api/register/leads/:leadId/facts also accepts projectType and estimatedValue: lead before a job exists, setFact after, following setDeliveryModel (registerContext.mjs:118-130).
- Design team: new non-admin POST /api/sales/leads/:id/design-team. It creates or links the crm_contacts row, upserts the lead-scoped job_contact_roles row and adds the consultant_roster entry. loadRegisterContext merges roles and roster, resolving contactId and removing duplicates (registerContext.mjs:101-102). Optional small additive migration (next free number): widen the job_contact_roles role check to land_surveyor, soil_geotech and energy; until then those are stored as 'consultant'.
- Site: re-run the existing site lookup at lead-to-job conversion, after the carried facts (salesRoutes.mjs ~400), and add the bushfire detail to the context query (registerContext.mjs:106-110). No new storage.
- Two new pure shared modules, imported by both the server and the browser:
- src/lib/briefModel.js: the adb-2.0 model, openPoints(), roomRow() and printedLines();
- src/lib/registerQuality.js: content checks with fix targets.
- Preview response adds lines[] and checks.content[]. Every fixture entry carries item ids, and the issued snapshot keeps the lines. The issue fingerprint (registerItemVersions, registerDocuments.mjs:1383) adds each room's name, level, scope and sheet, plus a hash of the facts the brief prints; it does not use meta.rev. New adb-2.0 template and payload (DOC_DEFS.architect_brief and ARCHITECT_ITEM_STATUSES in documentPayloads.mjs). Earlier issued revisions stay as issued.
- Only if the owner says yes to question 1: one narrow exception to MONEY_RX (registerDocuments.mjs:1153, 1182), limited to a dedicated budgetBand field of the architect's brief fixture and built only from the two lead budget columns when wo_budget_confirmed is true. Every other dollar figure still blocks issue.
- Per-viewer conveniences (the Rooms filter, the floor banner's 'Not now', collapsed sections) go in localStorage wrapped in try/catch, never in meta.

## documentEffects
- Architect Design Brief becomes adb-2.0, as S6 shows:
- 01 The project
- 02 Site and constraints
- 03 Needed for the next drawing issue: numbered, with Who and, once set, By
- 04 Rooms: one row each, Work from the room card, floor bands when there is more than one floor
- 05 Selections that affect the drawings
- 06 Outside this job, when filled
The old Requirements section dissolves into The project and Rooms; Requests and Decisions merge into 03; Design direction is dropped and finishes go to the Technical Selections Schedule.
On this job: about 1.5 pages and 37 lines instead of 4 pages. Site, occupancy, funding and programme print for the first time, all 16 rooms appear (9 were silent), and no contradiction, fragment or reference code prints.
- Gaps rule for every register document:
- missing information the reader needs prints in neutral words ('Brief to follow', 'Budget: To be confirmed by Blue Leaf', 'Prepared for: The design team', 'To be agreed');
- required gaps block issue, so they appear only, in grey, on drafts;
- missing optional story lines are left out;
- contradictions, fragments, empty records and status-only words never print and become 'Before you send' warnings;
- no ⚠ symbol is ever printed.
- Release blockers are unchanged (engineered stone, dollar figures, unevidenced approvals, verified without a reference, recipient, drawing basis), plus the agreed C2 rule: the architect's brief can't issue while a New, Renovated or Altered room has no room brief. Content warnings never block. The false 'wording addressed to the client' warning disappears (registerDocuments.mjs:1195 scans fixture text only).
- Client brief:
- room scope is read from room.scope, so every room gets a line;
- room briefs print in place of the 8-requirement cap (registerDocuments.mjs:533);
- the 7-decision cap (:506) is lifted;
- client decisions show their by-when.
The full client-brief model in client language is the next step after the architect's brief.
- Technical Selections Schedule: it becomes the only home of finishes, and its actions row prints who (with the named person) and by-when (registerDocuments.mjs:989-993).
- Client Selections Presentation: client decisions show a by-when where set; otherwise unchanged. Room briefs never reach the portal, because they are requirements, not selections.
- Tender Scope & Pricing Notes, tenderSummary and the contract baseline's approvedScope print one scope line per room from room.scope, plus the words of an agreeing record (registerDocuments.mjs:1124; registerHandover.mjs:79-85, 210-214). The 9 rooms that print nothing today appear, and disagreeing whole-room records stop printing.
- Default recipient = the named architect or firm in designTeam() order, which now includes interior designers (replaces DocumentsStep.jsx:51-58).
- Every preview returns its printed lines with record ids (driving click-to-edit), and the issued snapshot keeps them, so any issued line can be traced to its records.

## removedOrHidden
- Question codes (K-001, P-004 …) on every capture screen (PromptRow.jsx:93, 311; ContextStep.jsx:25, 117, 120, 123). They stay only as a small staff reference in the edit drawer and the Register table.
- Per-card chrome on room, Throughout and Site & existing cards:
- the kind chip and category chip;
- the help line (moves to long-press or hover);
- the 'Recorded: …' echo;
- the 'Written earlier' box (now a muted 'Noted earlier' line with 'Use these');
- 'Office fields' (PromptRow.jsx:201), now ⋯ → Product details;
- the 'Not decided · N/A · By others · Excluded · + More detail · + Note' row (ProgressiveChoiceCard.jsx:148-156), now in ⋯.
On action questions, 'Not decided / N/A' is removed entirely.
- Disposition and record-type selects in meetings. They stay only in the Register table.
- The 7 topic sections and every nested 'Explore more' in a room (RoomsStep.jsx:103-117), replaced by one 'Choices' card and 'More choices (n)'. Office-only questions sit last, collapsed.
- The 'Show detailed prompts' checkbox. Detailed questions always sit under 'More choices'.
- The whole-room scope questions R-003, K-001, B-001, L-001, V-001, D-001, H-001 and O-001 when a room has no record of them. Existing records are never hidden: one that disagrees shows as the earlier-answer banner, and one that agrees shows under 'Other things recorded here'.
- The free-text level boxes, the 'Add on level' box that resets to 'Ground', and the silent 'Renovated' preset (ContextStep.jsx:34, 59, 138, 152; RoomsStep.jsx:92). Replaced by floor chips and an add panel where the Work word is chosen once.
- The 16-row room table on the Project step (ContextStep.jsx:135-164). It moves to the Rooms tab; ▲▼ reorder, the type select and 'Sheet / rev' go to the row ⋯ menu.
- The 'From Whole House' panel and its title (RoomDefaultsPanel.jsx), now one 'Same as the rest of the house' strip. The 'Whole house' tab is renamed 'Throughout'.
- The 'On file in Sales — not re-entered here' grid, its 'Change these in the lead's own details' hint, the 'Sales fact (lead)' and 'Project fact (job)' hints, and the 'Existing-building prompts' checkbox (which now follows the project type, with an office override in the register ⋯ menu).
- P-009 'Decisions before next milestone' on the Project step, and the R-010 'Undecided / follow-up' cards in rooms. Both are replaced by ⚑, '+ Needs action from…' and the Actions list; existing records still show as actions. P-006 'Areas in the project' moves to Site & existing.
- W-007 'Living on site during works' on the Site step, folded into the one 'During the works' control. The existing note shows under it.
- 'This room at a glance', which showed raw owner keys (RoomsStep.jsx:139,143), and the 'Add custom: + Scope/works + Requirement + Selection + Action' row (replaced by '+ Needs action from…'; other one-off records via ⋯ in More choices).
- '40 outstanding ▾' on capture tabs and 'Register (40)', replaced by the 'Actions 10' pill. The Register table keeps the old count as an office filter, 'Not finished'.
- The Hub's sticky stage bar ('Next: Finish the consultant documents') on phone while a room is open.
- In the Documents step: the flat list of unlinked red and amber strings, and the false 'wording addressed to the client' warning.
- In the architect's brief: the Requirements and Design direction sections, the separate Decisions table, reference codes in the reading text, empty columns ('Required response', the repeated 'DWG'), and the 22 finish defaults.
- The 'Engineered stone' chip on Benchtop. It shows only as an existing value marked not allowed.

## risks
- Hiding must never hide data:
- every hidden scope question that has a record must surface in the banner or under 'Other things recorded here' (hiddenAlias pattern, RoomsStep.jsx:37);
- every record that prints nowhere must appear in 'Not in this brief'.
Add a check against this job proving all 72 records are reachable.
- Release order:
- 'Altered' needs two releases (makeRoom keeps unknown values first). Otherwise an older open register turns 'altered' into 'new' and saves the whole meta back.
- actionDue and actionRole need the server-side 'absent means keep' carry in the same or an earlier release.
- The R-004 brief inherits what is already typed there. The Kitchen's 'brief' is really a rangehood note, and the Living's is 'stairs -'. Staff need to rewrite these; the unfinished check only catches the second.
- The story is edited from two places, Sales and the register. The lead PATCH has no version check, so the last write wins. The register reloads context after every save, and the LeadDetail Consultants-stage visibility fix (LeadDetail.jsx:1730-1733) must ship with S1, or the two screens disagree.
- The agreed C2 blocker means this job can't issue an architect's brief until 15 room briefs exist (about 15 short sentences, roughly 15 minutes in a meeting). The one-tap 'Nothing special' (owner question 3) eases it but can be used just to get past the rule.
- The browser's 'What will print' list, the content warnings and the Actions list must come from the same pure modules the server uses. If they ever diverge, click-a-line misleads and warnings reappear after 'Preview again'. The PDF stays the source of truth, and issue is only allowed from a current preview.
- The issue fingerprint must include room fields and the printed lead facts. Otherwise a Work, floor or vision change after the preview could issue a brief that differs from what was checked. Don't use meta.rev, which bumps on every room navigation.
- Click-a-line needs ids on every fixture entry. Reverse-hashing reference codes (3-character hashes) could open the wrong record.
- Settling a contradiction deletes a record ('Keep Renovated'). The banner must show that record's words first, offer Undo, and rely on the baseline guard after contract (registerStore.mjs:421).
- Appliances: one tap creates several K-008 records. Each must go through upsertItem with its repeat key, or a retry creates duplicates.
- The DRAWING_IMPACT list needs curation per option. Mistakes either push finishes back into the architect's brief or drop something the drawings need (owner question 5).
- A budget band in dollars needs a narrowly scoped MONEY_RX exception (one field, one document, only when confirmed). Done loosely, a figure could leak into client or tender documents. There is also an inc/ex GST mismatch: the Hub stores ex GST, while clients usually quote inc GST.
- Site lookup values are advisory. A null bushfire value must read 'not confirmed', never 'not bushfire-prone'. After conversion, site facts go blank until the lookup is run at conversion.
- Staff used to '40 outstanding' will see 'Actions 10'. Label it in the SOP; the Register table's 'Not finished' filter keeps the old view.
- Typed words print as typed ('meditrean', 'samious', 'hd2.5 walls batts'). Nothing flags spelling. Click-a-line makes fixes fast but doesn't find them.
- In a client meeting, the tablet shows the red 'engineered stone can't be used' line and the earlier-answer banners in front of the client. The wording is neutral, but it is visible.
- On a phone, the room footer, the Hub bottom nav and the keyboard compete for space. iOS PDF frames are weak, so the line list must be complete enough to review from. Test on a real iPhone with the keyboard open.
- CLAUDE.md SOP law: the register SOPs (Project, Rooms, Documents and the new Actions list) must be rewritten in the build, with Section 14 test scripts. Budget time for it.

## openQuestionsForOwner
- Budget in the architect's brief. Should it print the client's budget band in dollars (one narrow exception to the 'no dollar figures' rule, this line only), or always say 'to be confirmed by Blue Leaf'? Are the bands (Under $400k, $400k–$600k, $600k–$800k, $800k–$1m, $1m–$1.5m, Over $1.5m) right, and ex or inc GST? Recommended: print the band, but only once 'Confirmed with the client' is ticked, e.g. '$800k–$1m construction budget, ex GST (the client's figure)'. Use these bands, ex GST, to match the rest of the Hub.
- Should a missing client vision or must-haves stop the architect's brief from issuing? Recommended: no, warn only. Architect-tender and plans-supplied jobs often won't have them. Room briefs (as agreed) and a named recipient stay as blockers.
- Room briefs are required, as you agreed. For minor rooms (WC, WC 2, robe, hall, second bathroom), may staff tap 'Nothing special — standard room' to meet the rule? It prints 'Standard WC; no special requirements.' On this job 15 rooms need a brief before the first issue. Recommended: yes. It keeps the rule honest without 15 forced sentences, and the architect still sees the room listed.
- 'Altered' as a work word beside New, Renovated, No change and Not in this job, for a layout change such as a new doorway, as opposed to a refit in place. It takes two small releases a few days apart. Recommended: yes. Entry and Laundry were already recorded as 'Alter', and the architect needs that distinction.
- Which selections print under 'Selections that affect the drawings'? Everything else goes to the Technical Selections Schedule only. Recommended:
- door height
- ceiling type
- wall cladding and main-wall material
- roof and gutters
- windows, sliders and glazing
- fireplace and TV wall
- wet-area set-out: wall-hung vanity, concealed cistern, walk-in shower, freestanding bath, full-height tiling
- laundry and kitchen joinery layout
- driveway, fencing, retaining and pool
- The architect's name. Should it come from one place, the design-team contact linked to the lead and job, with jobs.architect_name derived from it? Or should the architect-tender intake keep its own typed copy? Recommended: one place, the design-team contact, with the job's architect name derived from it.