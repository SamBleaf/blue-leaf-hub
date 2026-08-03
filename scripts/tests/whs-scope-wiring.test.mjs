// Faithful simulation of WhsPackTab's §1→§2 reactive algorithm (curated seed + grow-only delta effect
// + apply/reset), run against the REAL deriveModulesFromScope, to prove the behaviour the browser shows.
// Mirrors the post-review code: prevDerived is grow-only (a module leaving then re-entering scope is not
// "new"), and freshness keys on whether the pack was ever saved (curated), not on selection size.
import { deriveModulesFromScope } from "../../src/lib/carpentryScope.js";

const isPart1 = (c) => c.startsWith("H-");          // matches WhsPackTab isPart1 for these codes
const byCode = (c) => /^[HT]-\d\d$/.test(c);         // all 28 register codes exist

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.error("  ✗", n); } };
const S = (arr) => [...arr].sort().join(",");

// A tiny model of the component's selection state + the effect.
// saved = the pack has been persisted at least once (payload() always writes answers.jScope → curated).
function mk(loadedScope, savedHrcw = [], savedTask = [], saved = false) {
  const st = { hrcw: new Set(savedHrcw), task: new Set(savedTask), prev: null };
  const curated = saved || savedHrcw.length || savedTask.length;
  st.prev = curated ? new Set(deriveModulesFromScope(loadedScope)) : new Set();   // load() seed
  st.effect = (jScope, issued = false) => {                                        // the useEffect body
    if (issued) return;
    const derived = new Set(deriveModulesFromScope(jScope));
    const added = [...derived].filter((c) => byCode(c) && !st.prev.has(c));
    for (const c of derived) st.prev.add(c);                                       // grow-only
    for (const c of added) (isPart1(c) ? st.hrcw : st.task).add(c);
  };
  st.applyScope = (jScope) => { const d = new Set(deriveModulesFromScope(jScope)); for (const c of d) if (byCode(c)) (isPart1(c) ? st.hrcw : st.task).add(c); st.prev = new Set(d); };
  st.resetScope = (jScope) => { const d = new Set(deriveModulesFromScope(jScope)); st.hrcw = new Set(); st.task = new Set(); for (const c of d) if (byCode(c)) (isPart1(c) ? st.hrcw : st.task).add(c); st.prev = new Set(d); };
  st.sel = () => new Set([...st.hrcw, ...st.task]);
  return st;
}
const FULL_NO = { j2Heights: "no", j3Openings: "no", j4Loadbearing: "no", j5Pre2004: "no", j6Silica: "no", j7Road: "no", j8Excavation: "no", j_plant: "no", j_services: "no" };

// ── Scenario 1: fresh pack — always-modules on load, stages + gate drive §2 live ──────────────
{
  const s = mk({ j1Stages: [] }, [], [], false);
  s.effect({ j1Stages: [] });                                  // load-time effect
  ok(s.sel().has("T-10") && s.sel().has("T-14"), "fresh: always-modules T-10/T-14 auto-tick on load");
  ok(!s.sel().has("H-01"), "fresh: no fall HRCW before stages/heights");
  s.effect({ j1Stages: ["first_fix"] });                       // user picks a stage
  ok(s.task.has("T-02") && s.task.has("T-04"), "fresh: first_fix auto-ticks its task modules");
  ok(!s.hrcw.has("H-01"), "fresh: H-01 still gated (no >2m yet)");
  s.effect({ j1Stages: ["first_fix"], j2Heights: "yes" });     // answer >2m
  ok(s.hrcw.has("H-01") && s.hrcw.has("H-02"), "fresh: j2Heights=yes → H-01/H-02 tick (the reported bug, fixed)");
}

// ── Scenario 2: manual untick survives an unrelated §1 change ──────────────────────────────────
{
  const s = mk({ j1Stages: [] }, [], [], false);
  s.effect({ j1Stages: ["first_fix"], j2Heights: "yes" });
  ok(s.hrcw.has("H-01"), "auto-added H-01");
  s.hrcw.delete("H-01");
  s.effect({ j1Stages: ["first_fix"], j2Heights: "yes", j7Road: "no" });
  ok(!s.hrcw.has("H-01"), "unrelated §1 change does NOT re-add a manually-unticked module");
}

// ── Scenario 3: existing curated pack — opening it re-adds nothing the supervisor removed ──────
{
  const scope = { j1Stages: ["first_fix"], j2Heights: "yes", ...FULL_NO };
  const derived = deriveModulesFromScope(scope);
  const savedHrcw = derived.filter((c) => isPart1(c) && c !== "H-01"); // supervisor had removed H-01
  const savedTask = derived.filter((c) => !isPart1(c));
  const s = mk(scope, savedHrcw, savedTask, true);
  s.effect(scope);
  ok(!s.hrcw.has("H-01"), "existing pack: removed H-01 is NOT re-added on open");
  ok(S(s.sel()) === S([...savedHrcw, ...savedTask]), "existing pack: selection unchanged on open");
}

// ── Scenario 4: toggling a gate off leaves the module (non-destructive) + is surfaced ─────────
{
  const s = mk({ j1Stages: [] }, [], [], false);
  s.effect({ j1Stages: ["first_fix"], j2Heights: "yes" });
  ok(s.hrcw.has("H-01"), "H-01 on with >2m");
  s.effect({ j1Stages: ["first_fix"], j2Heights: "no" });
  ok(s.hrcw.has("H-01"), "non-destructive: H-01 stays when >2m→no (surfaced as 'beyond section 1')");
  ok(!new Set(deriveModulesFromScope({ j1Stages: ["first_fix"], j2Heights: "no" })).has("H-01"), "and H-01 shows as selectedBeyondScope");
}

// ── Scenario 5: reset/apply seed prev so the effect doesn't immediately undo them ──────────────
{
  const s = mk({ j1Stages: [] }, [], [], false);
  const scope = { j1Stages: ["first_fix"], j2Heights: "yes" };
  s.hrcw.add("H-07");
  s.resetScope(scope);
  ok(!s.hrcw.has("H-07"), "reset: drops the manual extra H-07");
  ok(s.hrcw.has("H-01"), "reset: selection == exactly derived");
  s.effect(scope);
  ok(!s.hrcw.has("H-07") && s.hrcw.has("H-01"), "reset: next effect adds nothing (prev seeded) — no flicker");
}

// ── Scenario 6: issued pack is immutable ──────────────────────────────────────────────────────
{
  const s = mk({ j1Stages: ["cladding"] }, ["H-05"], ["T-04"], true);
  const before = S(s.sel());
  s.effect({ j1Stages: ["cladding"], j2Heights: "yes" }, true);
  ok(S(s.sel()) === before, "issued pack: effect makes no changes");
}

// ── Scenario 7 (FIX #3): a pack curated down to ZERO modules is respected on reopen ────────────
{
  // supervisor answered §1, then unticked everything, then Saved → saved pack, empty selection.
  const scope = { j1Stages: ["first_fix"], j2Heights: "yes", ...FULL_NO };
  const s = mk(scope, [], [], true);           // saved=true (answers.jScope present) but selection empty
  s.effect(scope);                             // reopen effect
  ok(s.sel().size === 0, "emptied-then-saved pack: reopening does NOT re-add the scope modules");
}

// ── Scenario 8 (FIX #2): hand-untick survives a gate toggled OFF then back ON ──────────────────
{
  const s = mk({ j1Stages: [] }, [], [], false);
  s.effect({ j1Stages: ["first_fix"], j2Heights: "yes" });
  s.hrcw.delete("H-01");                                        // hand-untick
  s.effect({ j1Stages: ["first_fix"], j2Heights: "no" });      // gate off
  s.effect({ j1Stages: ["first_fix"], j2Heights: "yes" });     // gate back on
  ok(!s.hrcw.has("H-01"), "gate toggled off→on does NOT re-add a hand-unticked module (grow-only prev)");
}

console.log(`whs-scope-wiring: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
