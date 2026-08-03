// Proves the three-state control model in WhsPackTab: Suggested (template-proposed) → Confirmed (the
// assertion) → Not used. The safety invariants: a suggestion never satisfies G-1, never reaches the
// confirmed assertion (selected_controls), and a supervisor tap is the only thing that confirms.
// Pure model of the client logic (toggleCtrl / payload / G-1 / render-state / prefill) — no React.

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.error("  ✗", n); } };

// --- register: two modules with control options (text = identity) ---
const REG = {
  "H-01": ["guardrail installed", "travel restraint", "1.5m exclusion"],
  "T-04": ["RCD in use", "guards fitted"],
};
const STANDARD = { "H-01": ["guardrail installed"], "T-04": ["RCD in use", "guards fitted"] }; // house template

// --- the component's control model ---
function mk({ confirmed = {}, suggested = {} } = {}) {
  const st = {
    controls: Object.fromEntries(Object.entries(confirmed).map(([k, v]) => [k, new Set(v)])),
    suggested: Object.fromEntries(Object.entries(suggested).map(([k, v]) => [k, new Set(v)])),
  };
  // toggleCtrl: a tap confirms a suggested/unused control, or un-confirms a confirmed one; any tap resolves the suggestion.
  st.tap = (code, key) => {
    const c = new Set(st.controls[code] || []); c.has(key) ? c.delete(key) : c.add(key); st.controls[code] = c;
    if (st.suggested[code]?.has(key)) { const s = new Set(st.suggested[code]); s.delete(key); st.suggested[code] = s; }
  };
  // render state for a control
  st.state = (code, key) => (st.controls[code]?.has(key) ? "confirmed" : st.suggested[code]?.has(key) ? "suggested" : "unused");
  // prefill standard as suggestions for the given IN-SCOPE modules (skip confirmed) — never touches others
  st.prefill = (codes, tpl = STANDARD) => {
    for (const code of codes) { const texts = tpl[code]; if (!texts) continue;
      const conf = st.controls[code] || new Set(); const s = new Set(st.suggested[code] || []);
      for (const t of texts) if (!conf.has(t)) s.add(t); st.suggested[code] = s; }
  };
  // payload split — this is what persists
  st.payload = () => ({
    selected_controls: Object.fromEntries(Object.entries(st.controls).map(([k, v]) => [k, [...v]]).filter(([, v]) => v.length)),
    suggestedControls: Object.fromEntries(Object.entries(st.suggested).map(([k, v]) => [k, [...v]]).filter(([, v]) => v.length)),
  });
  // G-1: a selected module with options but ZERO confirmed controls is blocked (suggestions don't count)
  st.blockedByG1 = (code) => { const opts = REG[code] || []; if (!opts.length) return false;
    const conf = st.controls[code] || new Set(); return opts.filter((t) => conf.has(t)).length === 0; };
  return st;
}

// ── 1. A pure suggestion does NOT satisfy G-1 (the core rule) ──────────────────────────────────
{
  const s = mk({ suggested: { "H-01": ["guardrail installed"] } });
  ok(s.state("H-01", "guardrail installed") === "suggested", "template pre-fill renders as SUGGESTED, not confirmed");
  ok(s.blockedByG1("H-01") === true, "a module with only a SUGGESTED control is still G-1-blocked (0 confirmed)");
  ok(!(s.payload().selected_controls["H-01"] || []).includes("guardrail installed"), "a suggestion is NOT in selected_controls (the confirmed assertion)");
  ok(s.payload().suggestedControls["H-01"].includes("guardrail installed"), "the suggestion persists separately in answers.suggestedControls");
}

// ── 2. The supervisor's tap is what confirms — and it resolves the suggestion ──────────────────
{
  const s = mk({ suggested: { "H-01": ["guardrail installed"] } });
  s.tap("H-01", "guardrail installed");
  ok(s.state("H-01", "guardrail installed") === "confirmed", "tapping a suggested control CONFIRMS it");
  ok(s.blockedByG1("H-01") === false, "now G-1 is satisfied (a human confirmed a control)");
  ok(s.payload().selected_controls["H-01"].includes("guardrail installed"), "confirmed control IS in selected_controls (composes)");
  ok(!(s.payload().suggestedControls["H-01"] || []).includes("guardrail installed"), "and it's removed from suggestions (resolved)");
}

// ── 3. Un-confirming lands on NOT USED, never back to suggested ────────────────────────────────
{
  const s = mk({ suggested: { "H-01": ["guardrail installed"] } });
  s.tap("H-01", "guardrail installed"); // confirm
  s.tap("H-01", "guardrail installed"); // un-confirm
  ok(s.state("H-01", "guardrail installed") === "unused", "un-confirming a resolved suggestion → not used (considered, not selected)");
  ok(s.blockedByG1("H-01") === true, "and G-1 blocks again — nothing confirmed");
}

// ── 4. prefill only touches the modules passed (in-scope) + skips already-confirmed ────────────
{
  const s = mk({ confirmed: { "H-01": ["travel restraint"] } });
  s.prefill(["H-01"]);                      // only H-01 in scope; T-04 must be untouched
  ok(s.state("H-01", "guardrail installed") === "suggested", "prefill adds the standard as a suggestion");
  ok(s.state("H-01", "travel restraint") === "confirmed", "prefill does not disturb an already-confirmed control");
  ok(!s.suggested["T-04"], "prefill NEVER touches an out-of-scope module (T-04 not passed)");
}

// ── 5. Template save uses CONFIRMED only (never suggestions) ───────────────────────────────────
{
  const s = mk({ confirmed: { "H-01": ["guardrail installed"] }, suggested: { "H-01": ["travel restraint"], "T-04": ["RCD in use"] } });
  const toStandard = s.payload().selected_controls; // what "Save confirmed as standard" would send
  ok(JSON.stringify(toStandard) === JSON.stringify({ "H-01": ["guardrail installed"] }), "the house standard is built from CONFIRMED controls only, never suggestions");
}

// ── 6. A confirmed control never also renders as suggested (confirmed wins) ────────────────────
{
  const s = mk({ confirmed: { "H-01": ["guardrail installed"] }, suggested: { "H-01": ["guardrail installed"] } });
  ok(s.state("H-01", "guardrail installed") === "confirmed", "if a text is somehow in both sets, it renders CONFIRMED (never a phantom suggestion)");
}

console.log(`whs-control-states: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
