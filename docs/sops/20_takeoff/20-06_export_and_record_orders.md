---
sop_version: 1.0
last_reviewed: 2026-10-13
app_version: takeoff-r03
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Export a Supplier Order and Record It as Placed

**Module:** Takeoffs (flashing takeoff from plans)  
**SOP ID:** 20-06  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-13):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED`, and **database migration 206 has not been applied in production**. Nothing in this SOP has been tested against the live app. See SOP 20-01 for switching it on.

---

## 1. Who uses this

| Action | Admin (Director) — Hub | Supervisor — Hub | Leading hand — Worker app | View-only / Admin preview |
|---|---|---|---|---|
| See orders, exports and Open PDF | Yes | Yes | Yes | Yes |
| **New order**, edit draft, **Save order details** | Yes | Yes | Yes | No |
| **Export draft PDF** / **Export supplier PDF** / **Retry PDF** | Yes | Yes | Yes | No |
| See the supplier's order contact (name / email / phone — never account terms or notes) | Yes | Yes | Yes (they send the PDF themselves) | Yes, read-only |
| **Record order placed…** / **Record a cancellation…** | **Yes — the only role** | No | No | No |

Recording an order as placed is a Director (admin) action in the Hub only — it is not available in the Worker app at all.

---

## 2. When to use it

- The length schedule is complete and checked (SOP 20-05) and you are ready to order flashings.
- You need a draft cut list to check internally before ordering (draft PDF).
- You have sent the supplier PDF and the supplier has confirmed — the Director records it as placed.
- An order was cancelled with the supplier, or more pieces are needed after an order was placed.

---

## 3. What this does

From the length schedule you make a draft order for **one supplier**, with delivery or pickup details and a quantity for each length (it starts with what is still needed). **Exporting freezes an exact snapshot and makes a PDF for you to send — it does not send, email or place anything.** You send the PDF to the supplier yourself. When the supplier has the order, the Director records **which exported PDF** was sent, the date and the supplier's reference. Only recorded placements count as "ordered"; required / ordered / remaining is worked out from those records per material and length. Placed orders are locked — more pieces mean a new order, and a cancellation is recorded explicitly with a reason.

---

## 4. Before you start

- The schedule has lines (SOP 20-05). Lines marked **over ceiling** or **needs attention** block the supplier PDF (a draft PDF is still possible).
- The supplier exists and is active in **Operations › Procurement › Suppliers** (SOP 16-07). If an active supplier's name starts with "Fielders" it is picked by default.
- Know delivery vs pickup, the delivery address or pickup branch, required-by date (optional), and the site contact.
- The save chip on the takeoff says **Saved** — orders always use the last saved version.
- A data connection (exports and order records are server actions).

---

## 5. Step-by-step process

### A. Open Orders and start a draft

1. On the overview, in **Length schedule**, tap **Review & export order** (view-only users see **Orders**).
2. The **Orders** window shows: "Exporting makes a PDF for you to send — it doesn't send or place anything. Send it to the supplier yourself, then record it as placed."
3. If you see "Saving your latest takeoff changes… orders use the saved version.", wait for it to clear.
4. Tap **New order**. A draft called **Draft FO-00xxxx** appears with:
   - **Supplier** — Fielders (if on file) or "Choose a supplier…".
   - **Delivery or pickup** — **Deliver**, with **Delivery address (from the job)** filled from the job.
   - **Lengths on this order** — every schedule length with **Qty** set to what is still needed; each line shows "need N · ordered N · left N".
5. If you have more than one draft, choose it in the draft dropdown next to the title.

[insert screenshot: Orders — New order, Draft FO-001001 with supplier, delivery, lengths and quantities]

### B. Fill in and save the draft

1. **Supplier** — choose from the list (one supplier per order). "No suppliers on file — add one in Operations › Procurement › Suppliers." means none are set up.
2. **Deliver** or **Pick up**. For delivery check the **Delivery address** carefully — it is copied from the job label and may include the client's name in brackets; edit it to the real delivery address. For pickup type the **Pickup branch**.
3. **Required by (optional)**, **Site contact**, **Contact phone**, **Notes for supplier**.
4. Adjust **Qty** per length. Set a length to **0** to leave it off this order.
5. Tap **Save order details** (it appears as soon as you change anything). The export buttons stay disabled until the draft is saved.
6. Read the banner:
   - "Not ready to order yet:" followed by a list (e.g. "Choose a supplier.", "Enter the delivery address.", "Material, finish, BMT or colour is missing.") — fix each item.
   - "Ready: N pieces · X LM to <supplier>." — ready for the supplier PDF.

### C. Export the PDF

1. **Export draft PDF** — any time; the PDF is watermarked **DRAFT** ("DRAFT FLASHING ORDER"). Use it to check or share internally.
2. **Export supplier PDF** — only when the banner says Ready. The PDF is the order-ready "FLASHING ORDER" with company, job, supplier, delivery/pickup, contact, each profile drawing with every leg, angle and end fold, the coated-face legend, material/finish/BMT/colour, each finished length × qty, total LM, notes and handling flags. No prices.
3. Each export is numbered (Export 1, 2, …) and frozen. You'll see "Export N is frozen. Nothing has been sent." (or "Export N (draft) …") — tap **Open PDF** to view/download it.
4. **Send the PDF to the supplier yourself** (email, supplier portal, etc.). The Hub sends nothing.

> 💡 **Tip:** If something changes after you export (a measurement, the supplier's details, the order), export again. Old exports stay exactly as they were.

[insert screenshot: export banner "Export 2 is frozen. Nothing has been sent." with Open PDF]
[insert screenshot: sample supplier PDF page — profile drawing, dimensions, lengths table]

### D. Record the order as placed (Director, Hub only)

1. In **Order history**, under the order, tap **Record order placed…**.
2. **Which PDF did you send?** — choose the supplier export you actually sent (only finished, non-draft exports are listed).
3. **Date placed** (defaults to today) and **Supplier reference** (their order/quote number).
4. Tap **Record order placed**.
5. If the order is more than the takeoff still needs you'll see "This order includes N piece(s) more than the takeoff still needs. Confirm the surplus to record it. Tick to record it anyway." — tick only if the extra pieces are intended, then **Record order placed** again.
6. The order shows **Placed externally** and a line "Placed <date> · ref <reference> (export N)". The schedule and order lines now show the pieces as ordered (e.g. "6 ordered · 4 left").

### E. After an order is placed

1. Placed orders are locked: "Placed orders are locked. For more pieces, start a new order."
2. For extra pieces tap **New order** — it starts with only what is still needed.

### F. Record a cancellation (Director, Hub only)

1. Under the placed order tap **Record a cancellation…**.
2. Type the **Reason for cancelling** and tap **Record cancellation** (**Back** to leave it).
3. The order shows **Cancelled** with the reason; its pieces count as needed again. Create a replacement with **New order** if required. All exports and records are kept.

### G. Open or retry a PDF later

1. In **Order history** each export shows its date and **PDF ready**, **PDF pending** or **PDF failed**.
2. **Open** opens a ready PDF. **Retry PDF** re-creates a pending/failed PDF from the same frozen snapshot — it never changes the order and never places anything.

[insert screenshot: Order history — exports with PDF ready / PDF failed + Retry PDF, Record order placed… form]

---

## 6. What happens next

- Each export creates a frozen snapshot and a private PDF filed against the job (document type "purchase order"); it does **not** change "ordered" quantities and sends nothing.
- Recording a placement allocates the exported quantities to the takeoff's pieces, sets the order to **Placed externally**, and updates "ordered / left" everywhere in the takeoff.
- A cancellation reverses that commitment but keeps the history.
- If measurements or rules later change so a placed order no longer matches, the schedule shows a surplus warning (SOP 20-05) — placed orders are never reinterpreted.
- No email, supplier message, Buildxact purchase order or price is created.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Thinking **Export supplier PDF** sent the order | It only makes the PDF | Send the PDF yourself, then the Director records it |
| Recording a placement against the wrong export | Several exports exist | Choose the export number that matches the PDF you actually sent |
| Leaving the client's name in the delivery address | The default comes from the job label | Edit the delivery address before saving |
| Forgetting **Save order details** | The export buttons look available but stay grey | Save the draft first |
| Editing a placed order for extra pieces | Placed orders are locked | Start a **New order** |
| Ticking the surplus box without checking | The warning is easy to dismiss | Only tick if the extra pieces are really wanted |
| Exporting while the takeoff says "Not synced" | Orders use the last saved version | Wait for **Saved** |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| **New order** / export buttons greyed | Takeoff still saving, draft not saved, or busy | Wait for **Saved**; tap **Save order details** |
| "Not ready to order yet:" list | Missing supplier/delivery/lengths, or line problems | Fix each listed item |
| "Choose a supplier." / "Choose delivery or pickup." / "Enter the delivery address." / "Add at least one length to the order." | Draft incomplete | Fill in and **Save order details** |
| "A length on this order is no longer in the takeoff." / "A selected length is no longer in the takeoff — refresh the schedule." | A measurement changed after the draft was made | Re-open Orders; set quantities again and save |
| "Not ready to order: …" (when exporting) | Server found a readiness problem | Fix the listed problems |
| Banner says **Ready** but export says "Not ready to order: a plan used by this takeoff changed. Review the takeoff first." | Takeoff is **Needs review** (plan replaced) — the readiness banner doesn't check this | Review against the new plan and tap **Mark reviewed** (SOP 20-02), then export |
| "The takeoff or order changed — review the latest version, then export again." | Someone saved in between | Close and reopen Orders, check, export again |
| "Supplier details changed while exporting — export again" | Supplier record was edited during export | Export again |
| "Company details changed while exporting — export again" | Company details (Settings) were edited during export | Export again |
| "Someone else changed this order — it has been reloaded." | Two people edited the same draft | Re-enter your change and save |
| "A placed or cancelled order cannot be edited — create an additional order" | Tried to change a locked order | **New order** |
| "That supplier was not found or is inactive." | Supplier archived/inactive | Reactivate it in Procurement › Suppliers or choose another |
| "The order was frozen but its PDF could not be created. Use Retry PDF — nothing was sent or placed." | PDF build or storage upload failed | **Retry PDF** in Order history |
| "This PDF isn't ready yet." | Opening a pending/failed export | **Retry PDF**, then **Open** |
| "The stored PDF doesn't match its record." | Stored file altered/corrupt | Do not use it — export again and report |
| No **Record order placed…** button | Not a Director (admin) login, using the Worker app, or no finished supplier export yet | Director, in the Hub, after **Export supplier PDF** |
| "Only a director can record an order as placed." / "Forbidden" | Non-admin tried to record | Ask the Director |
| "Enter the date the order was placed." / "Choose the exported PDF that was sent." | Form incomplete | Fill both |
| "This order includes N piece(s) more than the takeoff still needs. Confirm the surplus to record it." | Ordered more than still needed | Tick the box only if intended |
| "Another placed order already covers some of these pieces" | Another placement was recorded at the same time | Reopen Orders; check quantities; use the surplus confirmation if intended |
| "The takeoff changed — reload before recording the order" | Takeoff edited since you opened Orders | Close and reopen Orders, then record |
| "Only a finished, order-ready export can be recorded as placed" | Chose a draft or failed export | Export / retry the supplier PDF first |
| "Give a reason for the cancellation" | Reason blank | Type a reason |
| "Failed to fetch" / "Load failed" / "Network error" | No connection | Reconnect and try again — exports and records need a connection |

---

## 9. Related modules

- [20-05 Length schedule and splitting → what the order is made from](20-05_length_schedule_and_split.md)
- [20-04 Flashing profiles, materials and company standards → profile and material details on the PDF](20-04_profiles_materials_standards.md)
- [20-02 Set up plans and scale a page → Needs review blocks supplier PDFs](20-02_set_up_and_scale_plans.md)
- [16-07 Manage suppliers → supplier records and Fielders default](../16_procurement/16-07_manage_suppliers.md)
- [05-03 Issue a purchase order to a trade → the separate, existing PO flow (takeoff orders never create a `purchase_orders` record)](../05_operations/operations_issue_purchase_order.md)

---

## 10. Screenshot placeholders

[insert screenshot: Orders window — info banner, New order]
[insert screenshot: draft order — supplier, Deliver/Pick up, delivery address "(from the job)", required by, contact fields]
[insert screenshot: lengths on this order — "need 10 · ordered 6 · left 4" with Qty fields]
[insert screenshot: "Not ready to order yet:" banner with list]
[insert screenshot: "Ready: 14 pieces · 52.300 LM to Fielders …" with Export draft PDF / Export supplier PDF]
[insert screenshot: Record order placed form — Which PDF did you send?, Date placed, Supplier reference, surplus tick-box]
[insert screenshot: placed order — "Placed externally", "Placed 2026-10-13 · ref 12345 (export 2)", "Placed orders are locked…", Record a cancellation…]

---

## 11. Automation notes

- **New order:** `takeoff_orders` row — `order_ref` 'FO-' + 6 digits from its own sequence (never the shared PO sequence), `status` 'draft', `supplier_id`, `delivery` jsonb {method, address, addressSource 'job'/'entered', requiredDate, contactName, contactPhone, pickupBranch}, `revision`. Lines → `takeoff_order_lines` (`bucket_key`, `spec_key`, `job_material_id`, `finished_length_mm`, `quantity`), replaced as a set on each save; each save checks the order revision (409 if someone else saved).
- **Readiness preview:** `GET …/orders/:orderId/preview` builds the snapshot without saving and returns `problems`.
- **Export:** `POST …/orders/:orderId/exports` with `{ isDraft, idempotencyKey, expectedOrderRevision, expectedWorkspaceRevision }`. Inside one transaction the server re-checks the order and takeoff revisions, the supplier's `updated_at` (supplier PDFs) and the company profile's `updated_at`, and inserts `takeoff_exports` (`export_no`, `is_draft`, frozen `snapshot`, `snapshot_sha256`, `calculation_version` 'takeoff-calc@1', `profile_schema_version`, `workspace_revision`, `order_revision`, `artifact_status` 'pending'). The PDF is then rendered **outside** the transaction (`renderer_version` 'takeoff-pdf@1'), uploaded (never overwriting) to the private `takeoff-exports` bucket at `<carpentry|job|charge-up>/<owner id>/<date>-<fo-ref>-e<N>[-draft]-<attempt id>.pdf`, registered as a `job_documents` row (`document_type` 'purchase_order', `direction` 'outbound', `source` 'generated', `template_key` 'takeoff_supplier_order', `audience_layer` 'management', `content_sha256`, `byte_size`), and the export is set `artifact_status` 'ready' with `pdf_document_id` and `pdf_sha256`. On failure: that attempt's upload and document row are removed, `artifact_status` 'failed', HTTP 502 `ARTIFACT_FAILED`. If two retries race, only one becomes the ready PDF; the other cleans up its own file.
- Exports are immutable: a trigger blocks changing the snapshot, deleting an export, or changing a ready export.
- **Record placed** (admin only, staff API): `POST /api/takeoff/orders/:orderId/placements` with `{ exportId, placedOn, supplierReference, acknowledgeSurplus, idempotencyKey }`. Inserts `takeoff_placements` (`status` 'placed', `placed_by_user_id`, `surplus_acknowledged`) and `takeoff_placement_allocations` (exported quantities allocated to stable `contribution_id`s; NULL `contribution_id` = acknowledged surplus); sets `takeoff_orders.status` 'placed'. One active placement per order (unique index). An over-allocation guard rejects competing placements.
- **Cancel:** `POST /api/takeoff/placements/:placementId/cancel` `{ reason }` → placement `status` 'cancelled', `cancelled_at`, `cancelled_by_user_id`, `cancel_reason`; order `status` 'cancelled'. Placements and allocations can't be deleted or otherwise edited (triggers).
- **Required / ordered / remaining** per material + finished length = schedule quantity vs. allocations of placements with `status` 'placed' only.
- Every create/export/placement uses an idempotency key (`takeoff_idempotency`) so a retry never duplicates.
- No email, Resend/Gmail send, `purchase_orders` row, Buildxact push or price is created.

---

## 12. Edge cases and limits

- One supplier per order; up to 200 lines per order.
- Exporting never changes "ordered"; only **Record order placed** does.
- A draft PDF can be exported even when the order isn't ready; the supplier PDF needs every readiness check to pass **and** the takeoff must not be **Needs review**.
- Placed orders can't be edited or replaced — create an additional order; to replace one, record a cancellation first.
- Only one active placement per order; a cancelled order stays cancelled.
- Default quantities are "required − placed" — they do not subtract quantities sitting on other **draft** orders. Check for older drafts before exporting a second order.
- If requirements drop below what was placed, the extra shows as surplus/"0 left"; placed orders are never changed automatically.
- Exports and placements need a connection; the buttons are not disabled when offline — they fail with a network message.
- The default delivery address is the job label (for carpentry jobs it includes the client name in brackets) — always check it.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-13

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Local dev, isolated/test database **with migration 206 applied** (including the private `takeoff-exports` bucket), `TAKEOFF_ENABLED=true`.
- [ ] **No real supplier emails**: use a test supplier record named "Fielders BLH TEST" (active) and a second test supplier; never send PDFs to a real supplier.
- [ ] A `BLH TEST` carpentry job with a takeoff whose schedule is clean and requires **10 × 4,600 mm** of one complete flashing material (e.g. ten separate measured runs of 4,312 mm, or a manual 4,600 × 10).
- [ ] Logins: Admin, Supervisor; leading-hand Worker-app token. Devtools Network tab open; SQL access.

### Test cases

**TC-01 — Happy path (supplier PDF, then record placed)**
1. As Admin: **Review & export order** → **New order**. Confirm supplier "Fielders BLH TEST", **Deliver** and the job address; set Qty to 6; edit the address; **Save order details**.
2. Confirm "Ready: 6 pieces · 27.600 LM to Fielders BLH TEST." → **Export supplier PDF** → **Open PDF**.
3. **Record order placed…** → choose Export 1, date today, reference "TEST-001" → **Record order placed**.
4. Expected result: "Export 1 is frozen. Nothing has been sent."; PDF opens (FLASHING ORDER, no DRAFT watermark); after recording, the order shows **Placed externally** and "Placed <today> · ref TEST-001 (export 1)"; order lines/schedule show "6 ordered · 4 left".
5. Expected API: `POST …/workspaces/<id>/orders` → `{ ok: true, order: { orderRef: "FO-00…", status: "draft", … } }`; `POST /api/takeoff/orders/<id>/exports` → `{ ok: true, export: { exportId, exportNo: 1, artifactStatus: "ready", isDraft: false } }`; `POST /api/takeoff/orders/<id>/placements` → `{ ok: true, placement: { placementId, surplus: 0 } }`.
6. Expected DB records: `takeoff_orders` (`status` 'placed', `supplier_id` = test supplier); `takeoff_order_lines` one row `quantity` 6, `finished_length_mm` 4600; `takeoff_exports` (`export_no` 1, `is_draft` false, `artifact_status` 'ready', `snapshot_sha256`, `pdf_sha256`, `pdf_document_id`, `renderer_version` 'takeoff-pdf@1'); `job_documents` row for the PDF (`document_type` 'purchase_order', `template_key` 'takeoff_supplier_order', `storage_path` starting 'takeoff-exports/carpentry/<job id>/', `audience_layer` 'management'); `takeoff_placements` (`status` 'placed', `supplier_reference` 'TEST-001', `placed_by_user_id` = admin); `takeoff_placement_allocations` summing to 6 with non-NULL `contribution_id`s; `takeoff_idempotency` rows for 'export' and 'place'.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. New draft: clear the supplier, choose **Deliver** with a blank address, set every Qty to 0 → **Save order details**.
2. Via API: `POST …/exports` with `isDraft: false`; `POST …/placements` with no `exportId`; with no `placedOn`; `POST …/placements/<id>/cancel` with `reason: ""`.
3. Expected result: banner "Not ready to order yet:" listing "Choose a supplier.", "Enter the delivery address.", "Add at least one length to the order."; **Export supplier PDF** disabled; API: HTTP 400 "Not ready to order: Choose a supplier. …" (`NOT_READY`); "Choose the exported PDF that was sent."; "Enter the date the order was placed."; "Give a reason for the cancellation".
4. Expected DB: no export / placement rows created; no cancellation.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (A09)**
1. Re-send the TC-01 export request with the same `idempotencyKey`.
2. Re-send the TC-01 placement request with the same `idempotencyKey`.
3. Double-click **Record order placed** on a new order.
4. Expected result: step 1 → same `exportId` / `exportNo` 1 (no Export 2); step 2 → `{ placementId: <same>, replayed: true }`; step 3 → exactly one placement.
5. Expected DB: one export row and one placement per order.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role (A04 / A05)**
1. Supervisor: open Orders for a draft with a ready supplier export; call `POST /api/takeoff/orders/<id>/placements`.
2. Leading hand (Worker app): open Orders, export a draft PDF; look for Record order placed.
3. Admin preview of the leading hand: call `POST /api/worker/takeoff/workspaces/<id>/orders`, `…/orders/<id>/exports`, `…/exports/<id>/retry`.
4. Expected result: step 1 — no **Record order placed…** button; API HTTP 403 "Forbidden". Step 2 — export works; `GET /api/worker/takeoff/suppliers` returns each supplier's `contactName` / `email` / `phone` (order contact only — no account terms or notes); no Record button and no worker placement route. Step 3 — every call HTTP 403 "Read-only preview — you can't submit or complete work as a worker."; **New order** hidden.
5. Expected DB: no placements from steps 1–2; nothing from step 3.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification: export is not an order (A21)**
1. On a fresh takeoff requiring 10 × 4,600, create a draft (qty 10), export a draft PDF and a supplier PDF.
2. Check: `GET …/workspaces/<id>/orders` → `orderStatus` for the bucket shows `required: 10, ordered: 0, remaining: 10`.
3. Check: no new `purchase_orders` row; no mail sent (mail transport logs); no Buildxact call.
4. Record the supplier export as placed → `ordered: 10, remaining: 0`.
- [ ] Pass  [ ] Fail

**TC-06 — Partial allocation and over-allocation (A22)**
1. After TC-01 (6 placed of 10): confirm "6 ordered · 4 left". Export another PDF on a new draft without placing → still 4 left.
2. Create a draft with qty 6, export the supplier PDF and **Record order placed**.
3. Expected result: step 1 unchanged; step 2 → HTTP 409 `SURPLUS` "This order includes 2 piece(s) more than the takeoff still needs. Confirm the surplus to record it." shown with a tick-box; after ticking → recorded; placement `surplus_acknowledged` true; one allocation row with `contribution_id` NULL and `quantity` 2; history shows "· includes confirmed surplus".
4. In the isolated DB, call `takeoff_place_order` directly with allocations that exceed the requirement for the same contribution → `TAKEOFF_CONFLICT: another placed order already covers some of these pieces`.
- [ ] Pass  [ ] Fail

**TC-07 — Cancel and additional order (A23)**
1. On the TC-01 order: **Record a cancellation…** → reason "BLH TEST cancel" → **Record cancellation**.
2. Try to save the cancelled order via `PATCH /api/takeoff/orders/<id>`.
3. Run `DELETE FROM takeoff_placements WHERE id='<id>';` and `UPDATE takeoff_placements SET placed_on='2020-01-01' WHERE id='<id>';`.
4. Expected result: order shows **Cancelled** with "— BLH TEST cancel"; "ordered" drops by exactly 6 (the cancelled placement no longer counts — e.g. after TC-06, "12 ordered · 0 left" becomes "6 ordered · 4 left"; the TC-06 confirmed surplus still counts as ordered); Export 1 is still listed and opens; **New order** now defaults to the 4 still needed; PATCH → HTTP 400 "A placed or cancelled order cannot be edited — create an additional order"; SQL → `TAKEOFF_IMMUTABLE` errors.
5. Expected DB: placement `status` 'cancelled', `cancelled_at`, `cancelled_by_user_id`, `cancel_reason` set; `takeoff_orders.status` 'cancelled'; allocations still present but no longer counted.
- [ ] Pass  [ ] Fail

**TC-08 — Frozen PDF (A26 / A11)**
1. After an export, change the supplier's name in Procurement, the company profile phone, and the material's colour and allowance.
2. Re-open Export 1 (**Open**).
3. Run `UPDATE takeoff_exports SET snapshot='{}' WHERE id='<id>';`.
4. Expected result: the PDF bytes' sha256 equals `pdf_sha256`; the PDF still shows the old supplier name, phone, colour and lengths; `snapshot` unchanged; SQL → `TAKEOFF_IMMUTABLE: export snapshot is frozen` (or "a ready export cannot change").
- [ ] Pass  [ ] Fail

**TC-09 — PDF artifact failure is retryable (A27)**
1. In the isolated environment make the upload fail (e.g. temporarily remove/rename the `takeoff-exports` bucket in the storage stub) and **Export supplier PDF**.
2. Open **Record order placed…**; then restore the bucket and tap **Retry PDF**.
3. Expected result: step 1 → "The order was frozen but its PDF could not be created. Use Retry PDF — nothing was sent or placed." (HTTP 502 `ARTIFACT_FAILED`); history shows "PDF failed" + **Retry PDF**; no **Open** link; the failed export is **not** offered in "Which PDF did you send?"; `GET …/exports/<id>/pdf` → HTTP 409 "This PDF isn't ready yet."; step 2 → retry succeeds, status **PDF ready**.
4. Expected DB: failed export `artifact_status` 'failed', `pdf_document_id` NULL, no placement; after retry 'ready' with `pdf_document_id`.
- [ ] Pass  [ ] Fail

**TC-10 — PDF pagination and content (A28)**
1. Export a 1-profile order and a 40-line order across several profiles (draft and supplier).
2. Expected result: every length row, profile drawing, leg/angle/end-fold label, coated-face legend, handling column, total LM, delivery and notes are present with no overlapping text; the draft has the DRAFT watermark. Compare with `docs/takeoff/evidence/sample-supplier-order-1-profile.pdf` and `sample-supplier-order-40-lines-draft.pdf`.
- [ ] Pass  [ ] Fail

**TC-11 — Concurrency on export and draft save**
1. Open Orders in two sessions on the same draft. Save a change in session 1; then **Save order details** in session 2.
2. Send an export with a stale `expectedOrderRevision`.
3. Expected result: step 1 → session 2 shows "Someone else changed this order — it has been reloaded."; step 2 → HTTP 409 "The takeoff or order changed — review the latest version, then export again."
- [ ] Pass  [ ] Fail

**TC-12 — Needs review blocks the supplier PDF only**
1. Supersede the plan used by the takeoff (SOP 20-02 TC-09), then open Orders.
2. Export draft PDF; then Export supplier PDF (if enabled).
3. Expected result: draft export succeeds; supplier export → HTTP 400 "Not ready to order: a plan used by this takeoff changed. Review the takeoff first." (note whether the readiness banner wrongly says Ready beforehand).
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
