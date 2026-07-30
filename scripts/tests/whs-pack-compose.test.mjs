// WHS pack composer — unit tests. Run: node scripts/tests/whs-pack-compose.test.mjs
// Locks the safety invariants of composeWhsPack (Phase B) + the fixes from the Phase-A–C adversarial
// audit. This is a liability document — these must never silently regress.
import { composeWhsPack } from "../../server/lib/whs/packCompose.mjs";

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error(`  ✗ ${name}`); } };

const mod = (code, part, controlTexts, ppe = []) => ({
  module_code: code, title: `${code} title`, part, is_hrcw: part === 1 ? "yes" : "no", review_status: "reviewed",
  content_json: {
    activity: "act", hazard: "haz",
    controlOptions: controlTexts.map((t, i) => ({ level: i + 1, text: t })),
    ppeRules: ppe,
  },
});
const H = mod("H-01", 1, ["Eliminate: do it at ground level", "Isolate: edge protection", "PPE: harness"], [{ item: "hard hat", flag: "C", condition: "" }, { item: "hi-vis", flag: "S" }]);
const T = mod("T-01", 2, ["Use a guard", "Wet-cut to suppress dust"], [{ item: "P2 respirator", flag: "R" }]);
const base = { job: { address: "1 Test St", reference: "J1" }, company: { name: "BLB", abn: "88 656 051 188" } };

// 1. Only the TICKED controls render (never the full option list) — audit finding #2/#6.
{
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["Isolate: edge protection"] }, answers: {} };
  const html = composeWhsPack({ ...base, pack, modules: [H] });
  ok(html.includes("Isolate: edge protection"), "ticked control renders");
  ok(!html.includes("Eliminate: do it at ground level"), "un-ticked control does NOT render");
  ok((html.match(/<li><b>L\d/g) || []).length === 1, "exactly one control line");
}

// 2. A selected module with NO ticked controls → 'cannot proceed' (not blank, not all) — audit #2.
{
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": [] }, answers: {} };
  const html = composeWhsPack({ ...base, pack, modules: [H] });
  ok(/cannot proceed/.test(html), "no controls ticked → cannot proceed warning");
  ok(!html.includes("Eliminate: do it at ground level"), "still renders no full list");
}

// 3. selected_controls uses TEXT identity, so a reorder can't remap a tick — audit #6.
{
  const reordered = mod("H-01", 1, ["Isolate: edge protection", "PPE: harness", "Eliminate: do it at ground level"], H.content_json.ppeRules);
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["Isolate: edge protection"] }, answers: {} };
  const html = composeWhsPack({ ...base, pack, modules: [reordered] });
  ok(html.includes("Isolate: edge protection") && (html.match(/<li><b>L\d/g) || []).length === 1, "tick follows the control text after reorder");
}

// 4. A selected code missing from the register forces DRAFT + a MISSING banner — audit #5.
{
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01", "H-99"], selected_task: [], selected_controls: { "H-01": ["Isolate: edge protection"] }, answers: {} };
  const html = composeWhsPack({ ...base, pack, modules: [H] });
  ok(html.includes("DRAFT — NOT FOR SITE USE"), "missing module forces DRAFT");
  ok(html.includes("MISSING MODULE(S): H-99"), "missing module named");
}

// 5. An un-reviewed module forces the DRAFT watermark even when review_status is 'issued'.
{
  const draftMod = { ...H, review_status: "draft" };
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["Isolate: edge protection"] }, answers: {} };
  const html = composeWhsPack({ ...base, pack, modules: [draftMod] });
  ok(html.includes("DRAFT — NOT FOR SITE USE"), "unreviewed module → DRAFT watermark");
}

// 6. Site-condition toggles ADD the PPE item even when no module contributed it — audit #7.
{
  const noHatMod = mod("T-01", 2, ["Use a guard"], [{ item: "P2 respirator", flag: "R" }]);
  const pack = { version: 1, review_status: "issued", selected_hrcw: [], selected_task: ["T-01"], selected_controls: { "T-01": ["Use a guard"] }, answers: { craneOnSite: true, plantOnSite: true } };
  const html = composeWhsPack({ ...base, pack, modules: [noHatMod] });
  ok(/Hard hat<\/td><td[^>]*>mandatory \(crane on site\)/.test(html), "crane → hard hat seeded when no module has it");
  ok(/Hi-vis vest<\/td><td[^>]*>mandatory \(plant on site\)/.test(html), "plant → hi-vis seeded when no module has it");
}

// 7. A clean issued+reviewed pack has NO draft watermark.
{
  const pack = { version: 2, review_status: "issued", selected_hrcw: ["H-01"], selected_task: ["T-01"], selected_controls: { "H-01": ["Isolate: edge protection"], "T-01": ["Use a guard"] }, answers: {} };
  const html = composeWhsPack({ ...base, pack, modules: [H, T] });
  ok(!html.includes("DRAFT — NOT FOR SITE USE"), "clean issued pack has no DRAFT watermark");
  ok(html.includes("PART 1") && html.includes("PART 2") && html.includes("PART 3"), "all three parts present");
  ok(html.includes("v2"), "version rendered");
}

// 8. HTML-escaping of module content (no XSS via content_json).
{
  const evil = mod("H-01", 1, ["<script>alert(1)</script>"], []);
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["<script>alert(1)</script>"] }, answers: {} };
  const html = composeWhsPack({ ...base, pack, modules: [evil] });
  ok(!html.includes("<script>alert(1)</script>"), "control text is escaped");
  ok(html.includes("&lt;script&gt;"), "escaped form present");
}

// 9. A compound / unknown PPE flag never silently resolves to n/a — audit-follow-up (register cleanup).
{
  const cm = mod("H-01", 1, ["Isolate: edge protection"], [
    { item: "hard hat", flag: "C → R", condition: "mandatory when a crane is on site" },
    { item: "gloves", flag: "R / N/A", condition: "not at rotating blades" },
    { item: "boots", flag: "bogus", condition: "" },
  ]);
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["Isolate: edge protection"] }, answers: {} };
  const html = composeWhsPack({ ...base, pack, modules: [cm] });
  ok(!/hard hat<\/td><td[^>]*>n\/a/.test(html), "compound flag 'C → R' does not resolve to n/a");
  ok(!/gloves<\/td><td[^>]*>n\/a/.test(html), "compound flag 'R / N/A' does not resolve to n/a");
  ok(!/boots<\/td><td[^>]*>n\/a/.test(html), "unknown flag 'bogus' does not resolve to n/a (→ conditional)");
}

// 10. Stray markdown in control text is stripped, not rendered literally.
{
  const cm = mod("H-01", 1, ["**Edge protection** installed *(guardrail)*"], []);
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["**Edge protection** installed *(guardrail)*"] }, answers: {} };
  const html = composeWhsPack({ ...base, pack, modules: [cm] });
  ok(!html.includes("**"), "literal ** stripped from rendered control text");
  ok(html.includes("Edge protection installed (guardrail)"), "words preserved after markdown strip");
}

// 11. Site Card renders as the lead block, with kill risks from selected HRCW + the emergency block.
{
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["Isolate: edge protection"] }, answers: { hospital: "Flinders Medical Centre", musterPoint: "Front verge", stopWind: "32", stopHeat: "38" } };
  const html = composeWhsPack({ ...base, company: { name: "BLB", abn: "1", phone: "0434 046 399" }, pack, modules: [H] });
  const card = html.indexOf("TODAY ON THIS SITE");
  ok(card >= 0, "Site Card present");
  ok(card < html.indexOf("PART 1"), "Site Card is the lead block, before Part 1");
  ok(html.includes("WHAT WILL KILL YOU HERE") && html.includes("Flinders Medical Centre"), "kill-risks + emergency block populate");
  ok(html.includes("32 km/h") && html.includes("38 °C"), "stop-work limits render from answers");
}

// 12. Hierarchy bar + G-2 justification render in the module block.
{
  const ppeMod = mod("H-01", 1, ["Admin: exclusion sign", "PPE: harness worn"], []); // top control = L2 here → set levels via selection
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["PPE: harness worn"] }, answers: { justifications: { "H-01": "elimination not practicable on this cut-in" } } };
  const html = composeWhsPack({ ...base, pack, modules: [ppeMod] });
  ok((html.match(/width:16px;height:8px/g) || []).length >= 6, "hierarchy bar (6 segments) renders in the module block");
  ok(html.includes("Why this is acceptable:") && html.includes("elimination not practicable"), "G-2 justification renders when present");
}

// 13. Tag block: composed address, review-due, and the state word (issued+in-date vs overdue).
{
  const future = "2099-01-01", pastD = "2000-01-01";
  const base2 = { job: { reference: "J1", projectType: "full" }, company: { name: "BLB", abn: "1", phone: "0400" } };
  const mk = (rd) => ({ version: 3, review_status: "issued", review_due_at: rd, reviewed_by: "J. Reviewer", approved_at: "2026-07-30",
    selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["Isolate: edge protection"] },
    answers: { addressStreet: "25 Mariner Ave", addressSuburb: "Newton", addressPostcode: "5074" } });
  const inDate = composeWhsPack({ ...base2, pack: mk(future), modules: [H] });
  const overdue = composeWhsPack({ ...base2, pack: mk(pastD), modules: [H] });
  ok(inDate.includes("25 Mariner Ave, Newton, 5074"), "tag block shows composed street/suburb/postcode");
  ok(inDate.includes("J. Reviewer") && inDate.includes("Review due"), "tag block shows reviewer + review-due");
  ok(inDate.includes("ISSUED — IN DATE"), "in-date issued pack → ISSUED state word");
  ok(overdue.includes("REVIEW OVERDUE — NOT FOR SITE USE"), "past review-due → REVIEW OVERDUE state word (G-9)");
}

// 14. Fall-arrest rescue block + site conditions render only when relevant.
{
  const pack = { version: 1, review_status: "issued", selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["Isolate: edge protection"] },
    answers: { fallArrestInUse: true, rescuer: "Lead hand", rescueMethod: "EWP", groundClearance: "4.2 m calc vs 6 m",
      conditions: { overheadServices: { y: true, detail: "11kV on frontage, 3.5m clearance" }, tightBoundary: { y: false } } } };
  const html = composeWhsPack({ ...base, pack, modules: [H] });
  ok(html.includes("Fall-arrest rescue plan") && html.includes("Ground-clearance"), "fall-arrest rescue block renders when arrest in use");
  ok(html.includes("Site-specific conditions") && html.includes("11kV on frontage"), "site-conditions block renders the Yes detail");
  const noArrest = composeWhsPack({ ...base, pack: { ...pack, answers: {} }, modules: [H] });
  ok(!noArrest.includes("Fall-arrest rescue plan"), "no fall-arrest → rescue block hidden");
}

// 15. Review-due is date-only + local: a pack due TODAY is still in-date, due YESTERDAY is overdue.
{
  const todayLocal = new Date().toLocaleDateString("en-CA");
  const y = new Date(Date.now() - 864e5).toLocaleDateString("en-CA");
  const mk = (due) => ({ version: 1, review_status: "issued", review_due_at: due, selected_hrcw: ["H-01"], selected_task: [], selected_controls: { "H-01": ["Isolate: edge protection"] }, answers: {} });
  const dueToday = composeWhsPack({ ...base, pack: mk(todayLocal), modules: [H] });
  const dueYesterday = composeWhsPack({ ...base, pack: mk(y), modules: [H] });
  ok(!dueToday.includes("REVIEW OVERDUE"), "pack due today is NOT overdue (local date, not UTC-midnight)");
  ok(dueYesterday.includes("REVIEW OVERDUE"), "pack due yesterday IS overdue");
}

console.log(`whs-pack-compose: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
