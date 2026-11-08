/**
 * register-room-prompts.test.mjs — R04 Slice 5 (guided rooms) unit regression.
 *
 * partitionRoomPrompts() must: lead a room with its highest-value prompts; de-duplicate SCOPE/LAYOUT so a
 * room-specific prompt supersedes the generic shared-room (R-) one; keep detail prompts out of the primary
 * set; and NEVER drop a prompt (everything not primary is still present as "Explore more"). Pure, no DB/API.
 *
 * Run: node scripts/tests/register-room-prompts.test.mjs
 */
import { promptsFor, partitionRoomPrompts } from "../../src/lib/register.js";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n      ${d}` : ""}`); } };
const qsFor = (roomType, roomScope = "renovated") => promptsFor("room", { roomType, roomScope, projectType: "renovation", stage: "C", showDetail: false });
const partition = (roomType, roomScope) => { const qs = qsFor(roomType, roomScope); const p = partitionRoomPrompts(qs); return { qs, prim: qs.filter((q) => p.has(q.id)), more: qs.filter((q) => !p.has(q.id)), ids: (s) => s.map((q) => q.id) }; };

// ── Kitchen ──────────────────────────────────────────────────────────────────────────────────────
{
  const k = partition("kitchen");
  const prim = new Set(k.ids(k.prim));
  ok("kitchen: room-specific scope K-001 is primary", prim.has("K-001"));
  ok("kitchen: generic scope R-003 is SUPERSEDED (not primary)", !prim.has("R-003"));
  ok("kitchen: generic layout R-004 is superseded by K-002", !prim.has("R-004") && prim.has("K-002"));
  ok("kitchen: headline finishes/fixtures are primary (benchtop, sink, cooking)", prim.has("K-005") && prim.has("K-007") && prim.has("K-009"));
  ok("kitchen: detail prompts are NOT primary (deferred to Explore more)", k.qs.filter((q) => q.detail).every((q) => !prim.has(q.id)));
  ok("kitchen: primary is a focused subset (fewer than all shown)", k.prim.length > 0 && k.prim.length < k.qs.length);
  ok("kitchen: NOTHING dropped — primary ∪ more === all prompts", k.prim.length + k.more.length === k.qs.length);
  ok("kitchen: the superseded R-003/R-004 still exist under Explore more", k.ids(k.more).includes("R-003") && k.ids(k.more).includes("R-004"));
}

// ── Bathroom ─────────────────────────────────────────────────────────────────────────────────────
{
  const b = partition("bathroom");
  const prim = new Set(b.ids(b.prim));
  ok("bathroom: B-001 scope primary; generic R-003 superseded", prim.has("B-001") && !prim.has("R-003"));
  ok("bathroom: shower/tapware/tiles are primary", prim.has("B-006") && prim.has("B-008") && prim.has("B-009"));
  ok("bathroom: nothing dropped", b.prim.length + b.more.length === b.qs.length);
}

// ── Bedroom (D family) and Living (V family) ──────────────────────────────────────────────────────
{
  const v = partition("bedroom");    // bedroom / robe / study → D- family
  const prim = new Set(v.ids(v.prim));
  ok("bedroom: room-specific scope D-001 primary; generic R-003 superseded", prim.has("D-001") && !prim.has("R-003"));
  ok("bedroom: nothing dropped", v.prim.length + v.more.length === v.qs.length);
  const liv = partition("living");   // living / dining / family → V- family
  const lp = new Set(liv.ids(liv.prim));
  ok("living: room-specific scope V-001 primary; generic R-003 superseded", lp.has("V-001") && !lp.has("R-003"));
  ok("living: nothing dropped", liv.prim.length + liv.more.length === liv.qs.length);
}

// ── Generic room (no room-specific family) keeps the shared R- prompts as primary ────────────────
{
  const g = partition("generic");
  const prim = new Set(g.ids(g.prim));
  ok("generic room: shared scope R-003 IS primary (no room-specific to supersede it)", prim.has("R-003"));
  ok("generic room: has a non-empty primary set", g.prim.length > 0);
  ok("generic room: nothing dropped", g.prim.length + g.more.length === g.qs.length);
}

// ── Inheritance preserved: a retained room still produces prompts and loses nothing ───────────────
{
  const r = partition("kitchen", "renovated");
  ok("retained/renovated kitchen: still has primary prompts and drops nothing", r.prim.length > 0 && r.prim.length + r.more.length === r.qs.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
