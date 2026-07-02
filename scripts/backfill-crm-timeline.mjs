#!/usr/bin/env node
/**
 * Batch 1B — one-time idempotent backfill.
 *
 *   node scripts/backfill-crm-timeline.mjs           # dry-run (reports only)
 *   node scripts/backfill-crm-timeline.mjs --write    # applies changes
 *
 * Two jobs, both safe to re-run:
 *   1. crm_interactions.lead_id — for already-converted contacts, stamp the lead_id
 *      onto interactions that still have none (converts from before Batch 1B wiring).
 *   2. lead_signals — seed from winning-offer context: wo_biggest_concern → 'objection',
 *      wo_most_excited_about → 'priority'. Skips a lead+kind+label that already exists.
 *
 * Reversible: interaction lead_id fills can be nulled again; seeded signals are the only
 * rows with source 'wo_backfill' in detail — deletable by that marker. No rows deleted.
 */
import { serviceClient } from "./batch-a/_helpers.mjs";

const WRITE = process.argv.includes("--write");
const SEED_MARK = "[seeded from winning-offer]";

const sb = serviceClient();
if (!sb) { console.error("SUPABASE_SERVICE_ROLE_KEY not configured"); process.exit(1); }

console.log(`\nBatch 1B backfill — mode: ${WRITE ? "--write (applying)" : "dry-run (no changes)"}\n`);

// ── 1. crm_interactions.lead_id ────────────────────────────────────────────
const { data: converted, error: cErr } = await sb
  .from("crm_contacts")
  .select("id, converted_lead_id")
  .not("converted_lead_id", "is", null);
if (cErr) { console.error("Load converted contacts failed:", cErr.message); process.exit(1); }

let interactionsToFill = 0, interactionsFilled = 0;
for (const c of converted || []) {
  const { data: rows, error } = await sb
    .from("crm_interactions")
    .select("id")
    .eq("contact_id", c.id)
    .is("lead_id", null);
  if (error) { console.error(`  interactions for ${c.id}:`, error.message); continue; }
  if (!rows?.length) continue;
  interactionsToFill += rows.length;
  if (WRITE) {
    const { error: uErr } = await sb
      .from("crm_interactions")
      .update({ lead_id: c.converted_lead_id })
      .eq("contact_id", c.id)
      .is("lead_id", null);
    if (uErr) console.error(`  fill ${c.id}:`, uErr.message);
    else interactionsFilled += rows.length;
  }
}
console.log(`crm_interactions.lead_id: ${interactionsToFill} row(s) need filling${WRITE ? ` — filled ${interactionsFilled}` : ""}`);

// ── 2. lead_signals seed from wo_* ──────────────────────────────────────────
const { data: leads, error: lErr } = await sb
  .from("leads")
  .select("id, wo_biggest_concern, wo_most_excited_about")
  .or("wo_biggest_concern.not.is.null,wo_most_excited_about.not.is.null");
if (lErr) {
  // wo_* columns may not exist on a drifted DB — non-fatal, skip seeding.
  console.log(`lead_signals seed: skipped (${lErr.message})`);
} else {
  let toSeed = 0, seeded = 0;
  for (const l of leads || []) {
    const wants = [];
    if (l.wo_biggest_concern?.trim()) wants.push({ kind: "objection", label: l.wo_biggest_concern.trim().slice(0, 200), detail: SEED_MARK });
    if (l.wo_most_excited_about?.trim()) wants.push({ kind: "priority", label: l.wo_most_excited_about.trim().slice(0, 200), detail: SEED_MARK });
    if (!wants.length) continue;

    const { data: existing } = await sb.from("lead_signals").select("kind,label").eq("lead_id", l.id);
    const have = new Set((existing || []).map(s => `${s.kind}|${s.label}`));
    const fresh = wants.filter(w => !have.has(`${w.kind}|${w.label}`)).map(w => ({ ...w, lead_id: l.id }));
    if (!fresh.length) continue;
    toSeed += fresh.length;
    if (WRITE) {
      const { error: iErr } = await sb.from("lead_signals").insert(fresh);
      if (iErr) console.error(`  seed ${l.id}:`, iErr.message);
      else seeded += fresh.length;
    }
  }
  console.log(`lead_signals: ${toSeed} signal(s) to seed${WRITE ? ` — seeded ${seeded}` : ""}`);
}

console.log(`\nDone.${WRITE ? "" : "  Re-run with --write to apply."}\n`);
process.exit(0);
