---
sop_version: 1.0
last_reviewed: 2026-08-16
app_version: main
screenshot_status: placeholders_only
owner: Finance (Admin / Director)
test_status: untested
---

# SOP: Raise the concept fee in Xero

**Module:** Finance / Sales (Discovery)
**SOP ID:** 09-14
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin (Director).

## 2. When to use it
At **Discovery**, once the client has **accepted the concept agreement** and a **concept fee** is set — to bill that fee as a real Xero invoice.

## 3. What this does
Creates an **AUTHORISED** invoice in Xero for the concept fee, with GST added by Xero, an invoice number, and a pay link. The invoice is stored against the lead and shows its live status (Authorised → Part paid → Paid). **This phase creates the invoice only** — emailing the official branded PDF to the client is a later phase.

> Amounts are entered EX-GST; Xero adds the 10% GST. The invoice layout/branding is Xero's (its Branding Theme) — nothing is designed in the Hub. Re-clicking **Create** never makes a duplicate (idempotent).

## 4. Before you start
- Xero is **connected** (SOP 09-13) and `XERO_ENABLED=1` on the server.
- `XERO_ACCOUNT_CODE_DESIGN` is set to your Xero **income account code** for design fees (from your chart of accounts).
- Migration **182** applied.
- The lead is at **Discovery**, the concept agreement is **accepted**, and a **concept fee** is set.

## 5. Step-by-step process
1. Open the Discovery lead → **Concept fee invoice (Xero)** card.
2. Check the amount (shown ex-GST and inc-GST).
3. Click **Create invoice in Xero** → confirm.
4. The invoice appears with its Xero number, inc-GST total, and status **Authorised**. In Xero, the ACCREC invoice now exists against the client.
5. Use **Sync status** any time to refresh paid/unpaid from Xero.

[insert screenshot: Concept fee invoice card — Create]
[insert screenshot: Created — Authorised with Xero number]

## 6. What happens next
The concept fee is now a tracked receivable in Xero. In the next phase the Hub will send the official branded PDF + pay link to the client and file it; payment status will sync back automatically (webhook + nightly reconcile).

## 7. Common mistakes

| Mistake | Why | Avoid |
|---|---|---|
| Creating before acceptance | The gate blocks it | Mark the concept agreement accepted first. |
| No account code set | Xero rejects the line | Set `XERO_ACCOUNT_CODE_DESIGN` to a real income code. |
| Expecting the client to be emailed | This phase is create-only | Sending arrives in the next phase. |
| Editing the amount in the Hub after creating | Xero is the source of truth | Void/edit in Xero, then Sync. |

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Button disabled | Not accepted / no fee / Xero off or not connected | Fix whichever the card flags. |
| "Xero invoicing is off" | `XERO_ENABLED` not set | Set `XERO_ENABLED=1` and reload. |
| "income account code is not configured" | `XERO_ACCOUNT_CODE_DESIGN` unset | Set it to a valid Xero income account code. |
| "Connect Xero first" | No connected org | Connect in Settings → Integrations → Xero. |
| Status looks stale | Payment happened in Xero | Click **Sync status** (auto-sync arrives in P3). |

## 9. Related modules
- [Connect Xero](finance_connect_xero.md) · [Concept agreement](../02_sales/02-16_concept_agreement.md) · [Select designer + fees](../02_sales/02-14_select_designer_and_fees.md)

## 10. Screenshot placeholders
[insert screenshot: card gated hints] [insert screenshot: invoice row with status badge]

## 11. Automation notes
- Create → `POST /api/finance/leads/:leadId/concept-fee/invoice` (admin; gated by `XERO_ENABLED`). Requires `concept_agreement_status='accepted'` (422 `GATE_BLOCKED` otherwise) and a positive `concept_fee`. Calls `xeroInvoices.createXeroInvoice({invoiceType:'concept_fee', sourceType:'lead', sourceId:leadId})`.
- `createXeroInvoice`: finds/creates the `xero_invoices` row by `(source_type, source_id)` — if it already has a `xero_invoice_id` it **syncs instead of creating** (anti-double-create). Resolves the income account code (marks the row `error` with a plain message if unset). `ensureXeroContact` finds-or-creates + caches the Xero Contact. POSTs `/Invoices` `Type=ACCREC`, one EX-GST line, `LineAmountTypes=Exclusive`, `TaxType=OUTPUT`, `Status=AUTHORISED`, with the row's persisted **Idempotency-Key**. Persists `xero_invoice_id/number/status/total/amount_due/amount_paid` and the Hub status.
- List → `GET /api/finance/leads/:leadId/xero-invoices`. Sync → `POST /api/finance/xero-invoices/:id/sync` (GET the Xero invoice → copy status/amounts; never touches the send lock).
- Hub status is derived from Xero (`hubStatusFromXero`): `paid` (AmountDue=0), `part_paid` (AmountPaid>0 & AmountDue>0), `void` (VOIDED), else `authorised` — Xero's inc-GST totals are copied, never recomputed.
- Fail-soft: not-connected → 400 "Connect Xero first"; not-enabled → 400; missing account code → clear error + row marked `error`.

## 12. Edge cases and limits
- One concept-fee invoice per lead (DB `UNIQUE(source_type, source_id)`); re-create returns the same invoice.
- If the app crashes after Xero created the invoice but before the Hub saved it, a retry re-sends the same Idempotency-Key → Xero returns the same invoice (no duplicate).
- Voiding/crediting is done in Xero; **Sync status** reflects it in the Hub.

## 13. Owner of the process
Finance (Admin / Director). Next review: 2027-02-16

---

## 14. Troubleshoot Agent Test Script

> Requires: Xero connected to the **Demo Company** (SOP 09-13), `XERO_ENABLED=1`, `XERO_ACCOUNT_CODE_DESIGN` set to a Demo Company income code, migration 182 applied. Admin. A Discovery lead with the concept agreement **accepted** and a **concept fee** set.

### Test cases
**TC-01 — Gate (not accepted)** On a Discovery lead that is NOT accepted, the card shows the accept-first hint and the button is disabled; `POST …/concept-fee/invoice` → 422 `GATE_BLOCKED`. [ ] Pass [ ] Fail
**TC-02 — Create** On an accepted lead with a fee, click **Create invoice in Xero** → confirm → an invoice row appears **Authorised** with a Xero number; the **Demo Company** shows an ACCREC invoice: right contact, one EX-GST line at the fee, GST added by Xero, right account code, Reference = the lead name. [ ] Pass [ ] Fail
**TC-03 — No duplicate** Click **Create** again → returns the **same** invoice (same Xero number); Demo Company still has exactly one. [ ] Pass [ ] Fail
**TC-04 — Wrong role** Non-admin token → `POST …/concept-fee/invoice` → 403. [ ] Pass [ ] Fail
**TC-05 — Account code missing** Unset `XERO_ACCOUNT_CODE_DESIGN`, try to create → clear error "income account code is not configured"; the row is marked `error` (no Xero invoice made). Restore the env after. [ ] Pass [ ] Fail
**TC-06 — Sync** In the Demo Company, part-pay then fully pay the invoice; click **Sync status** each time → the Hub row goes `part_paid` then `paid` with matching amounts. [ ] Pass [ ] Fail
**TC-07 — Xero off** Set `XERO_ENABLED=` (off) → `POST …/concept-fee/invoice` → 400 "Xero invoicing is off"; the card shows the off hint. [ ] Pass [ ] Fail

### Post-test checklist
- [ ] All passed · [ ] No console/network errors · [ ] `xero_invoices` + Demo Company correct · [ ] Update test_status · [ ] Changelog entry
