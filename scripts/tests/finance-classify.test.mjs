// classifyInboxDoc — invoice vs quote/statement gate for the finance email poller.
// Cases are the REAL admin-inbox docs from 2026-07 (see the live diagnostic): 9 tender quotes,
// 1 statement, 2 genuine invoices were all being ingested as invoices to match/pay.
// Run: node scripts/tests/finance-classify.test.mjs
import { classifyInboxDoc } from "../../server/lib/financeRoutes.mjs";

let pass = 0, fail = 0;
function is(extracted, meta, expected, name) {
  const got = classifyInboxDoc(extracted, meta);
  if (got === expected) pass++;
  else { fail++; console.error(`  ✗ ${name}\n      expected ${expected}, got ${got}`); }
}

// ── Real quotes that must be SKIPPED (were wrongly ingested as invoices) ──
is({}, { filename: "QU-22138.pdf", subject: "Stone Quotation Marino" }, "quote", "Stone Quotation");
is({}, { filename: "Quote.pdf", subject: "Re: Reminder — quote for 2 Forrest Avenue, Marino," }, "quote", "the screenshot's Quote.pdf");
is({}, { filename: "V71-87063 - 13 (CUSTOMER COPY) - BLUE LEAF BUILDING.pdf", subject: "87063 - RFQ — Windows / Skylights — 2 Forrest Aven" }, "quote", "RFQ Windows subject");
is({}, { filename: "Quote QU0360.pdf", subject: "Re: RFQ — Roof Plumber — 2 Forrest Avenue, Marino," }, "quote", "RFQ Roof Plumber");
is({}, { filename: "2 Forrest Ave, Marino.pdf", subject: "Re: RFQ — Concrete & Footings — 2 Forrest Avenue," }, "quote", "RFQ Concrete (filename is just an address)");
is({}, { filename: "V1 A2606065+Quote+for+2+Forrest+Avenue+Marino.pdf", subject: "Re:RFQ — Windows / Skylights — 2 Forrest Avenue, M" }, "quote", "Quote-for filename");
is({}, { filename: "Q1455 Quote JDM - 2 Forrest Avenue, Marino.pdf", subject: "Q1455 — Structural Steel — 2 Forrest Avenue, Marin" }, "quote", "Quote JDM");
is({}, { filename: "QUOTE (REV 1 non-thermal) GLA260647.pdf", subject: "Quote - GLA260647 Blue Leaf Building, 2 Forrest Av" }, "quote", "QUOTE rev 1");
is({}, { filename: "Quote QU0592.pdf", subject: "Quote QU-0592 2 Forest Ave Marino  from Spellacy F" }, "quote", "Quote QU0592");

// ── Real statement (also not a payable) ──
is({}, { filename: "XDOC21.1782871315011.24.1.CUSTOMER.CUSTOMER.pdf", subject: "Your customer statement as of 30/06/2026" }, "statement", "customer statement");

// ── Real invoices that must be KEPT ──
is({}, { filename: "invoice_INV2026071816.pdf", subject: "Here is your invoice" }, "invoice", "plain invoice");
is({}, { filename: "INVOICE_NO405749.pdf", subject: "Pro Clima Sales Invoice No.405749 for your PO No." }, "invoice", "sales invoice");

// ── AI document_kind ──
is({ document_kind: "quote" }, { filename: "anything.pdf", subject: "no keyword here" }, "quote", "AI kind=quote");
is({ document_kind: "statement" }, { filename: "x.pdf", subject: "" }, "statement", "AI kind=statement");
is({ document_kind: "invoice" }, { filename: "doc123.pdf", subject: "here is the bill" }, "invoice", "AI kind=invoice + neutral text → invoice");
// A reliable RFQ/quote subject overrides an AI 'invoice' misread — those replies are never payables.
is({ document_kind: "invoice" }, { filename: "reply.pdf", subject: "Re: RFQ — Roof Plumber — 2 Forrest Avenue" }, "quote", "clean RFQ subject beats an AI invoice misread");

// ── Ambiguity + safety: an invoice word protects a real payable even if 'quote' also appears ──
is({}, { filename: "Tax Invoice 998.pdf", subject: "Tax Invoice for accepted quote Q123" }, "invoice", "tax invoice referencing a quote → keep");
is({}, { filename: "invoice-5.pdf", subject: "Invoice for your quote" }, "invoice", "invoice word present with 'quote' → keep (never drop a payable)");
is({}, { filename: "scan001.pdf", subject: "Fwd: account" }, "invoice", "no signal → default keep");

console.log(`finance-classify: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
