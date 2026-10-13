// =============================================================================
// READ-ONLY check that the plans already uploaded to the live Hub can be used by takeoff.
//   node scripts/takeoff/probe-live-plans.mjs [--sample N]
// Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env. SELECTs and storage downloads ONLY (bytes are
// held in memory, never written). Prints counts, sizes and page counts — never titles, paths or addresses.
// Checks per current plan: object downloads, is a PDF, pdf.js opens it, page count, within the 40 MB
// in-app render limit, and which job spine it belongs to (carpentry / project / charge-up).
// =============================================================================
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

config();
const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(2); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const N = Number(process.argv[process.argv.indexOf("--sample") + 1]) || 8;
const PLAN_TYPES = ["architectural", "engineering", "structural", "survey", "specification", "plan"];
const LIMIT = 40 * 1024 * 1024;

const { data: rows, error } = await sb.from("job_documents")
  .select("id, document_type, status, storage_provider, storage_path, job_id, carpentry_job_id, charge_up_job_id, uploaded_at")
  .in("document_type", PLAN_TYPES).eq("status", "current").order("uploaded_at", { ascending: false }).limit(500);
if (error) { console.error("query failed:", error.message); process.exit(1); }
const spine = (r) => (r.carpentry_job_id ? "carpentry" : r.charge_up_job_id ? "charge-up" : r.job_id ? "project" : "none");
const by = (f) => rows.reduce((m, r) => ((m[f(r)] = (m[f(r)] || 0) + 1), m), {});
console.log(`current plan documents: ${rows.length}`);
console.log("by job spine:", JSON.stringify(by(spine)));
console.log("by type:", JSON.stringify(by((r) => r.document_type)));
console.log("by storage provider:", JSON.stringify(by((r) => r.storage_provider)));

const sample = rows.filter((r) => r.storage_provider === "supabase").slice(0, N);
let ok = 0;
const results = [];
for (const r of sample) { // sequential on purpose
  const [bucket, ...rest] = String(r.storage_path || "").split("/");
  const res = { spine: spine(r), type: r.document_type };
  try {
    const { data: blob, error: e } = await sb.storage.from(bucket).download(rest.join("/"));
    if (e || !blob) throw new Error(`download failed${e?.message ? `: ${e.message}` : ""}`);
    const buf = new Uint8Array(await blob.arrayBuffer());
    res.mb = +(buf.length / 1048576).toFixed(1);
    res.pdfHeader = String.fromCharCode(...buf.slice(0, 5)) === "%PDF-";
    res.withinRenderLimit = buf.length <= LIMIT;
    const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false, verbosity: 0 }).promise;
    res.pages = doc.numPages;
    const p1 = await doc.getPage(1);
    const vb = p1.view; res.page1 = `${Math.round(vb[2] - vb[0])}×${Math.round(vb[3] - vb[1])}pt rot${p1.rotate}`;
    await doc.destroy();
    res.usable = res.pdfHeader && res.withinRenderLimit && res.pages > 0;
    if (res.usable) ok++;
  } catch (e) { res.error = e.message; res.usable = false; }
  results.push(res);
}
console.log(`\nsampled ${sample.length} most recent Supabase-stored current plans:`);
for (const r of results) console.log(" ", JSON.stringify(r));
console.log(`\nusable by takeoff: ${ok}/${sample.length}`);
