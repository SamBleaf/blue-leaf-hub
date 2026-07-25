// getBoardQuoteSummary + getQuoteBenchmarksByTrade — unit tests. Run: node scripts/tests/tender-board-summary.test.mjs
// No framework — plain assertions, exits 1 on any failure. Uses a stub Supabase client that
// mimics .from(table).select(...).range(from,to)/.in(col,vals)/.eq(col,val) and paginates in 1000-row pages.
import { getBoardQuoteSummary, getQuoteBenchmarksByTrade } from "../../server/lib/tenderReadModel.mjs";

let pass = 0, fail = 0;
function eq(a, e, name) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) pass++; else { fail++; console.error(`  ✗ ${name}\n      expected ${E}\n      got      ${A}`); } }
function ok(c, name) { if (c) pass++; else { fail++; console.error(`  ✗ ${name}`); } }

// Build a stub sb over in-memory tables. Supports .select(), .in(col, vals), .range(from, to).
function makeSb(tables) {
  return {
    from(table) {
      let rows = (tables[table] || []).slice();
      const api = {
        select() { return api; },
        in(col, vals) { const set = new Set(vals); rows = rows.filter((r) => set.has(r[col])); return api; },
        eq(col, val) { rows = rows.filter((r) => r[col] === val); return api; },
        async range(from, to) { return { data: rows.slice(from, to + 1), error: null }; },
      };
      return api;
    },
  };
}

// ── Scenario 1: counts, verified-current derivation, awarded total from the pointer ──
{
  const rfqs = [
    { id: "r1", job_id: "J1", accepted_submission_id: "s1b" }, // awarded to v2
    { id: "r2", job_id: "J1", accepted_submission_id: null },  // quoted, not awarded
    { id: "r3", job_id: "J2", accepted_submission_id: "s3" },  // awarded, amount-less
    { id: "r4", job_id: "J2", accepted_submission_id: null },  // no quotes
  ];
  const subs = [
    // r1: two versions same scope — only v2 (current) verified counts
    { id: "s1a", rfq_id: "r1", version: 1, sub_scope_label: null, verification_status: "verified", status: "superseded", confirmed_amount_ex_gst: 100, extracted_amount_ex_gst: null },
    { id: "s1b", rfq_id: "r1", version: 2, sub_scope_label: null, verification_status: "verified", status: "accepted", confirmed_amount_ex_gst: 5000, extracted_amount_ex_gst: null },
    // r2: one unverified quote
    { id: "s2", rfq_id: "r2", version: 1, sub_scope_label: null, verification_status: "unverified", status: "received", confirmed_amount_ex_gst: null, extracted_amount_ex_gst: 900 },
    // r3: awarded but no amount on the accepted submission
    { id: "s3", rfq_id: "r3", version: 1, sub_scope_label: null, verification_status: "unverified", status: "accepted", confirmed_amount_ex_gst: null, extracted_amount_ex_gst: null },
  ];
  const out = await getBoardQuoteSummary(makeSb({ rfqs, rfq_quote_submissions: subs }));
  eq(out.J1.quoteCount, 2, "J1 quoteCount = r1 + r2");
  eq(out.J1.verifiedCount, 1, "J1 verifiedCount = r1 (v2 current+verified); superseded v1 not double-counted");
  eq(out.J1.awardedCount, 1, "J1 awardedCount = r1");
  eq(out.J1.acceptedTotalExGst, 5000, "J1 committed = awarded submission s1b amount");
  eq(out.J2.quoteCount, 1, "J2 quoteCount = r3 only (r4 has no quotes)");
  eq(out.J2.awardedCount, 1, "J2 awardedCount = r3");
  eq(out.J2.acceptedTotalExGst, 0, "J2 committed = 0 — awarded quote has no amount (count>0 but $0, no NaN)");
  ok(Number.isFinite(out.J2.acceptedTotalExGst), "J2 committed is a finite number, never NaN");
}

// ── Scenario 2: pagination past the 1000-row cap (no silent truncation) ──
{
  const rfqs = [];
  const subs = [];
  for (let i = 0; i < 1500; i++) {
    rfqs.push({ id: `r${i}`, job_id: "JBIG", accepted_submission_id: `s${i}` });
    subs.push({ id: `s${i}`, rfq_id: `r${i}`, version: 1, sub_scope_label: null, verification_status: "verified", status: "accepted", confirmed_amount_ex_gst: 10, extracted_amount_ex_gst: null });
  }
  const out = await getBoardQuoteSummary(makeSb({ rfqs, rfq_quote_submissions: subs }));
  eq(out.JBIG.quoteCount, 1500, "1500 rfqs counted despite the 1000-row page cap");
  eq(out.JBIG.awardedCount, 1500, "1500 awards counted across pages");
  eq(out.JBIG.acceptedTotalExGst, 15000, "committed total sums all 1500 pages (1500×10)");
}

// ── Scenario 3: getQuoteBenchmarksByTrade — only VERIFIED, current, non-superseded quotes ──
{
  const rfqs = [
    { id: "r1", job_id: "J1", trade: "Joinery", trade_category_id: "tc-joinery" },
    { id: "r2", job_id: "J2", trade: "Joinery", trade_category_id: "tc-joinery" },
    { id: "r3", job_id: "J1", trade: "Plumbing", trade_category_id: "tc-plumb" },
    { id: "r4", job_id: "J3", trade: "Painting", trade_category_id: null }, // text-keyed fallback
  ];
  const subs = [
    // r1 Joinery: two scopes, both verified+current → both count (cabinetry + benchtops)
    { id: "s1a", rfq_id: "r1", version: 1, sub_scope_label: "cabinetry", verification_status: "verified", status: "received", confirmed_amount_ex_gst: 20000, extracted_amount_ex_gst: null },
    { id: "s1b", rfq_id: "r1", version: 1, sub_scope_label: "benchtops", verification_status: "verified", status: "received", confirmed_amount_ex_gst: 12000, extracted_amount_ex_gst: null },
    // r1 also a superseded old version of cabinetry — excluded
    { id: "s1c", rfq_id: "r1", version: 0, sub_scope_label: "cabinetry", verification_status: "verified", status: "superseded", confirmed_amount_ex_gst: 99999, extracted_amount_ex_gst: null },
    // r2 Joinery: verified → counts (uses extracted since confirmed null)
    { id: "s2", rfq_id: "r2", version: 1, sub_scope_label: null, verification_status: "verified", status: "received", confirmed_amount_ex_gst: null, extracted_amount_ex_gst: 16000 },
    // r3 Plumbing: UNVERIFIED → excluded entirely
    { id: "s3", rfq_id: "r3", version: 1, sub_scope_label: null, verification_status: "unverified", status: "received", confirmed_amount_ex_gst: 46905, extracted_amount_ex_gst: null },
    // r4 Painting: verified but amount 0/null → excluded (no usable amount)
    { id: "s4", rfq_id: "r4", version: 1, sub_scope_label: null, verification_status: "verified", status: "received", confirmed_amount_ex_gst: 0, extracted_amount_ex_gst: null },
  ];
  // The stub .eq filters, so a verification_status filter must actually apply:
  const out = await getQuoteBenchmarksByTrade(makeSb({ rfqs, rfq_quote_submissions: subs }));
  const joinery = out.find((t) => t.trade === "Joinery");
  ok(joinery, "Joinery benchmark present");
  eq(joinery.sampleSize, 3, "Joinery n = cabinetry 20k + benchtops 12k + r2 16k (superseded excluded)");
  eq(joinery.min, 12000, "Joinery low = 12,000");
  eq(joinery.max, 20000, "Joinery high = 20,000");
  eq(joinery.avg, 16000, "Joinery avg = (20k+12k+16k)/3 = 16,000");
  eq(joinery.p50, 16000, "Joinery median = 16,000");
  ok(!out.find((t) => t.trade === "Plumbing"), "Plumbing excluded — only quote is unverified");
  ok(!out.find((t) => t.trade === "Painting"), "Painting excluded — verified quote has no usable amount");
}

console.log(`\ntender-board-summary: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
