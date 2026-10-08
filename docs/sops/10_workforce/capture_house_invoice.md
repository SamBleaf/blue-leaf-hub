---
sop_version: 2.2
last_reviewed: 2026-10-09
app_version: main — built 2026-10-04 (migration 204): scan/upload a supplier invoice or misc receipt straight onto ANY carpentry job (the internal houses + real client jobs) from the Hub (Carpentry job → Costs tab, or the Internal house glance view) or the Worker PWA (gated to leading hands / admins / supervisors). Haiku-only OCR prefills supplier + ex-GST amount + the invoice date; the operator confirms; it saves as a carpentry_job_cost (source 'manual') and drops into the job's material tally. The receipt file is filed to Dropbox at /BLUE LEAF BUILDING/RECIEPTS named "<invoice date D.M.YYYY> <supplier>". An amber guard warns when the job also has Finance invoices (don't enter the same invoice twice). Requires migration 204 applied.
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 10-08: Capture a supplier invoice / misc cost on a carpentry job (scan / upload)

**Module:** Workforce / Carpentry
**SOP ID:** 10-08
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
- **Admin / Director** (Sam, Josh) and the **field supervisor** (Max) — scan or upload supplier invoices and misc receipts as they come in, against whichever carpentry job they belong to.
- **Hub:** any **Admin / Supervisor** Hub login (the $ cost data is director-gated, same as every other carpentry cost view).
- **Worker PWA:** anyone flagged a **leading hand** (the field-director signal — Sam, Josh, Max) **or** a login linked to an admin/supervisor role.
- **Regular field workers cannot** — cost capture writes money onto a job.

## 2. When to use it
A supplier invoice or receipt arrives for materials or a miscellaneous cost on a job (timber, hardware, fixtures, a one-off hire, etc.) and you want it counted against that job's running cost **without** going through the Finance module. Use it when you're already looking at the job in the Hub, or standing at the ute with the paper invoice in hand and your phone.

This is the **misc-cost lane**: quick capture of the small/one-off receipts that would otherwise never make it onto the job. Formal supplier invoices that need approval and need to flow to Xero still go through **Finance** (see §7 guard).

## 3. What this does
Lets you photograph or upload a supplier invoice straight onto a carpentry job. The app reads the supplier, the ex-GST amount, **and the invoice date** off the file for you; you check them (and, on a real client job, optionally tag a cost category); and it's added to that job's material total. The file itself is filed to Dropbox, named by the invoice date + supplier, so you can open it again later. It saves the trip through Finance for quick misc costs.

## 4. Before you start
- **Migration 204 must be applied** (adds `carpentry_job_costs.receipt_path` + `supplier_name`). It is applied on production.
- **Migration 205** (adds `carpentry_job_costs.invoice_number`) powers the duplicate-scan check. Capture works without it (fail-soft), but the strong invoice-number match only activates once it's applied.
- **Dropbox must be configured** (`DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN` + `DROPBOX_NAMESPACE_ID`) for the file to be filed. If it isn't, the **cost still saves** and you'll see a note that the file wasn't filed — fix the config and re-upload the file later.
- Hub: signed in as **Admin or Supervisor**. Worker PWA: you must be a **leading hand** (or a login linked to an admin/supervisor role).
- On a phone, allow the browser/app camera permission the first time.

## 5. Step-by-step process

### A. From the Hub — real client job (Carpentry → job → Costs tab)
1. Go to **Carpentry** in the sidebar and open the job.
2. Open the **Costs** tab. At the top is the **Supplier invoices & misc costs** card.
3. Click **📷 Scan / upload invoice**. On a computer this opens a file picker (PDF or image); on an iPhone it opens the full sheet — **Take Photo** (camera), **Photo Library** (a photo you already took), or **Choose File / Browse** (a PDF).
4. Wait a moment — **"Reading…"** means the AI is reading the invoice. A confirm box appears, pre-filled with the **supplier / description**, the **amount (ex-GST)**, and the **date** (the invoice date read off the receipt).
5. **Check the amount and the date.** The AI read them off the invoice — fix anything wrong (especially the amount if the supplier isn't GST-registered). All amounts are stored **ex-GST**.
6. *(Optional)* Pick a **Cost category** to file the cost against one of the job's material budget lines. Leave it "Uncategorised" if unsure.
7. Click **Add to job**. The cost drops into the job's material tally and the file is filed to Dropbox.

### B. From the Hub — internal house (Josh's / Sam's house)
1. Open the house from the **Internal** group under Carpentry.
2. Find the **Supplier invoices & misc costs** card (above the Materials & other by category table).
3. Follow steps 3–7 above. (The internal houses have no budget lines, so there's no cost-category picker — that's expected.)

### C. From the Worker PWA (on your phone)
1. Open the **Worker app** (the installed PWA / `/worker`). You must be a **leading hand** (or a linked admin/supervisor).
2. On the home screen, tap **Scan supplier invoice** (this tile only shows for leading hands / admins / supervisors).
3. Choose the **Job** (any carpentry job — houses and real client jobs both appear).
4. Tap **📷 Take photo** to shoot the invoice with the camera, **or** tap **Upload photo or PDF** to pick a photo you already took (Photo Library) or a PDF (Files).
5. Check the pre-filled **amount (ex-GST)** and **date**; fix if needed.
6. Tap **Add to job**.

> 💡 **Tip:** Capture **misc receipts** here. A formal supplier invoice that needs approval and needs to reach Xero should go through **Finance** — and don't enter the same invoice in both places (see §7).

[insert screenshot: the Supplier invoices & misc costs card with the Scan/upload button]
[insert screenshot: the confirm box with supplier + ex-GST amount + invoice date pre-filled]

## 6. What happens next
- A row is written to **carpentry_job_costs** (source `manual`, cost_type `material`) with the amount, supplier, date, optional budget-category link, and the Dropbox path to the file (`receipt_path`).
- The job's **Material $** / **Total $** figures and the per-category total go **up** by the amount on the next load.
- The invoice shows in the **captured** list with a **📄 View** link. Clicking it resolves a **Dropbox shared link** on demand and opens the file in a new tab. (One pre-existing legacy row still resolves via a Supabase signed URL — handled automatically.)
- **Duplicate check:** when you scan, the app checks whether this invoice is already logged on this job and, if so, shows an **amber warning** in the confirm box (naming the supplier, date and amount of the existing one). It's a heads-up only — you can still **Add to job** if it's genuinely a separate bill. Nothing is blocked.
- Nothing is sent to Finance or Xero — this is the internal misc-cost lane.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Entering the GST-inclusive total | The invoice shows the big (inc-GST) number most prominently | The field is labelled **ex-GST**; the AI prefills the ex-GST figure — leave it unless it's clearly wrong |
| Entering the **same invoice** here *and* in Finance | Capturing here and also allocating it to the job in Finance | The card shows an **amber warning** when the job already has Finance invoices. Pick one lane per invoice — entering it in both double-counts the cost |
| Scanning the **same receipt twice** | Logging it once, forgetting, scanning it again | On scan the app warns if the same invoice (by invoice number, or supplier+date+amount) is already on the job — read the amber note before you **Add to job** |
| Expecting the filename to use the photo date | Assuming the file is named by when you snapped it | The file is named by the **invoice date** read off the receipt (e.g. `4.10.2026 bunnings.jpg`) — if the date prefill is wrong, fix it before saving |
| Scanning a blurry photo | Camera moved / poor light | Hold steady; if the amount comes back blank, just type it in |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Dropbox isn't configured — the cost was saved but the file wasn't filed." | Dropbox env not set on this environment | The money is recorded. Set `DROPBOX_*` + `DROPBOX_NAMESPACE_ID`, then re-upload the file against the same cost |
| "The cost was saved but the file couldn't be filed to Dropbox — try re-uploading it." | Transient Dropbox error during upload | Scan the file again against the job — the cost already stands, this just re-attaches the file |
| "Couldn't auto-read the amount — check the invoice and enter it below." | OCR couldn't find a clear ex-GST figure | Type the ex-GST amount manually and save — the file is still attached |
| The **Scan supplier invoice** tile isn't on the Worker home | You're not a **leading hand** and not a linked admin/supervisor | Only leading hands / admins / supervisors see it. If a director should capture invoices, set their **leading hand** flag (Workforce → Team) |
| "Only a leading hand, admin or supervisor can capture invoices." | A non-director hit the Worker-PWA endpoint | Expected — the PWA action is gated to leading hands / admins / supervisors |
| 📄 View does nothing / errors | Dropbox link resolution failed, or the file was moved/deleted in Dropbox | Check the file still exists in `/BLUE LEAF BUILDING/RECIEPTS`; the link is resolved fresh each time, so a reload isn't needed |

## 9. Related modules
- [BL-INTERNAL — internal cost categories & internal house jobs](internal_cost_categories.md) — the house jobs + how labour and finance costs already feed the tally
- [BLB Charge Up — site-level charge-up tracking](charge_up_sites.md) — the sibling cost-capture pattern
- Finance → invoice upload (09-01) — the full **approval + Xero** path for formal supplier invoices (use this, not the misc lane, for invoices that must reach Xero)

## 10. Screenshot placeholders
[insert screenshot: Carpentry job → Costs tab — Supplier invoices & misc costs card, empty state]
[insert screenshot: confirm box pre-filled from a scanned invoice (supplier + ex-GST + invoice date + cost category)]
[insert screenshot: captured list with a 📄 View link and the Material $ total increased]
[insert screenshot: amber double-count guard shown when the job also has Finance invoices]
[insert screenshot: Worker PWA home with the admin-only "Scan supplier invoice" tile + the job picker listing all carpentry jobs]

## 11. Automation notes
- **AI OCR:** the uploaded file is read by **Claude Haiku** (`claude-haiku-4-5`, token-conservative — no Sonnet escalation) via `extractInvoiceHaiku()` → `extractReceipt()` in `server/lib/jobCostReceipts.mjs`; returns supplier + amount + invoice date (best-effort, never auto-saves). The **scan** endpoint does OCR only and stores nothing.
- **Save order (no orphan files):** on **Add to job** the server inserts the cost row FIRST (validates the job + fields), THEN uploads the file to Dropbox and links the path onto the row. A failed save never leaves an orphan file; a failed upload never loses the money (the cost stands with a warning).
- **File filed to:** Dropbox **`/BLUE LEAF BUILDING/RECIEPTS`** (note the live folder spelling is "RECIEPTS") as **`<invoice date D.M.YYYY> <supplier>.<ext>`**, e.g. `4.10.2026 bunnings.jpg` (`autorename:true`, so a same-name file becomes `… (1).jpg`). The date is the **invoice date** confirmed by the operator, not the photo date. The Supabase `job-cost-receipts` bucket from migration 204 is now **vestigial** — only the one legacy row uses it.
- **Record created in:** `carpentry_job_costs` — `source='manual'`, `cost_type='material'`, `amount` (ex-GST), `supplier_name`, `receipt_path` (the Dropbox path), optional `carpentry_job_budget_id`.
- **Amount basis:** stored ex-GST — prefers the invoice's captured ex-GST figure, else derives it from the inc-GST total ÷ `(1 + GST_RATE)`; always human-confirmed before save.
- **Tally:** the job `/summary` + `/budget` endpoints already sum `carpentry_job_costs`, so the row counts immediately; it is **disjoint** from the finance read-through (no double-count unless a human enters the same invoice in both lanes — which the §7 guard warns about).
- **View link:** `GET /api/carpentry/jobs/:id/costs/:costId/receipt-link` (and the worker equivalent) resolves on demand — a Dropbox shared link for paths starting `/`, else a Supabase signed URL for legacy paths. Job-scoped (`id` + `job_id`) so you can't read another job's receipt.
- **Endpoints:** `POST …/cost-receipt/scan` (OCR only), `POST …/cost-receipt` (save = insert + file), `GET …/costs/:costId/receipt-link` (view) — mirrored under `/api/worker/carpentry/jobs/:id/…`.
- **Duplicate detection** (`findPossibleDuplicate` in `jobCostReceipts.mjs`, run at scan time, job-scoped): the Haiku OCR reads the **invoice number** (stored in `carpentry_job_costs.invoice_number`, **migration 205**). STRONG match = same invoice number + supplier (near-certain). FUZZY fallback = same supplier + `cost_date` + `amount`. The scan response carries `possibleDuplicate` (or null); the confirm UI shows it as an advisory amber banner. **Advisory only — never blocks a save** (genuine same-supplier same-day receipts exist), mirroring Finance's `is_duplicate` flag. Fail-soft before mig 205: the save retries without the invoice number so the cost still records, and the fuzzy check still runs (the strong, invoice-number match activates once the column lands).
- **Role gate:** Hub = `requireAuth` + the director-only (`$`-visibility) UI gate; Worker PWA = `requireWorkerDirector` — allowed when the worker-token employee is a **leading hand** (`employees.is_leading_hand`) OR links to an admin/supervisor login; `/api/worker/me.canCaptureCosts` drives the UI.

## 12. Edge cases and limits
- **Amount blank / OCR fails:** the amount must be typed before **Add to job** saves (0 allowed, negatives rejected). The file is uploaded only after the cost saves, so a blocked save uploads nothing.
- **File types / size:** PDF or image only; max 15 MB (phone photos are downscaled + JPEG-compressed client-side first).
- **Dropbox down / not configured:** the cost is still recorded; a `receiptWarning` tells the user the file wasn't filed. Re-scan later to attach it.
- **Non-GST-registered supplier:** the ÷(1+GST_RATE) derivation would under-count — the confirm step is where you catch it and type the true amount.
- **Double-count guard is advisory:** it warns when the job has Finance invoices; it does **not** block. Direct captures (`manual`) and the Finance read-through (`financial_documents`) are disjoint, so the only way to double-count is entering the same invoice in both lanes.
- **Cost category (real jobs only):** tagging a `carpentry_job_budget_id` files the cost under that material budget line; leaving it blank files it uncategorised. Internal houses have no budget lines, so no picker.
- **Worker PWA capture gate:** shown + allowed for an employee who is a **leading hand** OR whose login links to an admin/supervisor role. As at 2026-10-04 the leading hands are exactly the three directors (Sam, Josh, Max) — all three can scan; the four regular carpenters cannot. Max has no Hub login, so the leading-hand flag is why he's recognised.
- **Deleting a cost:** removing the `carpentry_job_cost` row drops it from the tally; the Dropbox file is not auto-deleted.

## 13. Owner of the process
Admin / Director.
Next review date: 2027-04-04

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these in order; record pass/fail. If any fail, document it and do not set `test_status: passed`.

### Pre-test setup
- [ ] Migration 204 applied on the target environment (`carpentry_job_costs.receipt_path` + `supplier_name` exist).
- [ ] Dropbox configured (`DROPBOX_*` + `DROPBOX_NAMESPACE_ID`); the folder `/BLUE LEAF BUILDING/RECIEPTS` exists.
- [ ] Logged in as **Admin**.
- [ ] Pick a real carpentry job AND an internal house (BL-JOSH-HOUSE / BL-SAM-HOUSE); note each one's current **Material $** total.
- [ ] Have a sample supplier invoice as a PDF or image (with a visible ex-GST subtotal, an inc-GST total, and a clear invoice date).

### Test cases

**TC-01 — Happy path (Hub real job: scan → confirm → tally → Dropbox)**
1. Open the job → **Costs** tab → **Supplier invoices & misc costs** → **Scan / upload invoice** → choose the sample PDF.
2. Confirm box appears pre-filled (supplier + ex-GST amount + invoice date). Optionally pick a cost category.
3. Click **Add to job**.
4. Expected: success message "Invoice added to the job tally — filed to Dropbox."; the invoice appears in the captured list with a 📄 View link; **Material $** increases by the ex-GST amount.
5. Expected DB: a row in `carpentry_job_costs` for this job — `source='manual'`, `cost_type='material'`, `amount` = confirmed ex-GST, `receipt_path` = a `/BLUE LEAF BUILDING/RECIEPTS/…` path, `supplier_name` set, `carpentry_job_budget_id` set iff a category was chosen.
6. Expected Dropbox: a file at `/BLUE LEAF BUILDING/RECIEPTS/<invoice date D.M.YYYY> <supplier>.<ext>`.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field (no amount)**
1. Scan an invoice; in the confirm box clear the **Amount** field.
2. Click **Add to job**.
3. Expected: "Enter the ex-GST amount." — the Save is blocked; **no** `carpentry_job_costs` row and **no** Dropbox file created.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Complete TC-01.
2. Scan the **same** invoice again and save.
3. Expected: a **second** cost row + a second Dropbox file (autorenamed `… (1).ext`). The app does not dedupe — two genuine entries. Document this; it's expected, not a bug.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role (regular field worker)**
1. In the Worker PWA, open as a **non-leading-hand** employee (e.g. Dylan / Ben) via their worker token.
2. Expected: the **Scan supplier invoice** tile is NOT shown.
3. Call `POST /api/worker/carpentry/jobs/<jobId>/cost-receipt/scan` directly with that worker token.
4. Expected: HTTP 403 "Only a leading hand, admin or supervisor can capture invoices." — no file stored, no row created.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (Dropbox + view link + tally)**
1. Complete TC-01.
2. Check: the file exists in `/BLUE LEAF BUILDING/RECIEPTS` named by invoice date + supplier.
3. Check: `GET /api/carpentry/jobs/<jobId>/costs` returns the new row with `hasReceipt: true`; `GET …/costs/<costId>/receipt-link` returns a `url` that opens the invoice.
4. Check: `GET /api/carpentry/jobs/<jobId>/summary` `otherActual` / `totalActual` increased by the ex-GST amount.
- [ ] Pass  [ ] Fail

**TC-06 — Haiku OCR + ex-GST basis + invoice date (feature-specific)**
1. Scan an invoice whose ex-GST subtotal is clearly printed (e.g. $1,000 ex, $1,100 inc) and whose invoice date is clear.
2. Expected: amount prefills **1000** (not 1100); the **date** prefills the invoice date off the receipt.
3. Scan an invoice with only an inc-GST total of $1,100 and no ex-GST line.
4. Expected: amount prefills ~**1000** (derived 1100 ÷ 1.1); the operator can correct it.
5. Expected: the AI call used the Haiku model (no Sonnet escalation).
- [ ] Pass  [ ] Fail

**TC-07 — Double-count guard + disjoint tally (feature-specific)**
1. On a job that has at least one approved **Finance** invoice, open the Costs tab.
2. Expected: an **amber** guard warns that the job already has N Finance invoices.
3. Capture a $500 ex-GST misc receipt here (do NOT also enter it in Finance). Reload.
4. Expected: Material $ went up by exactly $500 once (the `manual` capture is disjoint from the finance read-through).
- [ ] Pass  [ ] Fail

**TC-08 — Fail-soft when Dropbox is unavailable (feature-specific)**
1. On an environment WITHOUT Dropbox configured (or simulate an upload failure), capture an invoice and save.
2. Expected: the cost **still saves** (Material $ increases) and the message says the file wasn't filed; the row has a null `receipt_path` and `hasReceipt: false`.
- [ ] Pass  [ ] Fail

**TC-09 — All-jobs scope + job-scoped view link (feature-specific)**
1. In the Worker PWA job picker, confirm **real client jobs** (not just the two houses) are listed.
2. Capture a receipt on job A. Note its `costId`.
3. Call `GET /api/carpentry/jobs/<jobB>/costs/<costId>/receipt-link` (a DIFFERENT job B).
4. Expected: 404 "No receipt on this cost." / not-found — the link is scoped by both `id` and `job_id`, so job B can't read job A's receipt.
- [ ] Pass  [ ] Fail

**TC-10 — Duplicate-scan detection (feature-specific; needs migration 205 for the strong match)**
1. Capture an invoice on a job (TC-01) with a visible invoice number (e.g. #INV-5521, $200 ex-GST, dated 1.10.2026).
2. Scan the **same** invoice again on the **same** job.
3. Expected: the confirm box shows an **amber "already logged" warning** naming the existing supplier + date + amount; you can **still Add to job** (advisory, not blocked). Adding creates a genuine second row (no auto-dedupe).
4. Scan a **different** invoice from the **same supplier, same day, same amount, with no invoice number** → expected: the fuzzy warning still appears.
5. Scan a genuinely different invoice (different number and amount) → expected: **no** warning.
6. Expected DB: the saved rows carry `invoice_number` when the invoice had one (verify `carpentry_job_costs.invoice_number`).
7. (Pre-migration-205 environments only) scanning + saving still works; the strong invoice-number match is inactive until 205 is applied, but the supplier+date+amount fuzzy warning still fires.
- [ ] Pass  [ ] Fail
