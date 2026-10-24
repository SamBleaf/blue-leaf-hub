---
sop_version: 1.4
last_reviewed: 2026-10-21
app_version: takeoff-r03 (TC-R04 build, commit 8f9190f)
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Company Product Catalogue (Timber, Cladding, Battens, Aluminium, Accessories)

**Module:** Takeoffs (timber, cladding, aluminium and flashing from plans)  
**SOP ID:** 20-12  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-14):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED` (SOP 20-01). A read-only check on 2026-10-14 found migration 206's tables present in production (`docs/takeoff/evidence/live-206-verification-2026-10-14.txt`). The company catalogue for timber / cladding / aluminium is part of the **TC-R04 build on branch `takeoff-r03`**; job copies of these products need **migration 207 (`supabase/migrations/207_takeoff_generic_methods.sql`), which is NOT applied in production** — it must not be applied until the Director approves the TC-R04 release. Nothing in this SOP has been tested against the live app; Section 14 runs in UI Review Mode (mocked data).

> **Read this first:** a company product records **what is bought and how it is measured**. Marking a group "Reviewed" means someone checked the **transcription against the named source** — it does not make an installation compliant. Installation stays **source-pending** for every product in this build ("No reviewed guide rows are loaded, so automatic fixings stay off"). Flashing standards are a separate list (SOP 20-04).

---

## 1. Who uses this

| Action | Admin (Director) — Hub | Supervisor — Hub | Leading hand — Worker app | View-only / Admin preview |
|---|---|---|---|---|
| See company products in a setup card | Yes | Yes | Yes | Yes |
| **Use on this job** (make this job's copy) | Yes | Yes | Yes | No |
| **New company product…**, **Edit company product**, **Save as standard**, **Save company version** | Yes | Yes | **No** | No |
| **Add to company products** (aluminium card only, HUB 024) | Yes | Yes | **No** (a Worker-app login linked to an Admin or Supervisor account: **Yes**) | No |
| **Review update** → **Update this job's copy** / **Keep this job's copy** | Yes | Yes | Yes | No |

Without edit-standards permission the editor is read-only: "Only office staff can change company standards. You can use this product on a job; the job keeps its own copy."

---

## 2. When to use it

- The company uses the same product again and again (e.g. "Axon 133 — Supplier A", "Rafters 90 × 45 MGP10 H2", "Window angle 50 × 50 × 3 mill") and you want jobs to start from it.
- A job material was set up well and should become the company version (**Save as standard**).
- A supplier, size, stock length or review changed and the company product needs a new version.
- A job shows "The company standard was updated (rev N). This job still uses rev M."

---

## 3. What this does

Company products live in one catalogue, grouped by kind (Timber, Fibre cement cladding, AAC panels, Rendex foam, Timber cladding, Support battens, Aluminium profiles, Accessories). Each product uses one of the app's **existing calculation methods** — there are **no formula fields**; a new kind of calculation is a development change. The editor has three tabs — **Product**, **Ordering**, **Installation** — and each has its own **source and review** state (Candidate → Transcription checked → Reviewed, with the source, who checked it and the date). When a job uses a product it gets an **independent copy** of that exact version: editing the job copy never changes the company product or another job, and a new company version never changes a job until someone reviews the differences on that job and taps **Update**.

---

**Company defaults are separate (HUB 014).** A *company default* is not a company product: it holds only Blue Leaf's routine choices for one catalogue product (fixing route, wind class, substrate, on/off studs, fastener, spares, stocked lengths, supplier, the sheet joint rule). It is applied automatically when that product is picked on the cladding card and is never listed under **Company products** here. It is saved only from the cladding card with **Save as company default** (Admin / Supervisor, and Worker-app logins linked to those accounts) — see SOP 20-09 §5A. Migration 211 seeds the James Hardie defaults (Axon, Linea, Stria, Matrix) with Sam's reviewed values.

## 4. Before you start

- You are Admin or Supervisor in the Hub (Section 1).
- Have the source documents: product page / data sheet (sizes, cover, SKUs), supplier price list or confirmation (stock lengths, packs, codes), installation guide or project detail (assembly, spacing). Note the edition / page / table you checked.
- Job copies need migration 207 on the database.

---

## 5. Step-by-step process

### A. Find the company products

1. Open the setup card for the kind of material: overview → **Add timber**, **Add cladding** or **Add aluminium** (or **Setup** on an existing timber / cladding / aluminium row).
2. At the top: **Company products** with **Search company products**. Products are grouped under their kind. Each shows its name and **rev N**, the spec line, supplier, availability ("confirm with supplier" / "supplier confirmed"), review badges (**Product: …**, **Ordering: …**, **Installation: Source-pending**), **Sources** and any values it brings that depend on the job's conditions — e.g. "Brings max support spacing 600 mm (H02 Table 1 N2) — check it suits this job's wind class and substrate."
3. Flashing standards are **not** here: they are under **Add flashing** → **Choose flashing** (SOP 20-04), which says "Timber, cladding and aluminium products are under Add timber / Add cladding / Add aluminium."

### B. Create a new company product

1. In the setup card tap **New company product…** (cladding card) or **New company product** (timber / aluminium cards). The **New company product** window opens (**Cancel** top left).
2. **Product name (as the crew will see it)** — e.g. "Spotted gum shiplap 135 — Supplier A".
3. **What is it?** — **Fibre cement**, **AAC panel**, **Rendex foam**, **Timber cladding**, **Support batten**, **Timber member**, **Aluminium profile**, **Accessory**.
4. **Calculation method (existing methods only)** — e.g. Sheets / Courses / boards / Panel grid; Fixed-length boards / Random lengths (LM); Repeated members / Stud wall / Linear stock; Cut from bars. It shows "Uses <method> (<key@version>). There are no formula fields: a new kind of calculation is a development change, not a catalogue setting."
5. **Product** tab: optional **Start from a researched product** (fibre cement, AAC, battens); manufacturer, product / system, width, thickness, finish, SKU, effective cover (never the nominal width), ends, coating; timber purpose, section, grade, species, treatment, plies ("Size: manual selection — the app does not check structural adequacy."); aluminium legs, thickness, alloy / temper, finish, colour. **Source references**: tap register codes (H01 …, A04 …, T01 …, F01 …, OWNER-2026-10-14) or type **Other reference** → **Add**. Then **Product facts — source and review**.
6. **Ordering** tab: **Supplier**, **Supplier code**, **Availability**; timber **Stock** (1200 then every 300 — **Longest available length**, unavailable grid lengths, **End allowance**); aluminium **Stock length**, **Saw kerf** ("Each job still confirms it before ordering."), **End trim**, **Keep offcuts from**; random timber **Supplier ordering increment** and the random mix; other products **Listed lengths / heights** (with **SKU for N mm** per length), **Pack quantity (published)**, **Supplier sells full packs only**; **Spares** (%). Then **Ordering — source and review**.
7. **Installation** tab: **Orientation**; **Installation assembly (choose or duplicate)** — only this product's own assemblies are listed (AAC brands and wall systems are never mixed; foam never gets a fibre-cement or AAC assembly); **Duplicate as a company version** → **Company assembly name**, **Detail / drawing reference** ("It stays source-pending until its rule rows are reviewed — duplicating never approves it."), **Remove company version**; system values (AAC adhesive joint, Matrix joint gap, minimum cut strip, support spacing + authority, timber centres); accessory items (routes, scope, reviewed yields — a project detail is never stored on a company product); **Installation state: Source-pending**; then **Installation — source and review** ("Quantity checks are separate from installation suitability …").
8. Review a group: choose **Transcription checked** or **Reviewed**, then fill **Checked against (document, edition, page / table / row)**, **Checked by**, **Date checked** (and **Source link** for Product). A reviewed tab shows ✓.
9. Read the bottom: the statuses a job gets before anything is measured, and any "**Jobs can measure with this, but can't order until:** …" list.
10. Tap **Save company version**. The card's list shows the product as **rev 1**; the overview shows "Saved “<name>” to the company catalogue. Jobs keep their own copies until you update them."

> 💡 **Tip:** an unsaved company product is kept on this device: reopening the editor offers "Unsaved changes to this product from … were kept on this device." **Restore** / **Discard**. **Cancel** clears it.

### C. Save a job material as a company product

1. On the overview row of a timber / cladding / aluminium material tap **Save as standard**.
2. The **New company product** editor opens filled from the job material. Values that belong to that job only are left out and listed: "Left out of the company product — they belong to the job they were entered on: …" (e.g. "supports marked as already existing", a project detail).
3. Check each tab and review state, then **Save company version**.

### D. Use a company product on this job

1. In the setup card tap **Use on this job** on the product. The current job material becomes **this job's copy** of that version (its walls and measurements stay attached); the card subtitle reads "<name> · this job only".
2. Check every value the product **brings** for this job's conditions (wind class, substrate, wall heights) — they are never trusted silently.
3. Changes you make on the job now apply to this job only.

> 💡 **Timber (HUB 027):** a company timber product also shows in the timber card's **Size and grade** list, under **Company products**, for the purpose it was saved for (a Battens product on Battens only). Picking it there fills only its size, grade, treatment, species, supplier and supplier code (SOP 20-08 Section 5A step 4). **Use on this job** here still copies the whole product. Save each supplier's LVL as a company timber product for Studs, with its own grade and treatment: the app has no built-in LVL grade or treatment.

### E. Make a new company version

1. In a setup card tap **Edit company product** on the product (Hub office staff).
2. Change what is needed and **Save company version**. The product becomes **rev N + 1**. "Saving makes a new company version. Jobs keep their own copies until someone chooses to update them."

### F. Review a newer version on a job

1. A job using an older version shows on its overview row: "The company standard was updated (rev 2). This job still uses rev 1." with **Review update**.
2. **Review update** opens **Company product updated**: "The company updated <name> to rev 2. This job still uses its own copy of rev 1, with the differences below." A table lists each **Field** with **This job now** and **Company rev 2** (**Show all N differences** for long lists).
3. Read the warnings: "Updating removes a value entered on this job (…). Re-enter it afterwards if it still applies."
4. **Quantity impact on this job** shows **Now** and **With rev 2** — the quantities and the three statuses — and "Draft order lines are recalculated; orders already exported or placed never change."
5. Tap **Update this job's copy to rev 2** to take the new version, or **Keep this job's copy** to leave the job as it is. Nothing changes until you tap Update.
6. Flashing standards use **Update this job's copy** straight from the banner (SOP 20-04).

### G. Add an aluminium setup to the company products (HUB 024)

1. In the **Aluminium** card, finish this job's setup, then tap **Add to company products** (beside **New company product**, under the search).
2. It asks for the product's name, starting with this item's name ("Add this setup to company products? Other jobs find it by this name. This job keeps its own copy."), then saves this job's profile, finish, stock length, cutting settings and window detail under it. Full steps: SOP 20-10 Section 5F.
3. The kerf value is kept but its confirmation is not: every job that uses the product ticks **The saw kerf above is confirmed for this job** itself.
4. The same name with the same angle size asks first: "A company product called “…” already exists. OK = save this as its new version. Cancel = keep the existing one."
5. The same name with a different size is never overwritten: the app asks for the setup's own name and offers one (e.g. "Aluminium angle 40 × 40 × 2"). The server refuses it too.
6. If someone else saved that product a moment before, nothing is saved and the next tap of **Add to company products** saves yours as its new version.
7. This job is not linked to the product. It keeps its own copy, so a later change on this job never reaches the company product. A job that saves its own copy as the new version isn't told its company standard was updated.

---

## 6. What happens next

- Saving creates a new **revision** of the company product; earlier revisions are kept. Job copies keep the revision they were made from.
- A job copy of a product carries `fromPresetId` / `fromPresetRevision`; the server copies **that exact revision** when you tap **Use on this job** or **Update**.
- Draft order lines that depended on the old copy are recalculated after an update (stale lines must be updated on the order — SOP 20-06); exported and placed orders never change.
- No email or notification is sent.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Marking a group "Reviewed" without the source, person and date | Wanting the green badge | Fill **Checked against**, **Checked by**, **Date checked** — or leave it **Candidate** |
| Treating "Reviewed" as installation approval | Wording | Review = transcription checked; installation stays source-pending |
| Saving a second product with the same name | No duplicate warning for these products | Search the list first; edit the existing product instead |
| Expecting a company change to update jobs automatically | Thinking products are shared | Each job reviews and updates its own copy |
| Trusting a product's support spacing on a different wind class | The product "brings" it | Check every "Brings …" value on each job |
| Putting a job's project detail into a company product | Copying from a job | The editor leaves job-only values out — re-enter them per job |
| Entering the nominal width as cover | Habit | Use the product / supplier **effective cover** |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Give the product a name." | Name blank | Type a name |
| "Product review: add the source reference, who checked it and the date — or leave it as a candidate." (or Ordering / Installation) | Review state set without evidence | Fill the evidence or set **Candidate** |
| "Choose one of the existing calculation methods for this kind of product." | Method doesn't fit the kind | Pick one of the method chips |
| "Jobs can measure with this, but can't order until: …" | Product facts missing (e.g. stock lengths, cover, adhesive joint) | Fill them, or accept that each job must |
| "Check these — they belonged to the previous choice and are NOT being used" | Kind / product / method / orientation changed | **Use** only if it applies; these are not saved unless you choose Use |
| No **New company product** / **Edit company product** / **Save as standard** | Leading hand / view-only | Ask office staff |
| "Only office staff can change company standards …" | Editor opened without permission | Ask office staff |
| "No company products for this yet. Set one up here, or add it from the researched catalogue in the setup card." | Nothing saved for that kind (Hub office staff) | Create one (Section 5B) |
| "No company products for this yet. Finish the setup below, then tap Add to company products." | Nothing saved for aluminium yet (office staff) | Finish the setup, then **Add to company products** (Section 5G) |
| "No company products for this yet." (aluminium and timber) or "… Add it from the researched catalogue in the setup card." (cladding kinds), with no buttons | Leading hand, or a login that can't create products here | Ask office staff |
| "Someone else saved that company product just now. Nothing was saved. Tap Add to company products again to save yours as its new version." | Another office login saved the same aluminium product a moment before | Tap **Add to company products** again |
| "“…” is a 50 × 50 × 3 angle. Give this 40 × 40 × 2 setup its own name." | A new version was sent for a product of another size | Give the setup its own name (SOP 20-10 Section 5F) |
| "Only office staff can add company products." | Not an office login | Ask office staff |
| "No researched assembly lists this product, method and orientation — supports and fixings need a reviewed project detail." | Custom product | Record the project detail on the job |
| "Can't preview: …" in Quantity impact | The new version can't be calculated on this job | Keep the job copy; fix the company product |
| A save error such as "Someone else changed …" | Two people saved the same product | Reopen the product and redo the change |

---

## 9. Related modules

- [20-04 Flashing profiles, materials and company standards → flashing standards (separate list)](20-04_profiles_materials_standards.md)
- [20-08 Timber takeoff → timber setup card](20-08_timber_takeoff.md)
- [20-09 Cladding walls, openings and the generated elevation → cladding / batten / accessory setup cards](20-09_cladding_walls_and_elevation.md)
- [20-10 Aluminium profiles and the cutting sheet → aluminium setup card](20-10_aluminium_cutting_sheet.md)
- [20-06 Export a supplier order and record it as placed → stale order lines after an update](20-06_export_and_record_orders.md)

---

## 10. Screenshot placeholders

[insert screenshot: setup card — Company products list with review badges, Sources and "Brings …"]
[insert screenshot: New company product — What is it?, Calculation method, "There are no formula fields"]
[insert screenshot: Product tab — source references and Product facts review group]
[insert screenshot: Ordering tab — supplier, stock lengths with SKU per length, pack quantity]
[insert screenshot: Installation tab — assembly list, Duplicate as a company version, Installation state Source-pending]
[insert screenshot: overview banner "The company standard was updated (rev 2) …" with Review update]
[insert screenshot: Company product updated — field diff table, Quantity impact, Update / Keep buttons]

---

## 11. Automation notes

- **Save company version** → `POST /api/takeoff/presets` (staff API, edit-standards only) with `content` { name, methodKey, methodVersion, spec, rules, sourceReview } — and `presetId` + `expectedRevision` for an existing product. Server function `takeoff_save_preset` writes `takeoff_material_presets` (`current_revision` + 1) and a `takeoff_material_preset_revisions` row (`UNIQUE (preset_id, revision)`); older revisions are kept.
- **Content rules:** `rules.carried`, `rules.jointRowsDraft`, accessory `recipe.authority` (project detail) and `existing` supports are stripped (job-only); review states live in `rules.review` { product | ordering | installation: { state, ref, by, at } }; the product source link is stored on `sourceReview.sourceUrl`.
- **Use on this job / Update** → a job-material upsert with `fromPreset` { presetId, revision }; the server copies that exact revision into `takeoff_job_materials` (`from_preset_id`, `from_preset_revision`) — a deep snapshot, never a live link.
- **Review update** compares the job copy with the latest revision field by field and runs the real calculation twice on this job (`computeWorkspace`) for the quantity impact — read-only until **Update**.
- **Drafts:** an unsaved company product is kept in this device's storage (`blh:takeoff:catalogue-draft:…`).
- **Add to company products** (aluminium, HUB 024) → `POST …/company-products` on the Hub and the Worker app (capability `addCompanyProducts`; never preview). Aluminium `linear_stock` only, complete profile size, `spec.kerfConfirmed` forced false, `rules.carried` / `defaultsFrom` / `companyDefault` dropped, `sourceReview` "user_entered", then `takeoff_save_preset`. It revises only an active aluminium company product (same name, `expectedRevision`) with the same profile (a different Leg A / Leg B / Thickness is refused 400), never a flashing standard or company default, and never retires. `POST /api/takeoff/presets` stays Hub-only. No migration.
- No email, notification or file is created.

---

## 12. Edge cases and limits

- **No duplicate-name check** for timber / cladding / aluminium products saved from the editor: saving "New company product" twice with the same name makes two products. (Flashing standards, and **Add to company products** on the aluminium card, ask before saving over a same-name product.)
- **Save as standard** and **New company product** (the editor) keep an aluminium kerf's confirmation tick in the product, although the editor says "Each job still confirms it before ordering." **Add to company products** never does. Not changed in HUB 024; reported to the owner 2026-10-21.
- **No Retire button** for these products in this build (only flashing standards can be retired, in **Choose flashing**). Reported to the owner 2026-10-14.
- **Keep this job's copy** only closes the review — the "company standard was updated" banner shows again next time while the job is on an older revision.
- A product can't hold job conditions (project detail, existing supports, "check these" flags); older products that carry them show them as **Brings …** notes to check.
- Updating a job copy replaces values entered on the job — the review lists them first.
- Installation review states never switch on automatic fixings in this build.
- Company products are company-wide; there is no per-supplier catalogue sync or price data.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] **UI Review Mode on your own server — never port 5180 and never production.** `VITE_UI_REVIEW_MODE=true npx vite --port <PORT> --strictPort` (or the agents' no-HMR config); Playwright with `PLAYWRIGHT_BROWSERS_PATH=0`, `UI_REVIEW_PORT=<PORT>`. Stop it afterwards.
- [ ] Phone viewport 390 × 844 with touch (375 × 812 for layout checks).
- [ ] Default job `http://localhost:<PORT>/carpentry/cjb-1/takeoff?reviewRole=admin` (the only company product at start is the flashing standard **Apron flashing** rev 2). Mixed job: add `&takeoffSeed=mixed`.
- [ ] The fake catalogue lives in the page: products saved in one page load are gone after a reload. Read them with `await (await fetch("/api/takeoff/presets")).json()`; the job with `await (await fetch("/api/takeoff/workspaces/ws-1")).json()`.
- [ ] Use synthetic names containing "BLH TEST" and fake suppliers ("Supplier A"); never real supplier contacts.

### Test cases

**TC-01 — Happy path (create a product, use it on the job)**
1. Default job → **Add cladding** → **New company product…**.
2. Name "Axon 133 — BLH TEST company"; **Start from a researched product (optional)** → **Axon 133 smooth**; **Ordering** tab → Supplier "Supplier A"; **Save company version**.
3. In the card's **Company products** list tap **Use on this job** on it.
4. Expected result: step 1 — window **New company product**, **What is it?** = Fibre cement, "Uses Cladding — sheet layout (Axon, Rendex) (sheet_layout@2). There are no formula fields …"; step 2 — back in the card, list group **FIBRE CEMENT CLADDING** shows "Axon 133 — BLH TEST company rev 1", "… · Supplier A · confirm with supplier", badges "Product: Candidate — not reviewed", "Ordering: Candidate — not reviewed", "Installation: Source-pending", "Sources: H01, H02", buttons **Use on this job** / **Edit company product**; step 3 — the card subtitle becomes "Axon 133 — BLH TEST company · this job only" and the chip **Saved**.
5. Expected record: presets list contains { name "Axon 133 — BLH TEST company", revision 1, methodKey "sheet_layout" }; the job's cladding material has `fromPresetId` = that id, `fromPresetRevision` 1, `spec.supplierName` "Supplier A". Live DB: `takeoff_material_presets` + `takeoff_material_preset_revisions` (rev 1); `takeoff_job_materials.from_preset_revision` 1.
- [ ] Pass  [ ] Fail

**TC-02 — Empty / invalid fields**
1. **Add cladding** → **New company product…** → **Save company version** with no name.
2. Name "X"; **Product facts — source and review** → **Reviewed** → **Save company version**.
3. Set the review back to **Candidate** → **Save company version**.
4. Expected result: step 1 "Give the product a name." and nothing saved; step 2 "Product review: add the source reference, who checked it and the date — or leave it as a candidate." and nothing saved; step 3 saves (presets list grows by one).
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. After TC-01, create another product with exactly the same name "Axon 133 — BLH TEST company" → **Save company version**.
2. **Close** the card → overview → **Add cladding** again (a second cladding material) → in its card tap **Use on this job** on the TC-01 product → set **Spares** to 7 (Enter).
3. Expected result: step 1 — two separate products with the same name are listed (no duplicate warning — current behaviour, Section 12); step 2 — the second material is its own copy: the TC-01 job copy and the company product keep their spares (not 7); both job copies have `fromPresetRevision` 1 and different material ids; the presets list is unchanged by step 2.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Leading hand: `/worker/takeoff/carpentry/cjb-1?takeoffSeed=mixed` → overview rows; **Add cladding** card.
2. Supervisor: `/carpentry/cjb-1/takeoff?reviewRole=supervisor&takeoffSeed=mixed`.
3. Expected result: step 1 — no **Save as standard** on any row; the card shows **Company products** but no **New company product…** and no **Edit company product**; step 2 — **Save as standard** and **New company product…** are shown (office staff).
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (new version never changes the job silently)**
1. After TC-01: in the card tap **Edit company product** → **Ordering** → **Spares** 10 (Enter) → **Save company version** → **Close**.
2. Read the overview row of the job copy and the presets list.
3. Expected result: presets list shows the product at **revision 2** with `spec.spareRate` 10; the job copy still has `fromPresetRevision` 1 and its own spares; the overview row shows "The company standard was updated (rev 2). This job still uses rev 1." with **Review update**. No email/notification.
- [ ] Pass  [ ] Fail

**TC-06 — Review update: diff, impact, explicit update**
1. After TC-05 tap **Review update**.
2. Tap **Keep this job's copy**; then tap **Review update** again and **Update this job's copy to rev 2**.
3. Expected result: window **Company product updated**: "The company updated Axon 133 — BLH TEST company to rev 2. This job still uses its own copy of rev 1, with the differences below."; table row **Spares (%)** — This job now "not set", Company rev 2 "10"; **Quantity impact on this job** with **Now** / **With rev 2** and statuses; "Draft order lines are recalculated; orders already exported or placed never change."; Keep closes with no change (job `fromPresetRevision` still 1, banner still shown); Update → job copy `fromPresetRevision` 2, `spec.spareRate` 10, banner gone.
- [ ] Pass  [ ] Fail

**TC-07 — Save as standard leaves job-only values out**
1. Mixed job → **Cavity battens** → **Setup** → tick **These supports already exist (layout only — not purchased)**; **Spacing authority** "H02 Table 1 N2" → **Close**.
2. On the Cavity battens row tap **Save as standard**.
3. **Installation** tab; then **Save company version**.
4. **Add cladding** → Material **Support battens** → read the **Company products** list.
5. Expected result: step 2 — editor **New company product**, method "Support grid … (support_grid@1)", banner "Left out of the company product — they belong to the job they were entered on: supports marked as already existing."; step 3 — Installation tab shows **Installation state: Source-pending** and "No reviewed guide rows are loaded, so automatic fixings stay off …"; overview notice "Saved “Cavity battens” to the company catalogue. Jobs keep their own copies until you update them."; step 4 — the product is listed under **SUPPORT BATTENS** with "Brings max support spacing 600 mm (H02 Table 1 N2) — check it suits this job's wind class and substrate."
6. Expected record: the saved preset `rules` has `maxSpacingMm` 600 and `spacingRef` "H02 Table 1 N2" and **no** `existing`.
- [ ] Pass  [ ] Fail

**TC-08 — Family entry points start from that kind's defaults; flashing list stays separate**
1. Default job → **Add aluminium** → **New company product** → **Ordering** tab.
2. **Cancel**; overview → **Add flashing**.
3. Expected result: step 1 — **What is it?** = Aluminium profile, method "linear_stock@1", **Stock length** 6500, **Saw kerf** empty; step 2 — **Choose flashing** lists **Apron flashing** (and no timber / cladding / aluminium products) and, once any such product exists, "Timber, cladding and aluminium products are under Add timber / Add cladding / Add aluminium."
- [ ] Pass  [ ] Fail

**TC-09 — Change of kind flags old values; review per tab**
1. **Add cladding** → **New company product…** → **What is it?** **AAC panel** → **Installation** tab → **Approved adhesive joint (system value)** 3 → back to **Product** tab → **What is it?** **Fibre cement**.
2. **Product** tab → **Transcription checked** → fill **Checked against** "H01 product page 2026", **Checked by** "BLH TEST", **Date checked** today.
3. Expected result: step 1 — amber "Check these — they belonged to the previous choice and are NOT being used" naming the adhesive joint with "These are not saved with the company product unless you choose Use."; step 2 — the **Product** tab label shows "Product ✓".
- [ ] Pass  [ ] Fail

**TC-10 — Unsaved product recovery on this device**
1. Default job → **Add cladding** → **New company product…** → name "BLH TEST draft" (tab out so it commits). Do **not** save — reload the page instead.
2. After the reload (if the overview also offers "Unsaved changes … were found on this device", either button is fine for this test): **Add cladding** → **New company product…** again.
3. Tap **Restore**. Then tap **Cancel**, and open **New company product…** once more.
4. Expected result: step 2 — banner "Unsaved changes to this product from <date, time> were kept on this device." with **Restore** / **Discard**; step 3 — Restore puts "BLH TEST draft" back in the name; after **Cancel** the reopened editor offers nothing (the kept draft was cleared). Nothing was added to the presets list.
- [ ] Pass  [ ] Fail

**TC-11 — Add to company products (aluminium, HUB 024)**
1. Default job → **Add aluminium** → **Saw kerf** 3 (Enter), tick confirmed → **Add to company products** → **OK** on the name offered.
2. Read the **Company products** list and the presets list.
3. Supervisor (`reviewRole=supervisor`) and the Worker-app office login (`/worker/takeoff/carpentry/cjb-1?section=timber_cladding&takeoffWorker=office`) → **Add aluminium**; then the leading hand (`/worker/takeoff/carpentry/cjb-1?section=timber_cladding`) → **Add aluminium**, **Close**, **Add timber**.
4. Expected result: step 1 — "Added “Aluminium angle 50 × 50 × 3” to company products. Other jobs can use it; this job keeps its own copy."; step 2 — listed under **ALUMINIUM PROFILES** with **rev 1**; the preset has `spec.kerfMm` 3, `spec.kerfConfirmed` false, `spec.stockLengthMm` 6500 and no `rules.carried` / `defaultsFrom` / `companyDefault`; the job material keeps its confirmed tick and has no `fromPresetId`; step 3 — **Add to company products** shows for the supervisor and the office login (no **New company product** in the Worker app); the leading hand has neither button and reads "No company products for this yet." (never "Set one up here"), and on **Add timber** the same, never "researched catalogue". Full flow: SOP 20-10 TC-13; the review fixes (a different size, someone else saving first, a job's own new version): SOP 20-10 TC-15.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values (fake catalogue / snapshot; live DB only on an isolated test database)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
