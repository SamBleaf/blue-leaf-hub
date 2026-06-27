#!/usr/bin/env node
/**
 * Unit smoke test for test artifact folder name classification (no Dropbox).
 */
import { classifyTestArtifactName } from "./lib/testArtifactPrefixes.mjs";

const FIXTURES = [
  {
    name: "BLH TEST W11 PO 1782384723491 D8UA02, ADELAIDE SA 5000",
    category: "safe-canonical",
  },
  {
    name: "DEBUG2 ST ADELAIDE SA 5000",
    category: "legacy-review-only",
  },
  {
    name: "BATCHA RFQS PROGRESS 1782384469975",
    category: "legacy-review-only",
  },
  {
    name: "1782384426261 TEST STREET, ADELAIDE SA 5000",
    category: "legacy-review-only",
  },
  {
    name: "NORMAL CLIENT PROJECT ADELAIDE SA 5000",
    category: "skipped",
  },
];

let failed = 0;

console.log("\n── test:cleanup-matchers ──\n");

for (const { name, category: expected } of FIXTURES) {
  const { category, reason } = classifyTestArtifactName(name);
  const ok = category === expected;
  const mark = ok ? "✓" : "✗";
  console.log(`${mark} ${name}`);
  console.log(`    expected: ${expected}`);
  console.log(`    got:      ${category}${reason ? ` (${reason})` : ""}`);
  if (!ok) failed += 1;
}

console.log(`\n── Result: ${FIXTURES.length - failed} pass, ${failed} fail ──\n`);
process.exit(failed ? 1 : 0);
