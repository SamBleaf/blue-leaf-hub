---
sop_version: 2.0
last_reviewed: 2026-10-14
app_version: takeoff-r03 (TC-R04 build, commit 8f9190f)
screenshot_status: needs_replacement
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Export a Supplier Order and Record It as Placed

**Module:** Takeoffs (timber, cladding, aluminium and flashing from plans)  
**SOP ID:** 20-06  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-14):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED` (SOP 20-01). A read-only check on 2026-10-14 found migration 206's tables present in production (`docs/takeoff/evidence/live-206-verification-2026-10-14.txt`). **v2.0 describes the TC-R04 build (branch `takeoff-r03`)**: orders now carry **purchase lines by unit** (pieces, sheets, bars, LM, boxes …) as well as flashing lengths, each export has a separate **Site appendix (cutting & setout)** PDF, and out-of-date ("stale") lines must be explicitly **updated** or removed. Saving those lines needs **migration 207 (`supabase/migrations/207_takeoff_generic_methods.sql`), which is NOT applied in production** — it must not be applied until the Director approves the TC-R04 release. Nothing in this SOP has been tested against the live app.

---

## 1. Who uses this

| Action | Admin (Director) — Hub | Supervisor — Hub | Leading hand — Worker app | View-only / Admin preview |
|---|---|---|---|---|
| See orders, exports, **Open PDF**, **Site appendix (cutting & setout)** | Yes | Yes | Yes | Yes |
| **New order**, edit draft, **Save order details**, **Update** stale lines | Yes | Yes | Yes | No |
| **Export draft PDF** / **Export supplier PDF** / **Retry PDF** | Yes | Yes | Yes | No |
| See the supplier's order contact (name / email / phone — never account terms or notes) | Yes | Yes | Yes (they send the PDF themselves) | Yes, read-only |
| **Record order placed…** / **Record a cancellation…** | **Yes — the only role** | No | No | No |

Recording an order as placed is a Director (admin) action in the Hub only — it is not available in the Worker app at all.

---

## 2. When to use it

- The schedule is complete and checked (SOP 20-05) and you are ready to order flashings, timber, cladding, battens, aluminium bars or accessories.
- You need a draft list to check internally before ordering (draft PDF).
- You need the site's cut lists and setouts (site appendix).
- You have sent the supplier PDF and the supplier has confirmed — the Director records it as placed.
- An order was cancelled with the supplier, or more is needed after an order was placed.
- An order line shows "— needs updating".

---

## 3. What this does

From the schedule you make a draft order for **one supplier**, with delivery or pickup details and a quantity for each line — flashing lengths (pieces) and purchase lines in their own unit (sheets, bars, LM, boxes …). It starts with what is **still needed** (required − placed − already on another exported order). **Exporting freezes an exact snapshot and makes PDFs for you to send — it does not send, email or place anything.** The **supplier PDF** lists what to supply (flashing profiles and finished lengths; stock lengths, sheets, bars, LM for everything else). The **site appendix** is a separate PDF from the same frozen snapshot with the aluminium cutting sheet, timber cut list, wall setouts and continuous-run pieces — for site use, never part of the supplier order. When the supplier has the order, the Director records **which exported PDF** was sent, the date and the supplier's reference. Only recorded placements count as "ordered". Placed orders are locked — more means a new order, and a cancellation is recorded explicitly with a reason.

---

## 4. Before you start

- The schedule has lines (SOP 20-05). Lines marked **over ceiling** or **needs attention**, and materials that "Need before ordering", block the supplier PDF (a draft PDF is still possible).
- The supplier exists and is active in **Operations › Procurement › Suppliers** (SOP 16-07). If an active supplier's name starts with "Fielders" it is picked by default.
- Know: delivery vs pickup, the delivery address or pickup branch, the **required-by date** (or "as soon as possible"), the **site contact phone**. Blue Leaf's phone or email must be set in **Settings › Company**. These are required for the supplier PDF.
- The save chip on the takeoff says **Saved** — orders always use the last saved version.
- A data connection (exports and order records are server actions).
- The database has migration 207 (purchase-unit lines).

---

## 5. Step-by-step process

### A. Open Orders and start a draft

1. On the overview, in **Length schedule**, tap **Review & export order** (view-only users see **Orders**).
2. The **Orders** window shows: "Exporting makes a PDF for you to send — it doesn't send or place anything. Send it to the supplier yourself, then record it as placed."
3. If you see "Saving your latest takeoff changes… orders use the saved version.", wait for it to clear.
4. Tap **New order**. A draft called **Draft FO-00xxxx** appears with:
   - **Supplier** — Fielders (if on file) or "Choose a supplier…".
   - **Delivery or pickup** — **Deliver**, with **Delivery address (from the job)** filled from the job.
   - **Lengths on this order** (flashing): each finished length with its material, "need N · ordered N · left N" and a **Qty** field.
   - **Materials on this order** (everything else): one block per material with its status chips; each line shows what is bought ("90 × 45 MGP10 H2 — 5,400 mm length"), "need … · ordered … · left …" and an **Order quantity (unit)** stepper with **−** / **+**. LM lines say **estimate — not a piece count**.
   - Quantities start at what is still needed.
5. If you have more than one draft, choose it in the draft dropdown next to the title.

[insert screenshot: Orders — New order, Draft FO-001001 with supplier, delivery, flashing lengths and materials with steppers]

### B. Fill in and save the draft

1. **Supplier** — choose from the list (one supplier per order). "No suppliers on file — add one in Operations › Procurement › Suppliers." means none are set up.
2. **Deliver** or **Pick up**. For delivery check the **Delivery address** carefully — it is copied from the job label and may include the client's name in brackets; edit it to the real delivery address. For pickup type the **Pickup branch**.
3. **Required by** (date) or tick **As soon as possible**; **Site contact**, **Contact phone**, **Notes for supplier**.
4. Adjust quantities. Set a line to **0** to leave it off this order. A purchase line can't be more than the takeoff needs ("The takeoff needs 4 sheets — an order line can't be more than that."); a typed value that isn't a whole number stays in its field with a message and blocks saving ("A quantity above isn't a valid number, so it hasn't been used …").
5. Read **On this order:** — totals per unit, e.g. "11 flashing pieces (49.836 LM) · 22 pieces · 4 sheets · 2 bars · 57 LM" (units are never added together), **Still needed but not on this order:** (what the takeoff still needs that this order leaves off) and **Accessories not supplied on this order:** (by others / excluded / not decided groups).
6. Tap **Save order details** (it appears as soon as you change anything). The export buttons stay disabled until the draft is saved. Unsaved changes are kept on this device: reopening shows "Restored changes you hadn't saved on this device. Save order details to keep them." with **Discard**.
7. Read the banner:
   - "Not ready to order yet:" followed by a list (e.g. "Choose a supplier.", "Enter the delivery address.", "Enter the date it's required by (or choose As soon as possible).", "Enter a site contact phone number.", "Material, finish, BMT or colour is missing.", "<material>: …") — fix each item.
   - "Ready: N pieces · X LM to <supplier>." (with other units listed too) — ready for the supplier PDF.

### C. Update out-of-date lines

1. If a measurement, product, stock or rule changed after the draft was saved, the line shows in a warning box "… — needs updating" with the reason (e.g. "This line is no longer in the takeoff (its measurements, product or stock changed) — update or remove it.") and what the takeoff needs now. **Export supplier PDF** stays disabled while any stale line has a quantity.
2. Choose explicitly:
   - **Update to current material** (flashing) / **Update to what's needed now** (other materials) — switch the line to what the takeoff needs now (for a flashing colour change, pieces another material still needs stay on the old length: "Kept N × … for the other flashing in that colour and moved N to the new colour — check, then save."),
   - **Set to N** — when fewer are needed now,
   - **Remove line**.
3. **Save order details**.

### D. Export the PDFs

1. **Export draft PDF** — any time; watermarked **DRAFT** ("DRAFT FLASHING ORDER") and lists "DRAFT — not ready to order:" problems. Use it to check or share internally.
2. **Export supplier PDF** — only when the banner says Ready. The order-ready PDF has company, job, supplier, delivery/pickup, required date, contact, each flashing profile drawing with every leg, angle and end fold, the coated-face legend, material/finish/BMT/colour, each finished length × qty and total LM, plus the purchase lines by unit for other materials ("Timber, aluminium and board lengths are the STOCK lengths to supply; site cut lists and setout are in the separate site appendix, not part of this order."), notes and handling flags. No prices.
3. If some quantities are already on another exported or placed order, the banner lists "… are already on FO-… — only N more needed. Reduce this line or remove it." Tick **Order these extra pieces anyway (spares) — I know some are already ordered** only if the extra is intended.
4. Each export is numbered (Export 1, 2, …) and frozen: "Export N is frozen. Nothing has been sent." (or "Export N (draft) …") with **Open PDF** and **Site appendix (cutting & setout)**.
5. **Send the supplier PDF to the supplier yourself** (email, supplier portal, etc.). Give the site appendix to the site team. The Hub sends nothing.

> 💡 **Tip:** If something changes after you export (a measurement, the supplier's details, the order), export again. Old exports — and their appendices — stay exactly as they were.

[insert screenshot: export banner "Export 2 is frozen. Nothing has been sent." with Open PDF and Site appendix (cutting & setout)]
[insert screenshot: sample supplier PDF page — profile drawing, lengths table, purchase lines by unit]

### E. Read the site appendix

1. Tap **Site appendix (cutting & setout)** (after export, or next to any export in **Order history**). It opens in a new tab.
2. "SITE APPENDIX — CUTTING & SETOUT", the order reference, export number and job, then "For site use. Not part of the supplier order. Quantities are calculated from the plan and entered values; installation details marked source-pending are not verified."
3. Sections only for what is on that order: aluminium cutting sheet per material (kerf, bars, each bar's cuts and remainder — "keep (reusable offcut)" or "waste"), timber cut list ("18 × cut 5,196 mm from 5,400 mm stock"), wall setouts (gross / openings / net and the sheets per wall), and each continuous flashing run (tight length, corners, splits, pieces).

### F. Record the order as placed (Director, Hub only)

1. In **Order history**, under the order, tap **Record order placed…**.
2. **Which PDF did you send?** — choose the supplier export you actually sent (only finished, non-draft exports are listed).
3. **Date placed** (defaults to today) and **Supplier reference** (their order/quote number).
4. Tap **Record order placed**.
5. If the order is more than the takeoff still needs you'll see "This order includes N piece(s) more than the takeoff still needs. Confirm the surplus to record it. Tick to record it anyway." — tick only if the extra pieces are intended, then **Record order placed** again.
6. The order shows **Placed externally** and "Placed <date> · ref <reference> (export N)". The schedule and order lines now show what is ordered, per unit (e.g. "4 sheets ordered · 0 left").

### G. After an order is placed

1. Placed orders are locked: "Placed orders are locked. For more pieces, start a new order."
2. For more, tap **New order** — it starts with only what is still needed.

### H. Record a cancellation (Director, Hub only)

1. Under the placed order tap **Record a cancellation…**.
2. Type the **Reason for cancelling** and tap **Record cancellation** (**Back** to leave it).
3. The order shows **Cancelled** with the reason; its quantities count as needed again. Create a replacement with **New order** if required. All exports and records are kept.

### I. Open or retry a PDF later

1. In **Order history** each export shows its date and **PDF ready**, **PDF pending** or **PDF failed**.
2. **Open** opens a ready PDF; **Site appendix (cutting & setout)** opens that export's appendix. **Retry PDF** re-creates a pending/failed PDF from the same frozen snapshot — it never changes the order and never places anything.

[insert screenshot: Order history — exports with PDF ready / PDF failed + Retry PDF, Site appendix, Record order placed… form]

---

## 6. What happens next

- Each export creates a frozen snapshot (flashing groups + purchase items + site appendix data) and a private supplier PDF filed against the job (document type "purchase order"); it does **not** change "ordered" quantities and sends nothing. The site appendix is rendered on request from the same frozen snapshot.
- Recording a placement allocates the exported quantities to the takeoff's pieces / purchase lines, sets the order to **Placed externally**, and updates "ordered / left" everywhere in the takeoff (including the aluminium cutting sheet's "Already ordered …").
- A cancellation reverses that commitment but keeps the history.
- If measurements, products or rules later change so a placed order no longer matches, the schedule shows "Placed, but no longer in the takeoff" (SOP 20-05) — placed orders are never reinterpreted.
- No email, supplier message, Buildxact purchase order or price is created.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Thinking **Export supplier PDF** sent the order | It only makes the PDF | Send the PDF yourself, then the Director records it |
| Sending the site appendix to the supplier | It opens next to the PDF | The appendix is for site — the supplier PDF is the order |
| Recording a placement against the wrong export | Several exports exist | Choose the export number that matches the PDF you actually sent |
| Leaving the client's name in the delivery address | The default comes from the job label | Edit the delivery address before saving |
| Forgetting **Save order details** | The export buttons look available but stay grey | Save the draft first |
| Editing a placed order for extra pieces | Placed orders are locked | Start a **New order** |
| Ticking a surplus box without checking | The warning is easy to dismiss | Only tick if the extra is really wanted |
| Ignoring "— needs updating" | The old line still looks right | Update or remove every stale line, then save |
| Ordering an LM estimate as a board count | LM looks like a quantity of boards | LM is total metres — agree lengths with the supplier |
| Exporting while the takeoff says "Not synced" | Orders use the last saved version | Wait for **Saved** |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| **New order** / export buttons greyed | Takeoff still saving, draft not saved, an invalid quantity, a stale line, or busy | Wait for **Saved**; fix quantities; update stale lines; **Save order details** |
| "Not ready to order yet:" list | Missing supplier/delivery/date/phone/lines, or line problems | Fix each listed item |
| "Choose a supplier." / "Choose delivery or pickup." / "Enter the delivery address." / "Enter the pickup branch." / "Add at least one length to the order." | Draft incomplete | Fill in and **Save order details** |
| "Enter the date it's required by (or choose As soon as possible)." | No date and ASAP not ticked | Set **Required by** or tick **As soon as possible** |
| "Enter a site contact phone number." | **Contact phone** blank | Type it |
| "Add Blue Leaf's phone or email in Settings › Company so the supplier can reply." | Company details missing | Settings › Company |
| "… — needs updating" + "This line is no longer in the takeoff …" / "What this line buys has changed …" / "This line's material changed …" / "Fewer … are needed now than this line orders …" / "What this line was worked out from has changed …" | The takeoff changed after the draft was saved | **Update to current material** / **Update to what's needed now** / **Set to N** / **Remove line**, then save |
| "The takeoff needs N sheets — an order line can't be more than that." | Quantity above the need | Lower it (or record spares on a separate order if really needed) |
| "A quantity above isn't a valid number, so it hasn't been used — fix it (or tap − / +) before saving or exporting." | Invalid typed quantity | Fix it or use − / + |
| "… are already on FO-… (exported/placed) — only N more needed. Reduce this line or remove it." | Another order already covers it | Reduce the line, or tick **Order these extra pieces anyway (spares) …** if intended |
| "A length on this order is no longer in the takeoff." / "A selected length is no longer in the takeoff — refresh the schedule." | A measurement changed after the draft was made | Re-open Orders; update / set quantities again and save |
| "Not ready to order: …" (when exporting) | Server found a readiness problem | Fix the listed problems |
| Banner says **Ready** but export says "Not ready to order: a plan used by this takeoff changed …" | Takeoff is **Needs review** (plan replaced) | Review against the new plan and tap **Mark reviewed** (SOP 20-02), then export |
| "The takeoff or order changed — review the latest version, then export again." | Someone saved in between | Close and reopen Orders, check, export again |
| "Supplier details changed while exporting — export again" / "Company details changed while exporting — export again" | Records edited during export | Export again |
| "Someone else changed this order — it has been reloaded." | Two people edited the same draft | Re-enter your change and save |
| "Changes you hadn't saved on this device were for an older version of this order, so they weren't restored." | Order saved elsewhere since | Re-enter your change |
| "<flashing>: a size typed on this device isn't valid yet, so the drawing on this order may be out of date. …" | An unfinished flashing drawing on this device | Open the flashing and fix it before sending |
| "A placed or cancelled order cannot be edited — create an additional order" | Tried to change a locked order | **New order** |
| "That supplier was not found or is inactive." | Supplier archived/inactive | Reactivate it in Procurement › Suppliers or choose another |
| "The order was frozen but its PDF could not be created. Use Retry PDF — nothing was sent or placed." | PDF build or storage upload failed | **Retry PDF** in Order history |
| "This PDF isn't ready yet." | Opening a pending/failed export | **Retry PDF**, then **Open** |
| "Couldn't open the site appendix." | Network or a missing export | Try again; check the connection |
| "The stored PDF doesn't match its record." | Stored file altered/corrupt | Do not use it — export again and report |
| No **Record order placed…** button | Not a Director (admin) login, using the Worker app, or no finished supplier export yet | Director, in the Hub, after **Export supplier PDF** |
| "Only a director can record an order as placed." / "Forbidden" | Non-admin tried to record | Ask the Director |
| "Enter the date the order was placed." / "Choose the exported PDF that was sent." | Form incomplete | Fill both |
| "This order includes N piece(s) more than the takeoff still needs. Confirm the surplus to record it." | Ordered more than still needed | Tick the box only if intended |
| "Another placed order already covers some of these pieces" | Another placement was recorded at the same time | Reopen Orders; check quantities; use the surplus confirmation if intended |
| "The takeoff changed — reload before recording the order" | Takeoff edited since you opened Orders | Close and reopen Orders, then record |
| "Only a finished, order-ready export can be recorded as placed" | Chose a draft or failed export | Export / retry the supplier PDF first |
| "Give a reason for the cancellation" | Reason blank | Type a reason |
| "No connection — try again when you're back online. Nothing was sent." | No connection | Reconnect and try again — exports and records need a connection |

---

## 9. Related modules

- [20-05 Length schedule and splitting → what the order is made from](20-05_length_schedule_and_split.md)
- [20-04 Flashing profiles, materials and company standards → profile and material details on the PDF](20-04_profiles_materials_standards.md)
- [20-08 Timber](20-08_timber_takeoff.md) · [20-09 Cladding walls](20-09_cladding_walls_and_elevation.md) · [20-10 Aluminium](20-10_aluminium_cutting_sheet.md) · [20-11 Continuous flashing runs](20-11_continuous_flashing_runs.md) → what the purchase lines and the site appendix come from
- [20-02 Set up plans and scale a page → Needs review blocks supplier PDFs](20-02_set_up_and_scale_plans.md)
- [16-07 Manage suppliers → supplier records and Fielders default](../16_procurement/16-07_manage_suppliers.md)
- [05-03 Issue a purchase order to a trade → the separate, existing PO flow (takeoff orders never create a `purchase_orders` record)](../05_operations/operations_issue_purchase_order.md)

---

## 10. Screenshot placeholders

[insert screenshot: Orders window — info banner, New order]
[insert screenshot: draft order — supplier, Deliver/Pick up, delivery address "(from the job)", Required by + As soon as possible, contact fields]
[insert screenshot: Materials on this order — steppers with unit labels, "need … · ordered … · left …", estimate chip]
[insert screenshot: On this order totals, Still needed but not on this order, Accessories not supplied on this order]
[insert screenshot: stale line box — "— needs updating", Update to what's needed now / Remove line]
[insert screenshot: "Ready: … to Fielders …" with Export draft PDF / Export supplier PDF]
[insert screenshot: site appendix PDF page — aluminium bars, timber cut list, wall setout, continuous run]
[insert screenshot: Record order placed form — Which PDF did you send?, Date placed, Supplier reference, surplus tick-box]
[insert screenshot: placed order — "Placed externally", "Placed 2026-10-14 · ref 12345 (export 2)", Record a cancellation…]

---

## 11. Automation notes

- **New order:** `takeoff_orders` row — `order_ref` 'FO-' + 6 digits from its own sequence (never the shared PO sequence), `status` 'draft', `supplier_id`, `delivery` jsonb {method, address, addressSource 'job'/'entered', requiredDate, asap, contactName, contactPhone, pickupBranch}, `revision`. Default line quantities = required − placed − on other exported orders (`orderStatus.onExportedOrders`).
- **Lines** → `takeoff_order_lines` (`bucket_key`, `spec_key`, `job_material_id`, `finished_length_mm` (nullable since 207), `quantity`, **`unit`** ('piece', 'sheet', 'bar', 'lm', 'm2', 'box', 'bag', 'roll', 'pack', 'cartridge', 'ml'), **`item`** jsonb { description, stockLengthMm, note … }), replaced as a set on each save by `takeoff_save_order` (migration 207); each save checks the order revision (409 if someone else saved). An unchanged saved line is kept exactly as chosen even if stale; **Update** sends it with `refresh: true`.
- **Stale lines:** `orderLineState` compares each saved line with the current schedule (`line_stale_missing`, `line_stale_material`, `line_stale_quantity`, `line_stale_inputs`); any stale line with a quantity blocks the supplier export (server and screen).
- **Readiness preview:** `GET …/orders/:orderId/preview` builds the snapshot without saving and returns `problems` (supplier, delivery, required date / ASAP, contact phone, company contact, lines, line problems, cover by other orders, plan review).
- **Export:** `POST …/orders/:orderId/exports` with `{ isDraft, idempotencyKey, expectedOrderRevision, expectedWorkspaceRevision, acknowledgeSurplus }`. Inside one transaction the server re-checks revisions, supplier and company `updated_at`, and inserts `takeoff_exports` (`export_no`, `is_draft`, frozen `snapshot` — flashing `groups`, generic `items` with totals by unit, and `appendix` {aluminium, timber, layouts, flashingRuns} — `snapshot_sha256`, `calculation_version` 'takeoff-calc@2', `profile_schema_version`, `workspace_revision`, `order_revision`, `artifact_status` 'pending'). The supplier PDF is rendered **outside** the transaction (`renderer_version` 'takeoff-pdf@3'), uploaded (never overwriting) to the private `takeoff-exports` bucket at `<carpentry|job|charge-up>/<owner id>/<date>-<fo-ref>-e<N>[-draft]-<attempt id>.pdf`, registered as a `job_documents` row (`document_type` 'purchase_order', `direction` 'outbound', `source` 'generated', `template_key` 'takeoff_supplier_order', `audience_layer` 'management', `content_sha256`, `byte_size`), and the export is set `artifact_status` 'ready' with `pdf_document_id` and `pdf_sha256`. On failure: that attempt's upload and document row are removed, `artifact_status` 'failed', HTTP 502 `ARTIFACT_FAILED`.
- **Site appendix:** `GET /api/takeoff/exports/:exportId/appendix` (and the worker equivalent) renders `renderSiteAppendixPdf` from the export's frozen snapshot on request, `Content-Disposition` `<FO-ref>-export-<N>-site-appendix.pdf`; it is not stored and is never part of the supplier PDF.
- Exports are immutable: a trigger blocks changing the snapshot, deleting an export, or changing a ready export.
- **Record placed** (admin only, staff API): `POST /api/takeoff/orders/:orderId/placements` with `{ exportId, placedOn, supplierReference, acknowledgeSurplus, idempotencyKey }`. Inserts `takeoff_placements` (`status` 'placed', `placed_by_user_id`, `surplus_acknowledged`) and `takeoff_placement_allocations` (exported quantities allocated to stable `contribution_id`s, with `unit` since 207; NULL `contribution_id` = acknowledged surplus); sets `takeoff_orders.status` 'placed'. One active placement per order (unique index). An over-allocation guard rejects competing placements.
- **Cancel:** `POST /api/takeoff/placements/:placementId/cancel` `{ reason }` → placement `status` 'cancelled', `cancelled_at`, `cancelled_by_user_id`, `cancel_reason`; order `status` 'cancelled'. Placements and allocations can't be deleted or otherwise edited (triggers).
- **Required / ordered / remaining** per bucket (material + length, or material + unit + stock) = schedule quantity vs. allocations of placements with `status` 'placed' only.
- Every create/export/placement uses an idempotency key (`takeoff_idempotency`) so a retry never duplicates. Unsaved order-form changes are kept in this device's storage (`takeoff-order-draft:<order id>`) for the same order revision only.
- No email, Resend/Gmail send, `purchase_orders` row, Buildxact push or price is created.

---

## 12. Edge cases and limits

- One supplier per order; up to 200 lines per order.
- Exporting never changes "ordered"; only **Record order placed** does.
- A draft PDF can be exported even when the order isn't ready; the supplier PDF needs every readiness check to pass, no stale line, no invalid quantity, **and** the takeoff must not be **Needs review**.
- A purchase line can't be more than the takeoff needs; spares beyond what is still needed need the explicit "Order these extra pieces anyway (spares)" tick at export (or the surplus tick when recording placed).
- Placed orders can't be edited or replaced — create an additional order; to replace one, record a cancellation first.
- Only one active placement per order; a cancelled order stays cancelled.
- If requirements drop below what was placed, the extra shows as surplus / "Placed, but no longer in the takeoff"; placed orders are never changed automatically.
- Exports and placements need a connection; the buttons are not disabled when offline — they fail with a network message.
- The default delivery address is the job label (for carpentry jobs it includes the client name in brackets) — always check it.
- The site appendix shows only what is on that order (e.g. battens left off the order are not in its appendix).
- Joint-strip lines can carry the cladding's product name until a joint product is chosen (SOP 20-09 Section 12) — check before ordering.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] **UI Review Mode** (TC-01 to TC-04, TC-06, TC-13 to TC-16): your own server — **never port 5180 and never production** — `VITE_UI_REVIEW_MODE=true npx vite --port <PORT> --strictPort` (or the agents' no-HMR config); Playwright with `PLAYWRIGHT_BROWSERS_PATH=0`, `UI_REVIEW_PORT=<PORT>`. Default job `http://localhost:<PORT>/carpentry/cjb-1/takeoff?reviewRole=admin`; mixed job `…&takeoffSeed=mixed` (add `&takeoffFixings=1` for an accessory with 3 boxes and by-others / excluded scopes). Suppliers in review mode are fake ("Fielders (review branch)", "Other Steel Supplies").
- [ ] **Review-mode differences:** the mock export readiness does **not** check required date / ASAP, contact phone or company contact (the live server does); the supplier PDF is a fixed sample file; the site appendix is a small text stub rendered from the frozen snapshot. Read the appendix bytes with `await (await fetch("/api/takeoff/exports/<id>/appendix")).arrayBuffer()`; `window.__takeoffReviewState().appendixRequests` lists opened appendices.
- [ ] **Live stack** (TC-05, TC-07 to TC-12): local dev, isolated/test database **with migrations 206 and 207 applied** (including the private `takeoff-exports` bucket), `TAKEOFF_ENABLED=true`. **No real supplier emails**: a test supplier "Fielders BLH TEST" (active) and a second test supplier; never send PDFs to a real supplier. A `BLH TEST` carpentry job whose schedule requires **10 × 4,600 mm** of one complete flashing material; Admin, Supervisor, leading-hand token; SQL access; Settings › Company phone set.

### Test cases

**TC-01 — Happy path (flashing order, UI Review)**
1. Default job → **Review & export order** → **New order**.
2. Expected: "Draft FO-001001", supplier "Fielders (review branch)", **Deliver** with "Delivery address (from the job)", **Required by** + **As soon as possible**, **Lengths on this order** lines (e.g. "4,600 mm … need 2 · ordered 0 · left 2"), "On this order: 9 flashing pieces (40.236 LM)", "Ready: 9 pieces · 40.236 LM to Fielders (review branch)."
3. **Export draft PDF** → "Export 1 (draft) is frozen. Nothing has been sent."; **Export supplier PDF** → "Export 2 is frozen. Nothing has been sent." with **Open PDF** and **Site appendix (cutting & setout)**.
4. **Record order placed…** → Which PDF did you send? **Export 2** → Supplier reference "SO-REVIEW-1" → **Record order placed**.
5. Expected result: **Placed externally**, "Placed <today> · ref SO-REVIEW-1 (export 2)", "Placed orders are locked. For more pieces, start a new order."; the schedule shows "N ordered · 0 left" on each line.
6. Expected record (fake server): `GET /api/takeoff/workspaces/ws-1/orders` → the order `status` "placed", two exports (`isDraft` true / false), one placement `status` "placed" with `supplierReference` "SO-REVIEW-1". Live DB equivalents in TC-05.
- [ ] Pass  [ ] Fail

**TC-02 — Empty / invalid fields (UI Review)**
1. New draft: choose "Choose a supplier…", **Deliver** with the address cleared, every **Qty** 0 → **Save order details**.
2. Mixed job draft: type "2.5" in the Axon **Order quantity (sheets)** → Enter; then "5" → Enter.
3. Expected result: step 1 — "Not ready to order yet:" listing "Choose a supplier.", "Enter the delivery address.", "Add at least one length to the order."; **Export supplier PDF** disabled; step 2 — "Enter a whole number of sheets (0 or more)." and the banner "A quantity above isn't a valid number, so it hasn't been used — fix it (or tap − / +) before saving or exporting." with Save and both exports disabled; "5" → "The takeoff needs 4 sheets — an order line can't be more than that."
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (UI Review)**
1. After TC-01, tap **New order**.
2. Expected result: a new "Draft FO-001002" whose quantities are all 0 / omitted for what was placed (nothing is still needed), never a copy of the placed quantities; the placed order is unchanged.
3. Live stack: re-send the export and placement requests with the same `idempotencyKey` → same `exportId` / `exportNo`; `{ placementId: <same>, replayed: true }`; double-clicking **Record order placed** creates exactly one placement.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Supervisor: `…/takeoff?reviewRole=supervisor` → Orders → export a supplier PDF.
2. Leading hand (Worker app): `/worker/takeoff/carpentry/cjb-1` → Orders → export a draft PDF.
3. Expected result: step 1 — exports work; **no** **Record order placed…** button (live API → HTTP 403 "Forbidden"); step 2 — export works, no Record button; live: `GET /api/worker/takeoff/suppliers` returns only order contact fields; admin preview of the leading hand → every write HTTP 403 "Read-only preview — you can't submit or complete work as a worker." and **New order** hidden.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification: export is not an order (live stack)**
1. On a fresh takeoff requiring 10 × 4,600, create a draft (qty 10), fill **Required by** (or ASAP) and **Contact phone**, export a draft PDF and a supplier PDF.
2. Check: `GET …/workspaces/<id>/orders` → `orderStatus` for the bucket shows `required: 10, ordered: 0, remaining: 10`.
3. Check: `takeoff_exports` rows (`is_draft` true/false, `artifact_status` 'ready', `renderer_version` 'takeoff-pdf@3', `calculation_version` 'takeoff-calc@2'); `job_documents` row (`document_type` 'purchase_order', `template_key` 'takeoff_supplier_order', `storage_path` starting 'takeoff-exports/carpentry/<job id>/'); `takeoff_order_lines.unit` 'piece'; no new `purchase_orders` row; no mail sent (mail transport logs); no Buildxact call.
4. Record the supplier export as placed → `ordered: 10, remaining: 0`; `takeoff_placement_allocations` sum 10.
- [ ] Pass  [ ] Fail

**TC-06 — Purchase lines by unit, subset export, site appendix (mixed job, UI Review)**
1. Mixed job → **Review & export order** → **New order**.
2. Expected: **Materials on this order** with 6 steppers labelled "Order quantity (pieces)", "(sheets)", "(bars)" or "(LM)"; Axon 4 sheets, shiplap 57 LM (**estimate — not a piece count**), aluminium 2 bars; Axon **More sheets** disabled at 4; Cavity battens **needs attention**.
3. Set Cavity battens to 0 (Enter). Expected "On this order: N flashing pieces (X LM) · 22 pieces · 4 sheets · 2 bars · 57 LM"; **Still needed but not on this order:** lists "Cavity battens — 10 pieces".
4. **Save order details** → "Ready: N flashing pieces · X LM · 22 pieces · 4 sheets · 2 bars · 57 LM to Fielders (review branch)." → **Export supplier PDF** → "Export 1 is frozen. Nothing has been sent." → **Site appendix (cutting & setout)** (opens a new tab).
5. Expected result: appendix text contains "Window angle 50 x 50 x 3 - cutting sheet (6,500 mm bars)", "proven minimum", "Rafters 90 x 45 - timber cut list", "18 x cut 5,196 mm from 5,400 mm stock", "Axon cladding - North wall setout", "net 12.15 m2", "Apron flashing run R-m-pl1: tight 10,000 mm | corners at 6,000 | splits at 8,800 | pieces 9,000 + 1,400 mm", and **not** "Cavity battens"; **Order history** shows **Open** and **Site appendix (cutting & setout)** next to the export.
- [ ] Pass  [ ] Fail

**TC-07 — Partial allocation and over-allocation (live stack)**
1. Record 6 of the 10 as placed: confirm "6 ordered · 4 left". **New order** → it defaults to 4; **Export supplier PDF** on it without placing → "left" stays 4 (exports don't count as ordered). Another **New order** now defaults to **0** for that bucket (the 4 are already on an exported order).
2. On that newest draft set the bucket to 6 → **Save order details** → the readiness list shows "<material> 4,600 mm: N of 10 are already on FO-… — only M more needed. Reduce this line or remove it." with the tick "Order these extra pieces anyway (spares) — I know some are already ordered"; tick it → **Export supplier PDF** succeeds.
3. **Record order placed…** with more than still needed → HTTP 409 `SURPLUS` "This order includes N piece(s) more than the takeoff still needs. Confirm the surplus to record it." shown with a tick-box; after ticking → recorded; placement `surplus_acknowledged` true; an allocation row with `contribution_id` NULL; history shows "· includes confirmed surplus".
4. In the isolated DB call `takeoff_place_order` directly with allocations exceeding the requirement → `TAKEOFF_CONFLICT: another placed order already covers some of these pieces`.
- [ ] Pass  [ ] Fail

**TC-08 — Cancel and additional order (live stack)**
1. On a placed order: **Record a cancellation…** → reason "BLH TEST cancel" → **Record cancellation**.
2. `PATCH /api/takeoff/orders/<id>` on the cancelled order; run `DELETE FROM takeoff_placements WHERE id='<id>';` and `UPDATE takeoff_placements SET placed_on='2020-01-01' WHERE id='<id>';`.
3. Expected result: **Cancelled** with "— BLH TEST cancel"; "ordered" drops by exactly the cancelled quantity; the exports still open; **New order** defaults to what is needed again; PATCH → HTTP 400 "A placed or cancelled order cannot be edited — create an additional order"; SQL → `TAKEOFF_IMMUTABLE` errors.
- [ ] Pass  [ ] Fail

**TC-09 — Frozen PDF and appendix (live stack)**
1. After an export, change the supplier's name in Procurement, the company phone, a flashing colour and a timber grade; open Export 1 (**Open**) and its **Site appendix**.
2. Run `UPDATE takeoff_exports SET snapshot='{}' WHERE id='<id>';`.
3. Expected result: the PDF bytes' sha256 equals `pdf_sha256`; the PDF and the appendix still show the old supplier name, phone, colour, grade and lengths; SQL → `TAKEOFF_IMMUTABLE: export snapshot is frozen` (or "a ready export cannot change").
- [ ] Pass  [ ] Fail

**TC-10 — PDF artifact failure is retryable (live stack)**
1. Make the upload fail in the isolated environment (e.g. rename the `takeoff-exports` bucket in the storage stub) and **Export supplier PDF**; open **Record order placed…**; restore the bucket and tap **Retry PDF**.
2. Expected result: "The order was frozen but its PDF could not be created. Use Retry PDF — nothing was sent or placed." (HTTP 502 `ARTIFACT_FAILED`); history "PDF failed" + **Retry PDF**; no **Open**; the failed export is not offered in "Which PDF did you send?"; `GET …/exports/<id>/pdf` → HTTP 409 "This PDF isn't ready yet."; retry → **PDF ready**.
- [ ] Pass  [ ] Fail

**TC-11 — Readiness: required date, contact phone, company contact; Needs review (live stack)**
1. A complete draft with **Required by** empty and **As soon as possible** unticked; then **Contact phone** empty; then clear the company phone and email in Settings › Company.
2. Supersede the plan used by the takeoff (SOP 20-02 TC-09) and open Orders; export a draft PDF, then try the supplier PDF.
3. Expected result: step 1 — "Enter the date it's required by (or choose As soon as possible).", "Enter a site contact phone number.", "Add Blue Leaf's phone or email in Settings › Company so the supplier can reply." (each blocks the supplier PDF; the draft PDF lists them under "DRAFT — not ready to order:"); step 2 — draft export succeeds; supplier export → "A plan used by this takeoff was replaced or removed — review the takeoff and mark it reviewed." in the readiness list / HTTP 400 "Not ready to order: …".
- [ ] Pass  [ ] Fail

**TC-12 — PDF pagination and content (live stack)**
1. Export a 1-profile flashing order, a 40-line order across several profiles (draft and supplier), and a mixed order with timber, sheets, bars and LM.
2. Expected result: every length row, profile drawing, leg/angle/end-fold label, coated-face legend, handling column, total LM, delivery and notes present with no overlapping text; the draft has the DRAFT watermark; the mixed order lists purchase lines by unit with the note "Timber, aluminium and board lengths are the STOCK lengths to supply; site cut lists and setout are in the separate site appendix, not part of this order."; compare with `docs/takeoff/evidence/sample-supplier-order-1-profile.pdf` and `sample-supplier-order-40-lines-draft.pdf`.
- [ ] Pass  [ ] Fail

**TC-13 — Stale lines must be updated (UI Review)**
1. Mixed job → **New order** → Cavity battens 0 → **Save order details** → **Export supplier PDF**.
2. **Back** → **Rafters 90 × 45** → **Setup** → Grade "MGP12" → wait for **Saved** → **Close** → **Review & export order**.
3. Expected result: box "90 × 45 MGP10 H2 — 5,400 mm length — 18 pieces — needs updating", "This line is no longer in the takeoff (its measurements, product or stock changed) — update or remove it.", "The takeoff now needs: 18 pieces — 90 × 45 MGP12 H2 — 5,400 mm length (Rafters 90 × 45)."; **Export supplier PDF** disabled; the readiness list doesn't say "This length is no longer in the takeoff"; the earlier export's appendix bytes are unchanged.
4. **Update to what's needed now** → the box goes; the Rafters line reads "90 × 45 MGP12 H2 — 5,400 mm length" with 18; **Save order details** → "Ready: …" and **Export supplier PDF** enabled.
5. Default-job variant: save a draft, then change **Barge flashing** → **Details** → Colour → the draft shows stale lines with **Update to current material**.
- [ ] Pass  [ ] Fail

**TC-14 — Placed subset → schedule per unit; next order defaults (UI Review)**
1. Mixed job → order without battens (as TC-06) → **Export supplier PDF** → **Record order placed…** → Export 1 → ref "SO-TC-1" → **Record order placed**.
2. **New order**.
3. Expected result: "Draft FO-001002"; Cavity battens defaults to 10, Axon 0 with "need 4 sheets · ordered 4 sheets · left 0", shiplap "need 57 LM · ordered 57 LM · left 0"; **Back** → **Open schedule**: Axon "4 sheets ordered · 0 left", Rafters "18 pieces ordered · 0 left", aluminium "2 bars ordered · 0 left", battens "not ordered".
- [ ] Pass  [ ] Fail

**TC-15 — Accessories not supplied are named (UI Review)**
1. `…&takeoffSeed=mixed&takeoffFixings=1` → **Review & export order** → **New order**.
2. Expected result: "Accessories not supplied on this order:" with **Cladding fixings** listing "By others: Membrane / wrap (Wrap by the framer), Tape", "Excluded: Sealant (Painter seals the joints)", "Not decided: Corner trims" and "“Not decided” is not the same as excluded — decide it in the accessory setup before relying on this order."; the fixings line uses "Order quantity (boxes)" = 3.
- [ ] Pass  [ ] Fail

**TC-16 — Unsaved order changes survive on this device (UI Review)**
1. Mixed job → **New order** → change the Axon quantity to 3 (Enter) without saving → **Back** → **Review & export order** again.
2. Expected result: "Restored changes you hadn't saved on this device. Save order details to keep them." with the 3 restored and **Discard**; **Discard** returns to the saved quantity (4).
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
