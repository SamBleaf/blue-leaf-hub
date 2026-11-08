/**
 * register-portal-race.test.mjs — Tab 25 issue 4 regression (loopback sandbox only).
 *
 * The portal "choose a selection" write now re-asserts visibility, project and non-terminal status IN the
 * UPDATE (not only the prior lookup), so an office withdraw (client_visible→false) or finalise
 * (status→approved/ordered/installed) landing in the race window cannot write a now-hidden or finalised
 * row. This exercises the EXACT guarded supabase-js update (the same filters portalV2Routes applies)
 * against the sandbox gateway and asserts the affected-row count. Run: npm run test:register-portal-race
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const GW = process.env.REGISTER_E2E_GATEWAY || "http://localhost:54321";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(GW)) { console.error("Refusing: loopback sandbox only."); process.exit(2); }
const secrets = JSON.parse(readFileSync(join(homedir(), ".blh-register-sandbox", "secrets.json"), "utf8"));
const svc = createClient(GW, secrets.service_key, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `\n    ${d}` : ""}`); } };

// The exact guard portalV2Routes applies to the selection-choice UPDATE.
async function guardedChoose(selId, projectId, product) {
  const { data, error } = await svc.from("client_selections")
    .update({ selected_product: product, status: "in_review", updated_at: new Date().toISOString() })
    .eq("id", selId).eq("project_id", projectId)
    .not("status", "in", "(approved,ordered,installed)")
    .eq("client_visible", true)
    .select("id");
  if (error) throw error;
  return data || [];
}
const productOf = async (id) => (await svc.from("client_selections").select("selected_product").eq("id", id).single()).data?.selected_product || null;

async function main() {
  const addr = `BLH TEST portal-race ${Date.now()}`;
  const job = (await svc.from("jobs").insert({ address: addr }).select("id").single()).data;
  const proj = (await svc.from("projects").insert({ job_id: job.id, address: addr, is_preconstruction: true }).select("id").single()).data;
  const otherProjId = "00000000-0000-0000-0000-0000000000ff";   // a project id that is not this one
  const mk = async (over) => (await svc.from("client_selections")
    .insert({ project_id: proj.id, category: "Tapware", item_name: "Basin mixer", status: "awaiting_client", client_visible: true, ...over })
    .select("id").single()).data;

  const visible = await mk({});
  ok("visible, non-terminal row → guarded update writes exactly one row", (await guardedChoose(visible.id, proj.id, "Astra Walker")).length === 1);
  ok("…and the chosen product was written", (await productOf(visible.id)) === "Astra Walker");

  const hidden = await mk({ client_visible: false });
  ok("withdrawn (client_visible=false) row → guarded update writes NOTHING", (await guardedChoose(hidden.id, proj.id, "Hijack")).length === 0);
  ok("…and the product was NOT written on the hidden row", (await productOf(hidden.id)) === null);

  const finalised = await mk({ status: "approved" });
  ok("finalised (approved) row → guarded update writes NOTHING", (await guardedChoose(finalised.id, proj.id, "Hijack")).length === 0);

  ok("wrong project id → guarded update writes NOTHING", (await guardedChoose(visible.id, otherProjId, "Hijack")).length === 0);

  // cleanup
  await svc.from("client_selections").delete().eq("project_id", proj.id);
  await svc.from("projects").delete().eq("id", proj.id);
  await svc.from("jobs").delete().eq("id", job.id);

  console.log(`\nregister-portal-race: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
