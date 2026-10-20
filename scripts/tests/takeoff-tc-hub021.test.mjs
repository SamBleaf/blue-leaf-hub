// Hub review HUB 021 — a plan kept on this device is reused only for exactly the same stored version; the store
// stays inside its limits, least recently used first, never dropping the plan being written. Pure rules from
// src/lib/takeoffPlanCache.js (the IndexedDB side is exercised in e2e/ui-review/tc-plan-reuse.spec.js).
import assert from "node:assert/strict";
import { PLAN_CACHE_LIMITS, planCacheHit, planEvictions } from "../../src/lib/takeoffPlanCache.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const MB = 1024 * 1024, DAY = 24 * 3600 * 1000;
const meta = { docId: "d1", sha256: "abc", byteSize: 2 * MB, savedAt: 0, lastUsedAt: 0 };

t("hit only for the same document, the same stored hash and the same size", () => {
  assert.equal(planCacheHit(meta, { id: "d1", contentSha256: "abc", byteSize: 2 * MB }), true);
  assert.equal(planCacheHit(meta, { id: "d1", contentSha256: "abc", byteSize: null }), true, "size unknown on a legacy record");
  assert.equal(planCacheHit(meta, { id: "d1", contentSha256: "abd", byteSize: 2 * MB }), false, "the stored file changed");
  assert.equal(planCacheHit(meta, { id: "d2", contentSha256: "abc", byteSize: 2 * MB }), false, "a new revision is a new document");
  assert.equal(planCacheHit(meta, { id: "d1", contentSha256: null, byteSize: 2 * MB }), false, "no recorded hash → never reused");
  assert.equal(planCacheHit(meta, { id: "d1", contentSha256: "abc", byteSize: 3 * MB }), false);
  assert.equal(planCacheHit(null, { id: "d1", contentSha256: "abc" }), false);
});

t("evictions: least recently used first until the new plan fits; never the plan being written; too big is refused", () => {
  const lim = { maxBytes: 10 * MB, maxEntries: 3, ttlMs: 30 * DAY, now: 40 * DAY };
  const metas = [
    { docId: "a", byteSize: 4 * MB, lastUsedAt: 39 * DAY }, { docId: "b", byteSize: 4 * MB, lastUsedAt: 35 * DAY },
    { docId: "c", byteSize: 1 * MB, lastUsedAt: 38 * DAY },
  ];
  assert.deepEqual(planEvictions(metas, { docId: "n", byteSize: 5 * MB }, lim), { drop: ["b"], fits: true }, "9 MB + 5 MB > 10 MB → the oldest (b) goes");
  assert.deepEqual(planEvictions(metas, { docId: "n", byteSize: 7 * MB }, lim), { drop: ["b", "c", "a"], fits: true }, "oldest first, until it fits");
  assert.deepEqual(planEvictions(metas, { docId: "a", byteSize: 4 * MB }, lim), { drop: [], fits: true }, "rewriting the same plan");
  assert.deepEqual(planEvictions(metas, { docId: "n", byteSize: 11 * MB }, lim), { drop: [], fits: false });
  assert.deepEqual(planEvictions(metas, { docId: "n", byteSize: 1 * MB }, lim).drop, ["b"], "at most 3 plans");
});

t("evictions: plans unused for 30 days go first", () => {
  const now = 100 * DAY;
  const r = planEvictions([{ docId: "old", byteSize: MB, lastUsedAt: now - 31 * DAY }, { docId: "new", byteSize: MB, lastUsedAt: now - DAY }], { docId: "n", byteSize: MB }, { ...PLAN_CACHE_LIMITS, now });
  assert.deepEqual(r.drop, ["old"]);
  assert.equal(PLAN_CACHE_LIMITS.maxBytes, 250 * MB); assert.equal(PLAN_CACHE_LIMITS.maxEntries, 12);
});

console.log(`takeoff-tc-hub021: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
