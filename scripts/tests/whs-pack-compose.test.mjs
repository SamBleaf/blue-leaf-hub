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

console.log(`whs-pack-compose: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
