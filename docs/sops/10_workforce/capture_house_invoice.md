---
sop_version: 1.0
last_reviewed: 2026-10-03
app_version: main — built 2026-10-03 (migration 204): scan/upload a supplier invoice straight onto an internal house job (BL-JOSH-HOUSE / BL-SAM-HOUSE) from the Workforce house view (Phase 1) or the Worker PWA (Phase 2, admin/supervisor only). Haiku-only OCR prefills supplier + ex-GST amount; the operator confirms the amount; it saves as a carpentry_job_cost and drops into the job's material tally. Stored in the private 'job-cost-receipts' bucket. Requires migration 204 applied.
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 10-08: Capture a supplier invoice on an internal house job (scan / upload)

**Module:** Workforce / Carpentry
**SOP ID:** 10-08
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
- **Admin / Director** — the primary users (Sam, Josh). Scan or upload supplier invoices for Josh's / Sam's house as they come in.
- **Supervisor** — may also capture invoices (same permissions as Admin for this action).
- **Field workers** — **cannot** use this. Cost capture writes money onto a job and is director-only on both surfaces.

## 2. When to use it
A supplier invoice or receipt arrives for materials bought for an internal house (timber, hardware, fixtures, etc.) and you want it counted against that house's running cost **without** going through the Finance module. Use it when you're already looking at the house in Workforce, or standing at the ute with the paper invoice in hand and your phone.

## 3. What this does
Lets you photograph or upload a supplier invoice straight onto an internal house job. The app reads the supplier and the ex-GST amount off the invoice for you, you check the amount, and it's added to that house's material total. The invoice file itself is stored so you can open it again later. It saves the trip through Finance for these internal, cost-only jobs.

## 4. Before you start
- **Migration 204 must be applied** (adds the receipt columns + the `job-cost-receipts` storage bucket). If it isn't, the scan button returns "Receipts storage isn't set up yet — apply migration 204" and nothing is saved.
- You must be signed in as **Admin or Supervisor**.
- The two internal house jobs (**BL-JOSH-HOUSE**, **BL-SAM-HOUSE**) must exist (seeded by migration 202).
- On a phone, allow the browser/app camera permission the first time.

## 5. Step-by-step process

### A. From the Hub (desktop or phone browser)
1. Go to **Carpentry** in the sidebar (or open the house from the **Internal** group) and open **Josh's house** or **Sam's house**.
2. Find the **Supplier invoices** card.
3. Click **📷 Scan / upload invoice**. On a computer this opens a file picker (choose a PDF or image); on a phone it opens the **camera** to photograph the invoice.
4. Wait a moment — **"Reading…"** means the AI is reading the invoice. A confirm box appears, pre-filled with the **supplier / description**, the **amount (ex-GST)**, and the **date**.
5. **Check the amount.** The AI read it off the invoice — fix it if it's wrong (especially if the supplier isn't GST-registered). All amounts are stored **ex-GST**.
6. Click **Add to job**.

### B. From the Worker PWA (on your phone)
1. Open the **Worker app** (the installed PWA / `/worker`). You must be logged in as an admin or supervisor.
2. On the home screen, tap **Scan supplier invoice** (this tile only shows for admins/supervisors).
3. Choose the **House** (Josh's / Sam's).
4. Tap **📷 Scan / upload invoice** → photograph the invoice.
5. Check the pre-filled **amount (ex-GST)** and fix if needed.
6. Tap **Add to job**.

> 💡 **Tip:** Only the specific internal **houses** take direct invoice capture here. Real client jobs still go through Finance so they flow to Xero.

[insert screenshot: the Supplier invoices card with the Scan/upload button]
[insert screenshot: the confirm box with supplier + ex-GST amount pre-filled]

## 6. What happens next
- A row is written to **carpentry_job_costs** (source `manual`, cost_type `material`) with the amount, supplier, date, and a link to the stored file (`receipt_path`).
- The house's **Material $** and **Total $** tiles and the per-category total go **up** by the amount on the next load.
- The invoice shows in the **captured invoices** list with a **📄 View** link (a signed, 1-hour URL to the stored file).
- Nothing is sent to Finance or Xero — these are internal cost-only jobs.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Entering the GST-inclusive total | The invoice shows the big (inc-GST) number most prominently | The field is labelled **ex-GST**; the AI prefills the ex-GST figure — leave it unless it's clearly wrong |
| Also entering the same invoice in Finance | Capturing here *and* tagging it to the job in Finance | For the houses, capture it **here only** — entering it in both places double-counts |
| Scanning a blurry photo | Camera moved / poor light | Hold steady; if the amount comes back blank, just type it in |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Receipts storage isn't set up yet — apply migration 204" | Migration 204 not applied on this environment | Apply `supabase/migrations/204_carpentry_cost_receipts.sql` in the Supabase SQL editor |
| "Couldn't auto-read the amount — enter it below" | OCR couldn't find a clear ex-GST figure | Type the ex-GST amount manually and save — the file is still attached |
| The **Scan supplier invoice** tile isn't on the Worker home | You're not an admin/supervisor, or your login isn't linked to an employee with a worker token | Only admins/supervisors see it; a director who can't see it needs their login linked to an employee record with a worker token (see §12) |
| "Only an admin or supervisor can capture invoices." | A non-director hit the endpoint | Expected — the action is director-only on both surfaces |
| 📄 View does nothing | The signed URL expired (older than 1 hour) or storage is misconfigured | Reload the page to get a fresh link |

## 9. Related modules
- [BL-INTERNAL — internal cost categories & internal house jobs](internal_cost_categories.md) — the house jobs + how labour and finance costs already feed the tally
- [BLB Charge Up — site-level charge-up tracking](charge_up_sites.md) — the sibling cost-capture pattern
- Finance → invoice upload (09-01) — the full approval path for **client** job invoices (not used for the houses)

## 10. Screenshot placeholders
[insert screenshot: house view — Supplier invoices card, empty state]
[insert screenshot: confirm box pre-filled from a scanned invoice]
[insert screenshot: captured invoices list with a 📄 View link and the Material $ tile increased]
[insert screenshot: Worker PWA home with the admin-only "Scan supplier invoice" tile]

## 11. Automation notes
- **AI OCR:** the uploaded file is read by **Claude Haiku** (`claude-haiku-4-5`, token-conservative — no Sonnet escalation) via `extractInvoiceHaiku()`; returns supplier + amount (best-effort, never auto-saves).
- **File saved to:** the private Supabase Storage bucket **`job-cost-receipts`** at `carpentry_jobs/<jobId>/<date>-<epoch>-<filename>`.
- **Record created in:** `carpentry_job_costs` — `source='manual'`, `cost_type='material'`, `amount` (ex-GST), `supplier_name`, `receipt_path`.
- **Amount basis:** stored ex-GST — prefers the invoice's captured ex-GST figure, else derives it from the inc-GST total ÷ 1.1; always human-confirmed before save.
- **Tally:** the job `/summary` + `/budget` endpoints already sum `carpentry_job_costs`, so the row counts immediately; it is **disjoint** from the finance read-through (no double-count).
- **Role gate:** Hub = `requireAuth` + the director-only (`$`-visibility) UI gate; Worker PWA = `requireWorkerDirector` (worker-token employee → `user_profiles.role` ∈ {admin, supervisor}).

## 12. Edge cases and limits
- **Amount blank / OCR fails:** the file is still stored; you must type the ex-GST amount before **Add to job** will save (0 is allowed, negatives are rejected).
- **File types / size:** PDF or image only; max 15 MB (phone photos are downscaled + JPEG-compressed client-side first).
- **Discarded draft:** if you scan then **Discard**, the file is already in storage but no cost row references it (harmless orphan; no money recorded).
- **Non-GST-registered supplier:** the ÷1.1 derivation would under-count — the confirm step is where you catch it and type the true amount.
- **Worker PWA access for directors:** a director can only use the PWA scan if their login is linked to an **employee** record (`employees.user_id`) that has a **worker token**. As at 2026-10-03, only **Sam** is linked; Josh / the supervisor need linking to use the PWA path (they can all use the Hub path today).
- **Deleting a cost:** removing the `carpentry_job_cost` row drops it from the tally; the stored file is not auto-deleted.

## 13. Owner of the process
Admin / Director.
Next review date: 2027-04-03

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these in order; record pass/fail. If any fail, document it and do not set `test_status: passed`.

### Pre-test setup
- [ ] Migration 204 applied on the target environment (receipt columns + `job-cost-receipts` bucket exist).
- [ ] Logged in as **Admin**.
- [ ] BL-JOSH-HOUSE (or BL-SAM-HOUSE) exists; note its current **Material $** total.
- [ ] Have a sample supplier invoice as a PDF or image (with a visible ex-GST subtotal and an inc-GST total).

### Test cases

**TC-01 — Happy path (Hub: scan → confirm → tally)**
1. Open the house → **Supplier invoices** card → **Scan / upload invoice** → choose the sample PDF.
2. Confirm box appears pre-filled (supplier + ex-GST amount + date).
3. Leave/adjust the amount; click **Add to job**.
4. Expected result: success message; the invoice appears in the captured list with a 📄 View link; **Material $** increases by the ex-GST amount.
5. Expected DB record: a row in `carpentry_job_costs` for this job — `source='manual'`, `cost_type='material'`, `amount` = confirmed ex-GST, `receipt_path` set, `supplier_name` set.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field (no amount)**
1. Scan an invoice; in the confirm box clear the **Amount** field.
2. Click **Add to job**.
3. Expected result: "Enter the ex-GST amount." — the Save is blocked.
4. Expected DB: no new `carpentry_job_costs` row.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Complete TC-01.
2. Scan the **same** invoice again and save.
3. Expected result: a **second** cost row is created (the app does not dedupe — two genuine entries; the tally reflects both). Document this behaviour; it's expected, not a bug.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role (field worker)**
1. In the Worker PWA, open as a **field worker** (worker token for a non-admin/supervisor employee).
2. Expected result: the **Scan supplier invoice** tile is NOT shown on the home screen.
3. Call `POST /api/worker/carpentry/jobs/<houseId>/cost-receipt/scan` directly with that worker token.
4. Expected result: HTTP 403 "Only an admin or supervisor can capture invoices." — no file stored, no row created.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (storage + signed URL + tally)**
1. Complete TC-01.
2. Check: a file exists in the `job-cost-receipts` bucket under `carpentry_jobs/<jobId>/…`.
3. Check: `GET /api/carpentry/jobs/<jobId>/costs` returns the new row with a non-empty `receiptUrl`, and opening it shows the invoice.
4. Check: `GET /api/carpentry/jobs/<jobId>/summary` `otherActual` / `totalActual` increased by the ex-GST amount.
- [ ] Pass  [ ] Fail

**TC-06 — Haiku OCR + ex-GST basis (feature-specific)**
1. Scan an invoice whose ex-GST subtotal is clearly printed (e.g. $1,000 ex, $1,100 inc).
2. Expected result: the confirm box prefills **1000** (the ex-GST figure), not 1100.
3. Scan an invoice with only an inc-GST total of $1,100 and no ex-GST line.
4. Expected result: the amount prefills ~**1000** (derived 1100 ÷ 1.1); the operator can correct it.
5. Expected: the AI call used the Haiku model (no Sonnet escalation) — confirm via the AI call log / no Sonnet usage for this scan.
- [ ] Pass  [ ] Fail

**TC-07 — No double-count with the finance read-through (feature-specific)**
1. Note the house **Material $**. Capture an invoice here (TC-01) for $500 ex-GST.
2. Do NOT tag it in Finance. Reload the house.
3. Expected result: Material $ went up by exactly $500 once (the captured row is a `manual` cost, disjoint from the finance `financial_documents` read-through — it is counted a single time).
- [ ] Pass  [ ] Fail

**TC-08 — Fail-soft before migration 204 (feature-specific)**
1. On an environment WITHOUT migration 204, open the house and try **Scan / upload invoice**.
2. Expected result: "Receipts storage isn't set up yet — apply migration 204"; no row created; the rest of the house view (hours, labour $, existing costs) still renders normally.
- [ ] Pass  [ ] Fail
