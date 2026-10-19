---
sop_version: 1.2
last_reviewed: 2026-10-19
app_version: takeoff-r03
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Flashing Profiles, Materials and Company Standards

**Module:** Takeoffs (flashing takeoff from plans)  
**SOP ID:** 20-04  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-13):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED`, and **database migration 206 has not been applied in production**. Nothing in this SOP has been tested against the live app. See SOP 20-01 for switching it on.

---

## 1. Who uses this

| Action | Admin (Hub) | Supervisor (Hub) | Leading hand (Worker app) | View-only / preview |
|---|---|---|---|---|
| Add a material to a job (draw new, finished pieces, use a standard) | Yes | Yes | Yes | No |
| Edit a job material's profile and ordering rules | Yes | Yes | Yes | View profile only |
| **Update this job's copy** from a newer standard | Yes | Yes | Yes | No |
| **Save as standard** / **Edit** a company standard / source review | Yes | Yes | **No** | No |

Company standards are a staff-only (Admin / Supervisor) action and are only available in the Hub.

---

## 2. When to use it

- Before measuring: every run, count or manual length belongs to a material.
- A new flashing shape is needed on a job (draw it), or a standard shape already exists (use it).
- The colour, BMT or product changes, or the ordering rules (allowance, rounding, handling flag, order ceiling) need adjusting for a supplier.
- The office wants to save a well-drawn flashing as a company standard, or update a standard.

---

## 3. What this does

A **material** is what you are ordering: the flashing's cross-section **profile** (legs, angles, end folds, coated face), its **specification** (product, finish, colour, BMT) and its **ordering rules** (allowance and rounding for measured runs, the long-piece handling flag and the order ceiling). Each job gets its **own independent copy** of every material — editing it never changes a company standard or another job. Company standards are versioned: saving a change makes a new revision; jobs already using an older revision are offered the update but are never changed silently.

---

## 4. Before you start

- A takeoff is open (SOP 20-01).
- Know the flashing's finished face sizes (mm), fold angles, which face is coated (the colour side) and any hems/returns.
- Know the material: product, finish (e.g. COLORBOND), colour and BMT. Defaults are suggestions — COLORBOND finish and 0.55 BMT for flashings — always check with the supplier.
- Default ordering rules: allowance **200 mm total per measured run**, round **up to 100 mm**, handling flag **above 6,000 mm**, order ceiling **9,000 mm**. Only change them when the supplier or job needs it.

---

## 5. Step-by-step process

### A. Add a material to the job

1. On the overview tap **Add material** (or in the Measure screen tap **Material: …** → **Add material**).
2. The **Choose material** window shows:
   - **Draw new flashing** — draw a new profile (Section B).
   - **Finished pieces only (no drawing)** — a material you'll only Count or Add lengths for (no profile; no measured runs).
   - **Company standards** — type in **Search standards**, then tap **Use on this job** next to the one you want. Each shows its revision ("rev 3"), finish, colour, BMT, girth and either "source reviewed" or "user-entered".
3. **Use on this job** copies that exact standard revision onto the job and takes you to Measure (if a plan is chosen).

[insert screenshot: Choose material — Draw new flashing, Finished pieces only, Company standards search and Use on this job]

### B. Draw and edit a flashing profile

1. Tap **Draw new flashing**. The full-screen editor opens on an **empty grid** (10 mm squares) — nothing is drawn yet and **Save** is greyed out. The panel says "Tap where the profile starts."
2. Tap the flashing out point by point along its cross-section, like sketching it on paper: the first tap is the start, each next tap adds a leg (lengths round to 5 mm, angles snap to 15°) and shows its length and angle as you go. **Undo point** removes the last tap, **Clear** starts again. Tap **Done drawing** when the shape is right — Save then becomes available.
   - To redraw an existing profile later, use **Draw shape** in the Shape tools (then **Done sketching** replaces the shape — you can undo it).
3. **Set exact leg sizes:** tap a leg on the drawing (or its chip, e.g. "L1 100 mm"). In **Leg L1** type the **Length (mm)** and tap **Apply**. Other legs and angles stay the same — the rest of the shape moves.
4. **Set fold angles:** tap a corner (or its chip, e.g. "B1 90° left"). In **Corner B1** type the **Included angle (°)** and tap **Apply**, or tap a quick angle **45° / 90° / 135° / 180° flat**. Choose **Bend direction (travelling from L1)**: **Left** or **Right**. 90° is a square fold and 180° is straight — it is **not** the roof pitch.
5. **Set end folds:** tap the **Start: …** or **End: …** chip. Choose **None**, **Open return** or **Closed hem**, type the **Return width** / **Hem width (mm)**, choose **Folds to the Left / Right**, then **Apply**. The note tells you whether it folds onto the coated or uncoated face.
6. Use **‹ / ›** in the panel to step through legs, corners and ends in order; **✕** closes the item.
7. **Shape tools:** pick **Turn left** or **Turn right** then **Add leg** (adds a 50 mm leg with a 90° turn); **Remove last leg**; **Rotate 90°** (turns the drawing only — the part is unchanged).
8. **Coated face:** the thick blue line shows the coated (colour) face; the legend reads "Coated face — left/right side travelling L1 → Ln". Use the tools in the table below to change it.
9. Read **Indicative girth X mm (no bend deduction)** — this is a guide (sum of legs plus each end fold once), not a press-brake blank size. The supplier's fabrication rules take precedence.
10. If an amber banner says "Check this profile: Legs 1 and 3 cross or touch — check the lengths and angles. …", fix the sizes. You can still save, but it can't go on an order until fixed.
11. Tap **Save** (it reads **Save (has problems)** if the profile still has a problem). **Cancel** asks "Discard your changes to this profile?" if you changed anything. **Undo / Redo** (top bar) step through your edits.

| Tool | What it does | Use it when |
|---|---|---|
| **Mirror** | Flips the whole shape **and** its coating together. This is the same physical flashing seen from its other end, so it is ordered as the **same part** (same schedule line) | You want the drawing to read the same way round as the plan or the supplier's sheet |
| **Flip coated face** | Keeps the shape, moves the coating to the other face — this **is a different part** | You drew the shape right but the colour is on the wrong side |
| **Reverse direction** | Numbers the legs from the other end — **same physical part** | You want L1 to start from the other end; nothing about the part changes |
| **Rotate 90°** | Turns the drawing only | You want the drawing upright |

[insert screenshot: profile editor — drawing with leg labels, Leg L2 panel with Length (mm) and Apply]
[insert screenshot: profile editor — Corner B1 panel with quick angles and Left/Right bend direction]
[insert screenshot: profile editor — Shape tools: Add leg, Remove last leg, Rotate 90°, Mirror, Flip coated face, Reverse direction, Draw shape]

### C. Fill in the material details and ordering rules

1. After saving a new profile, the **New material** form opens ("This job only"). For an existing material tap **Rules** on its row.
2. **Name** — e.g. "Barge flashing".
3. **Material** — **Product**, **Finish** (suggestions: COLORBOND, ZINCALUME, Galvanised, Other), **Colour** (COLORBOND names are suggested, e.g. Monument — custom entries are fine), **Colour code (optional)**, **BMT** (mm), **Product code (optional)**. Product, finish, BMT and colour are **required before ordering**.
4. **Ordering rules** — **Measured allowance (total per run)**, **Round measured runs up to**, **Handling flag above** ("Long pieces are kept whole and flagged."), **Order ceiling (longest piece)** ("Longer pieces block ordering until split.").
5. When you change a rule on a job that already has measurements, a blue box shows **These draft lengths change:** with **Before** and **After** (e.g. "Before: 1 × 4,600 / After: 1 × 4,700") and "Measurements, frozen exports and placed orders are not changed."
6. Tap **Save material**. For a new flashing you go straight to Measure.

> 💡 **Tip:** Manual and counted lengths never get the allowance or rounding — the rules only change measured runs.

[insert screenshot: material form — Name, Material fields, Ordering rules and the "These draft lengths change" preview]

### C2. What changed in the review (19 Oct 2026)

1. **Order step 300 mm for new flashings.** A new flashing rounds each ordered length **up to the next 300 mm** (with the 200 mm allowance), so a job orders a few standard lengths. Example: 4,312 mm measured → 4,800 mm ordered. You can still change it in **Round measured runs up to**. Existing flashings move to 300 mm when the owner runs migration 209 (flashings already on a placed order keep their step).
2. **Perforated:** the custom fields are folded under **Perforation details**. The summary line shows what is set, or "not specified yet".
3. **Lengths:** the top of **Flashing details** lists every finished length × quantity, whether it came from the plan or was typed, and anything that needs attention. Tap a plan length to see it on the plan.
4. **Save as company standard:** in the drawing (Profile editor) open **More › Save as company standard**. The flashing row also has **More › Save as standard**.

### D. Change an existing job material

1. **Profile** on the material row opens the profile editor for **this job's copy** (read-only users see **View profile**). Edit and **Save**.
2. **Rules** opens the material form (Section C).
3. **Remove** asks "Remove <name> and its measurements from this takeoff?" — see Section 12 for what is actually removed.

### E. Company standards (Hub — Admin / Supervisor)

1. **Save a job material as a standard:** on the material row tap **Save as standard**. A green banner says "Saved “<name>” as a company standard. This job keeps its own copy." Every tap creates a **new** standard — search the list first so you don't create duplicates.
2. **Edit a standard:** **Add material** → find the standard → **Edit**. The form shows "Company standard". Change the name, material details or rules and, optionally, the **Source review** (below), then tap **Save standard**. This creates the next revision (e.g. rev 2 → rev 3). The standard's profile shape is kept as saved — the standard form doesn't edit shapes. To change a standard's shape, edit the shape on a job and **Save as standard** (a new standard).
3. **Source review (optional):** **Source URL**, **Document title / edition**, **Page / section**, **Checked (YYYY-MM-DD)**, **Reviewed by**, and tick **I checked this against the cited source**. The standard only shows "source reviewed" when all of these are filled and ticked; otherwise it shows "user-entered". Never tick it without actually checking the supplier/manufacturer document.
4. **When a standard is updated:** every job using an older revision shows "The company standard was updated (rev N). This job still uses rev M." with **Update this job's copy**. Nothing changes until someone taps it. Tapping it **replaces this job's name, material details, rules and profile with the standard's latest revision** — any job-only edits to that material are overwritten (measurements stay).

> 💡 **Tip:** **Use on this job** always makes an independent copy. Editing the job copy never writes back to the standard, and editing the standard never changes a job unless that job chooses **Update this job's copy**.

---

## 6. What happens next

- The material appears in the overview's **Materials** list with its finish · colour · BMT · girth · item and piece counts, and becomes the active material in Measure.
- Measurements are assigned to the material and grouped in the length schedule by material specification **and** profile shape (SOP 20-05). Two different shapes with the same girth are never merged; a reversed or mirrored drawing of the same flashing is treated as the same part.
- Rule changes recalculate draft lengths straight away; frozen exports and placed orders don't change. If a placed order no longer matches, the schedule shows a surplus warning (SOP 20-05/20-06).
- Saving or editing a standard creates a new immutable standard revision; jobs are only offered the update.
- Everything autosaves (SOP 20-07). No email or notification is sent.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Leaving **Colour** blank | The default is blank on purpose | Enter the colour before ordering — otherwise "Material, finish, BMT or colour is missing." |
| Using **Mirror** to fix a wrong colour side | Mirror moves the shape too | Use **Flip coated face** |
| Typing the roof pitch as the fold angle | The two are easy to confuse | Enter the **included** angle inside the fold (90° = square fold) |
| Treating girth as the blank width | It's an indicative sum | Let the supplier apply their bend allowances |
| Tapping **Save as standard** twice | Each tap makes a new standard | Tap once; search the standards list first |
| Tapping **Update this job's copy** after customising the job copy | It replaces the job copy with the standard | Only update if you want the standard's version |
| Measuring runs with a "Finished pieces only" material | That material has no allowance logic for runs | Use a flashing material for runs |
| Changing the order ceiling to avoid splitting | It removes the safety check | Only raise it when the supplier confirms they can supply that length |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Give the material a name." | Name blank | Type a name |
| "Rounding increment must be a number greater than 0." / "Measured allowance must be 0 or more." / "Handling threshold must be a number greater than 0." / "Order ceiling must be a number greater than 0." | Rule blank, 0 or negative | Enter a valid number in mm |
| "Measured allowance looks too large (over 2,000 mm)." / "Rounding increment looks too large." / "Order ceiling looks too large." | Typo (e.g. metres vs mm) | Check the number |
| "BMT must be a thickness in mm, e.g. 0.55." | BMT typed wrongly (e.g. 55) | Type 0.55 |
| "Enter the leg length in mm, for example 100." / "Enter the included angle in degrees, for example 90." / "Enter the hem width in mm, for example 10." | Field blank or not a number | Type a number |
| "Leg 1 is longer than 5000 mm — check the number." | Leg over 5,000 mm | Check the size |
| "Included angle must be more than 0° and at most 180°." | Angle out of range | Use 1–180° |
| "Start hem needs a width between 1 and 200 mm." (or "End return …") | Hem/return width out of range | Use 1–200 mm |
| "A profile can have at most 100 legs." | Too many legs | Simplify |
| "That point doesn't add a leg — tap further from the last point, and not straight back along it." | Draw shape: tap too close or doubling back | Tap further away |
| "Check this profile: Legs N and M cross or touch — check the lengths and angles." | Self-crossing profile | Fix sizes/angles; it blocks ordering |
| "The saved profile couldn’t be read (…) — starting from a blank starter shape instead." | Damaged saved profile | Redraw it; don't save over without checking |
| "Material, finish, BMT or colour is missing." (schedule / order) | Spec incomplete | Fill in **Rules** → Material fields |
| "The flashing profile has a problem." (schedule / order) | Invalid or missing profile on a flashing material | Open **Profile** and fix it |
| "Only office staff can change company standards." | Worker app / non-staff tried to save a standard | Ask an Admin or Supervisor in the Hub |
| "This standard was changed by someone else — reload it" | Someone saved the standard first | Go back, reopen the standard and redo the change (note: this message currently only shows once you return to the takeoff overview) |
| "That company standard was not found." | Standard id/revision missing | Refresh the list and pick again |
| "No company standards yet. Draw a flashing, then use “Save as standard”." | None saved yet | Draw one and save it as a standard (Hub staff) |

---

## 9. Related modules

- [20-03 Measure runs and count pieces → measurements always belong to a material](20-03_measure_runs_and_count.md)
- [20-05 Length schedule and splitting → how rules and profiles group the schedule](20-05_length_schedule_and_split.md)
- [20-06 Export a supplier order → the PDF shows the profile drawing and material](20-06_export_and_record_orders.md)
- [16-07 Manage suppliers → supplier records used on orders](../16_procurement/16-07_manage_suppliers.md)

---

## 10. Screenshot placeholders

[insert screenshot: overview Materials list — material row with Profile, Rules, Add lengths, Save as standard, Remove]
[insert screenshot: profile editor with the amber "Check this profile" banner and "Save (has problems)"]
[insert screenshot: profile editor legend — Coated face, Dimensions in mm, Indicative girth]
[insert screenshot: end treatment panel — Closed hem, Hem width, Folds to the Left/Right]
[insert screenshot: Company standard edit form with the Source review fields]
[insert screenshot: overview banner "The company standard was updated (rev 2). This job still uses rev 1." with Update this job's copy]

---

## 11. Automation notes

- **Job material:** `takeoff_job_materials` row per material — `method_key` 'flashing_runs' (drawn flashing) or 'finished_piece_count' (pieces only), `method_version` 1, `spec` {product, productCode, finish, bmt, colour, colourCode, …}, `rules` {allowanceMm, incrementMm, handlingThresholdMm, orderCeilingMm}, `profile` jsonb (ordered legs in mm, signed turns per corner, start/end treatment {type, widthMm, side}, coatedFace left/right, schema version 1) or NULL, `from_preset_id` / `from_preset_revision` when copied from a standard, `revision` (+1 on each edit).
- The server **re-validates and normalises** every material (rules, spec, profile) before saving; client-calculated girth or results are never stored or trusted.
- **Use on this job:** the client sends only the standard id + revision; the server copies the content from `takeoff_material_preset_revisions` (anything else sent is ignored).
- **Company standard:** `takeoff_material_presets` (`name`, `current_revision`, `is_active`) + one immutable `takeoff_material_preset_revisions` row per save (`revision`, `name`, `method_key`, `spec`, `rules`, `profile`, `source_review`, `created_by_user_id`). Revisions can't be updated or deleted (trigger). Saving an edit checks the expected revision (two people editing → the second is refused).
- **Remove material:** `archived_at` set on the material and on its assignments (`takeoff_contributions`); the measurements themselves are not archived.
- Rule changes are previewed in the browser only; nothing is written until **Save material**.
- No email, notification or file is created.

---

## 12. Edge cases and limits

- Up to 100 legs per profile; legs up to 5,000 mm; end hems/returns 1–200 mm; included angles above 0° up to 180°.
- Profiles are stored as dimensions and turns; the drawing is generated from them. **Rotate 90°** never changes the stored part.
- A profile, its **reversed** version and its **mirror image** are the same physical part and share a schedule line (when the material spec also matches). A different shape, or the same shape with the coating on the other face (**Flip coated face**), is a different part — even with equal girth. Leg sizes are compared to 0.01 mm.
- A crossing profile can be saved but blocks ordering.
- Finish/colour lists are suggestions only — nothing here is a verified supplier catalogue unless a full source review is recorded on a standard.
- **Save as standard** always creates a new standard (no duplicate check). There is no button to retire/deactivate a standard yet, and the standard form can't edit a standard's profile shape.
- **Update this job's copy** overwrites job-only changes to that material with the standard's content.
- Job material edits keep only the latest rules (the row's `revision` counter goes up, but earlier rule values are not kept as history).
- **Remove** on a material clears its schedule lines, but its run lines and count dots stay visible on the plan (they are no longer assigned to anything). Remove them in Measure → Select if you don't want them showing.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-13

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Local dev, isolated/test database **with migration 206 applied**, `TAKEOFF_ENABLED=true`.
- [ ] Two `BLH TEST` carpentry jobs (Job A, Job B), each with a takeoff and a **Ready** scaled plan (SOP 20-02).
- [ ] Logins: Admin, Supervisor; a leading-hand Worker-app token for Job A.
- [ ] Devtools Network tab open; SQL access to the test database.

### Test cases

**TC-01 — Happy path (draw a flashing and save the material)**
1. Job A → **Add material** → **Draw new flashing**. Confirm the grid is empty and Save is greyed out. Tap 4 points to draw 3 legs, **Done drawing**, then set L1 = 120, L2 = 200, L3 = 60; Corner B1 = 90° Left; End = Closed hem 10 mm folding Right. **Save**.
2. In **New material**: Name "BLH TEST Barge", Colour "Monument" (leave Product "Flashing", Finish "COLORBOND", BMT 0.55). **Save material**.
3. Expected result: Measure opens with "BLH TEST Barge"; the overview row shows "COLORBOND · Monument · 0.55 BMT · girth 390 mm · 0 item(s) · 0 pcs" (girth = 120 + 200 + 60 + 10).
4. Expected API: commit with `changes.materials.upsert[0]` → `{ ok: true, commit: { revision: R+1 } … }`.
5. Expected DB record: `takeoff_job_materials` — `name` 'BLH TEST Barge', `method_key` 'flashing_runs', `method_version` 1, `spec->>'colour'` 'Monument', `spec->>'bmt'` '0.55', `rules` = {allowanceMm 200, incrementMm 100, handlingThresholdMm 6000, orderCeilingMm 9000}, `profile` with 3 segments, 2 bends, `end.type` 'closed_hem', `from_preset_id` NULL, `revision` 1, `archived_at` NULL.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Material form: clear **Name**, tap **Save material**. Set **Round measured runs up to** to 0, save.
2. Profile editor: type "abc" as a leg length → **Apply**; type 0 as an included angle → **Apply**; choose Closed hem with blank width → **Apply**.
3. Via API commit a material with `spec.bmt: 55`.
4. Expected result: "Give the material a name."; "Rounding increment must be a number greater than 0."; "Enter the leg length in mm, for example 100."; "Included angle must be more than 0° and at most 180°."; "Enter the hem width in mm, for example 10."; API HTTP 400 "BMT must be a thickness in mm, e.g. 0.55."
5. Expected DB: no new material / revision.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. In the Hub, on "BLH TEST Barge" tap **Save as standard** twice.
2. Tap **Use on this job** twice for the same standard.
3. Expected result (documented behaviour): step 1 creates **two** `takeoff_material_presets` rows with the same name (no duplicate guard — flag to the owner); step 2 creates **two** independent job materials. Record what actually happens.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. As the leading hand (Worker app) open Job A's takeoff.
2. Send `POST /api/worker/takeoff/presets` with a standard body.
3. As a Hub "employee" login call `POST /api/takeoff/presets`.
4. Expected result: step 1 — no **Save as standard** button and no **Edit** next to standards (only **Use on this job**); standards are still listed. Step 2 — no such worker route (HTTP 404); step 3 — HTTP 403 "Forbidden".
5. Expected DB: no new preset rows.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (server copies the standard, immutable revisions, A24)**
1. Commit a job material with `fromPreset: { presetId, revision: 1 }` **and** tampered `rules.allowanceMm: 0` and a different profile.
2. Run `UPDATE takeoff_material_preset_revisions SET rules='{}' WHERE preset_id='<id>';`.
3. Expected result: the stored job material's `rules`, `spec` and `profile` equal revision 1 of the standard (tampered values ignored); `from_preset_id` / `from_preset_revision` set. Step 2 fails with `TAKEOFF_IMMUTABLE`.
- [ ] Pass  [ ] Fail

**TC-06 — Reusable profile: job copy independence (A10)**
1. Create standard S (rev 1). **Use on this job** in Job A and Job B.
2. In Job A edit the profile (L2 = 250) and Colour.
3. Edit S in the standard form (e.g. change Colour) → **Save standard**.
4. Expected result: after step 2, `takeoff_material_preset_revisions` for S still has only rev 1 with the original values; Job B's material unchanged. After step 3 S has rev 2 (`current_revision` 2); Jobs A and B both show "The company standard was updated (rev 2). This job still uses rev 1." and are **unchanged** until **Update this job's copy** is tapped; tapping it in Job B sets `from_preset_revision` 2 and copies rev 2's content.
- [ ] Pass  [ ] Fail

**TC-07 — Rule edit preview; frozen exports unchanged (A11)**
1. In Job A measure a 4,312 mm run on the material and export a draft PDF (SOP 20-06); note `snapshot_sha256` and `pdf_sha256`.
2. Open **Rules**, change **Measured allowance** 200 → 300 (do not save yet), then **Save material**.
3. Expected result: preview "These draft lengths change: Before: 1 × 4,600 / After: 1 × 4,700"; after saving the schedule shows 1 × 4,700; the run's `raw_length_mm` unchanged; the export's `snapshot_sha256`, `snapshot` and PDF bytes (sha256 = `pdf_sha256`) are unchanged.
- [ ] Pass  [ ] Fail

**TC-08 — Mirror vs Flip coated face vs Reverse direction**
1. Start from the TC-01 profile (coated face left). Tap **Flip coated face**; note the legend. Undo. Tap **Mirror**; note bend directions and coated face. Undo. Tap **Reverse direction**.
2. Save, close and reopen the profile.
3. Expected result: Flip → only the coated face changes (left → right), shape identical. Mirror → shape mirrored (each bend direction flips) **and** coated face flips. Reverse → legs listed in reverse order (L1 = 60 …), coated face side flips, end hem moves to the start. Coated face survives save and reload.
4. Make three extra materials with the same spec: one Reversed, one Mirrored, one with **Flip coated face** applied; add a manual 3,000 mm length to each and to the original.
5. Expected result: original + reversed + mirrored share **one** schedule line "3 × 3,000" (same physical part); the flipped-coating one is a **separate** line "1 × 3,000".
- [ ] Pass  [ ] Fail

**TC-09 — Equal girth never merges**
1. In Job A create two flashing materials with identical spec: profile P1 = 100/150/50 with 90°/90° and profile P2 = 150/100/50 with 90°/135° (same girth). Add a manual 3,000 mm length to each.
2. Expected result: two separate schedule lines "1 × 3,000" under two material groups (never "2 × 3,000").
- [ ] Pass  [ ] Fail

**TC-10 — Invalid profile and incomplete spec block ordering**
1. Make a profile whose legs touch: four legs 100 / 100 / 100 / 150 mm with all three corners 90° **Left** (the fourth leg runs back across the start of L1). Save — the button reads **Save (has problems)**.
2. Clear **Colour** on another material.
3. Expected result: profile editor banner "Check this profile: Legs 1 and 4 cross or touch — check the lengths and angles. You can still save it, but it can't go on an order until it's fixed."; schedule lines show "needs attention" with "The flashing profile has a problem." / "Material, finish, BMT or colour is missing."; order readiness lists them and **Export supplier PDF** stays disabled.
- [ ] Pass  [ ] Fail

**TC-11 — Source review status**
1. Edit a standard; fill Source URL, Document title / edition, Checked 2026-10-13, Reviewed by; **do not** tick the box → **Save standard**. Then tick the box → **Save standard**.
2. Expected result: first save → list shows "user-entered"; second → "source reviewed". DB: latest revision `source_review` = {sourceUrl, title, checkedAt '2026-10-13', reviewedBy, status 'reviewed'}.
- [ ] Pass  [ ] Fail

**TC-12 — Concurrent standard edit**
1. Two Admin sessions open the same standard in the standard form; both change it; save session 1, then session 2.
2. Expected result: session 2 is refused (HTTP 409 "This standard was changed by someone else — reload it"); only one new revision exists. Note whether the message is visible in the Choose material window (current code shows it only after returning to the overview).
- [ ] Pass  [ ] Fail

**TC-13 — New flashing order step (HUB 005, UI Review)**
1. **Flashings** → **Add flashing** → **Finished pieces only (no drawing)**.
2. Expected: **Round measured runs up to** shows 300; **Measured allowance (total per run)** shows 200.
- [ ] Pass  [ ] Fail

**TC-14 — Perforation folded and Lengths list (HUB 004 / HUB 012, UI Review)**
1. Tap the "Apron flashing" row → **Details**. Expected: a **Lengths** list at the top ("N pieces · X LM", each "… mm").
2. Choose **Perforated**. Expected: **Perforation details** is collapsed (no **Hole size** field showing) until tapped.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
