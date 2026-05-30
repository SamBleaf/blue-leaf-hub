import { getServiceSupabase } from "./supabaseService.mjs";
import { normaliseAddress } from "./addressNormalise.mjs";

/**
 * Given a freeform address string, find the best matching job in the database.
 * Returns { job_id, address } or null if no confident match.
 *
 * Strategy: exact match first, then case-insensitive, then first-word / suburb token match.
 */
export async function resolveJobIdByAddress(rawAddress) {
  if (!rawAddress || typeof rawAddress !== "string") return null;
  const addr = rawAddress.trim();
  if (!addr) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;

  // Canonical normalised match first ("21 Folkestone Rd" == "21 Folkestone Road").
  const norm = normaliseAddress(addr).normalised;
  if (norm) {
    const { data: nm } = await sb
      .from("jobs").select("id, address").eq("address_normalised", norm).limit(1);
    if (nm?.[0]) return { job_id: nm[0].id, address: nm[0].address };
  }

  // Exact match
  let { data } = await sb
    .from("jobs")
    .select("id, address")
    .ilike("address", addr)
    .limit(1);
  if (data?.[0]) return { job_id: data[0].id, address: data[0].address };

  // Partial match: address starts with the first significant token (number + street)
  const firstPart = addr.split(/[,/]/)[0].trim();
  if (firstPart.length >= 5) {
    ({ data } = await sb
      .from("jobs")
      .select("id, address")
      .ilike("address", `${firstPart}%`)
      .limit(1));
    if (data?.[0]) return { job_id: data[0].id, address: data[0].address };
  }

  return null;
}

/**
 * Upsert a row in job_knowledge.
 * kind: 'estimate' | 'quote' | 'fee_proposal' | 'job_fields'
 */
export async function upsertJobKnowledge({ job_id, address, kind, content, data, source_id }) {
  if (!job_id) return;
  const sb = getServiceSupabase();
  if (!sb) return;
  await sb.from("job_knowledge").upsert(
    { job_id, address, kind, content, data, source_id, updated_at: new Date().toISOString() },
    { onConflict: "job_id,kind,source_id", ignoreDuplicates: false }
  );
}
