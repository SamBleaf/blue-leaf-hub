import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { pullBuildexactEstimate } from "./buildexactDeepIntegration.mjs";
import { matchTradeCategoryRow, resolveBuildxactJobId } from "./costIntelligenceEstimate.mjs";
import { buildexactConfigured } from "./buildexactClient.mjs";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getTradeCategories(sb) {
  const { data, error } = await sb
    .from("trade_categories")
    .select("id, name, sort_order, category_type, is_active")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data || [];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedBudgetFromCategories(sb, jobId, categoriesWithAmounts, source) {
  const tradeCategories = await getTradeCategories(sb);
  let seeded_count = 0;
  const unmatched = [];

  for (const { name, amount } of categoriesWithAmounts) {
    const match = matchTradeCategoryRow(name, tradeCategories);
    if (!match) {
      unmatched.push(name);
      continue;
    }

    const { data: existing } = await sb
      .from("job_budgets")
      .select("id, original_budget")
      .eq("job_id", jobId)
      .eq("trade_category_id", match.id)
      .maybeSingle();

    const upsertRow = {
      job_id: jobId,
      trade_category_id: match.id,
      budget_amount: amount,
      forecast_amount: amount,
      seeded_from: source,
      seeded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!existing || existing.original_budget == null) {
      upsertRow.original_budget = amount;
    }

    const { error } = await sb
      .from("job_budgets")
      .upsert(upsertRow, { onConflict: "job_id,trade_category_id" });
    if (error) throw error;
    seeded_count++;
  }

  return { seeded_count, unmatched };
}

// ── Phase C — Budget ───────────────────────────────────────────────────────────

async function seedBudget(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;
    const buildexactJobId = await resolveBuildxactJobId(sb, jobId);

    if (!buildexactConfigured() || !buildexactJobId) {
      return res.status(400).json({ ok: false, error: "Buildxact not configured or job has no buildexact_job_id" });
    }

    const result = await pullBuildexactEstimate(buildexactJobId);
    const categories = result?.estimate?.categories || [];
    const items = categories.map((cat) => ({
      name: cat.name,
      amount: cat.subtotal_ex_gst || 0,
    }));

    const { seeded_count, unmatched } = await seedBudgetFromCategories(sb, jobId, items, "buildxact");
    return res.json({ ok: true, seeded_count, unmatched, source: "buildxact" });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function importBudgetCsv(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;
    const { csv } = req.body || {};
    if (!csv) return res.status(400).json({ ok: false, error: "csv is required" });

    const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
    const items = [];
    for (const line of lines) {
      const comma = line.indexOf(",");
      if (comma === -1) continue;
      const name = line.slice(0, comma).trim();
      const amount = parseFloat(line.slice(comma + 1).trim()) || 0;
      if (name) items.push({ name, amount });
    }

    const { seeded_count, unmatched } = await seedBudgetFromCategories(sb, jobId, items, "csv");
    return res.json({ ok: true, seeded_count, unmatched });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function updateBudgetLine(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { id: jobId, cat_id } = req.params;
    const { budget_amount, forecast_amount, forecast_notes, reason } = req.body || {};

    if (!reason) return res.status(400).json({ ok: false, error: "reason is required" });

    const { data: existing, error: fetchErr } = await sb
      .from("job_budgets")
      .select("*")
      .eq("job_id", jobId)
      .eq("trade_category_id", cat_id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ ok: false, error: "Budget line not found" });

    const changedBy = req.caller?.id || null;
    const historyRows = [];
    const now = new Date().toISOString();

    if (budget_amount !== undefined && budget_amount !== existing.budget_amount) {
      historyRows.push({
        job_budget_id: existing.id,
        changed_by: changedBy,
        field_changed: "budget_amount",
        previous_value: String(existing.budget_amount),
        new_value: String(budget_amount),
        reason,
        changed_at: now,
      });
    }
    if (forecast_amount !== undefined && forecast_amount !== existing.forecast_amount) {
      historyRows.push({
        job_budget_id: existing.id,
        changed_by: changedBy,
        field_changed: "forecast_amount",
        previous_value: String(existing.forecast_amount),
        new_value: String(forecast_amount),
        reason,
        changed_at: now,
      });
    }

    if (historyRows.length > 0) {
      const { error: histErr } = await sb.from("job_budget_history").insert(historyRows);
      if (histErr) throw histErr;
    }

    const updates = { updated_at: now };
    if (budget_amount !== undefined) updates.budget_amount = budget_amount;
    if (forecast_amount !== undefined) updates.forecast_amount = forecast_amount;
    if (forecast_notes !== undefined) updates.forecast_notes = forecast_notes;

    const { data: updated, error: updErr } = await sb
      .from("job_budgets")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single();
    if (updErr) throw updErr;

    return res.json({ ok: true, budget: updated });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function getBudget(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;

    const { data: budgets, error } = await sb
      .from("job_budgets")
      .select("*, trade_categories(name, sort_order, category_type)")
      .eq("job_id", jobId)
      .order("trade_categories(sort_order)");
    if (error) throw error;

    // Fetch actual costs per trade from financial_documents
    const { data: docs } = await sb
      .from("financial_documents")
      .select("trade_category_id, amount_ex_gst, approved_amount, status")
      .eq("job_id", jobId)
      .in("status", ["approved", "filed", "xero_synced"]);

    const actualByCat = {};
    for (const d of docs || []) {
      if (!d.trade_category_id) continue;
      actualByCat[d.trade_category_id] =
        (actualByCat[d.trade_category_id] || 0) + (d.approved_amount ?? d.amount_ex_gst ?? 0);
    }

    const rows = (budgets || []).map((b) => ({
      ...b,
      trade_category_name: b.trade_categories?.name || null,
      actual_cost: actualByCat[b.trade_category_id] || 0,
    }));

    const total_budget = rows.reduce((s, r) => s + (r.budget_amount || 0), 0);
    const total_actual = rows.reduce((s, r) => s + r.actual_cost, 0);
    const total_forecast = rows.reduce((s, r) => s + (r.forecast_amount || r.budget_amount || 0), 0);

    return res.json({ ok: true, budgets: rows, summary: { total_budget, total_actual, total_forecast } });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function getBudgetHistory(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;

    const { data: budgets, error: bErr } = await sb
      .from("job_budgets")
      .select("id")
      .eq("job_id", jobId);
    if (bErr) throw bErr;

    const budgetIds = (budgets || []).map((b) => b.id);
    if (budgetIds.length === 0) return res.json({ ok: true, history: [] });

    const { data: history, error: hErr } = await sb
      .from("job_budget_history")
      .select("*")
      .in("job_budget_id", budgetIds)
      .order("changed_at", { ascending: false });
    if (hErr) throw hErr;

    return res.json({ ok: true, history: history || [] });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

// ── Phase D — Progress Claims ──────────────────────────────────────────────────

async function getClaims(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;
    const { data, error } = await sb
      .from("progress_claims")
      .select("*, progress_claim_payments(payment_amount, payment_date, payment_reference, payment_method)")
      .eq("job_id", jobId)
      .order("claim_number", { ascending: true });
    if (error) throw error;
    return res.json({ ok: true, claims: data || [] });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function createClaim(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;
    const { stage, description, amount_ex_gst, claim_reference, issued_date, due_date } = req.body || {};

    const { data: maxRow } = await sb
      .from("progress_claims")
      .select("claim_number")
      .eq("job_id", jobId)
      .order("claim_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const claim_number = (maxRow?.claim_number || 0) + 1;

    const { data, error } = await sb
      .from("progress_claims")
      .insert({
        job_id: jobId,
        claim_number,
        claim_reference,
        stage,
        description,
        amount_ex_gst,
        issued_date,
        due_date,
        status: "draft",
        created_by: req.caller?.id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json({ ok: true, claim: data });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function updateClaim(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { id: jobId, cid } = req.params;

    const { data: existing, error: fetchErr } = await sb
      .from("progress_claims")
      .select("id, status, job_id")
      .eq("id", cid)
      .eq("job_id", jobId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ ok: false, error: "Claim not found" });
    if (existing.status !== "draft") return res.status(400).json({ ok: false, error: "Can only edit draft claims" });

    const { stage, description, amount_ex_gst, claim_reference, issued_date, due_date } = req.body || {};
    const updates = { updated_at: new Date().toISOString() };
    if (stage !== undefined) updates.stage = stage;
    if (description !== undefined) updates.description = description;
    if (amount_ex_gst !== undefined) updates.amount_ex_gst = amount_ex_gst;
    if (claim_reference !== undefined) updates.claim_reference = claim_reference;
    if (issued_date !== undefined) updates.issued_date = issued_date;
    if (due_date !== undefined) updates.due_date = due_date;

    const { data, error } = await sb
      .from("progress_claims")
      .update(updates)
      .eq("id", cid)
      .select()
      .single();
    if (error) throw error;
    return res.json({ ok: true, claim: data });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function sendClaim(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { id: jobId, cid } = req.params;

    const { data: existing, error: fetchErr } = await sb
      .from("progress_claims")
      .select("id, status, issued_date, job_id")
      .eq("id", cid)
      .eq("job_id", jobId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ ok: false, error: "Claim not found" });

    const issuedDate = existing.issued_date || today();
    const dueDate = addDays(issuedDate, 14);

    const { data, error } = await sb
      .from("progress_claims")
      .update({
        status: "issued",
        issued_date: issuedDate,
        due_date: dueDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cid)
      .select()
      .single();
    if (error) throw error;

    return res.json({ ok: true, claim: data, note: "email not yet implemented" });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function payClaim(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { id: jobId, cid } = req.params;
    const { payment_amount, payment_date, payment_reference, payment_method } = req.body || {};

    const { data: claim, error: fetchErr } = await sb
      .from("progress_claims")
      .select("id, amount_inc_gst, job_id")
      .eq("id", cid)
      .eq("job_id", jobId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!claim) return res.status(404).json({ ok: false, error: "Claim not found" });

    const { error: payErr } = await sb.from("progress_claim_payments").insert({
      progress_claim_id: cid,
      payment_amount,
      payment_date,
      payment_reference,
      payment_method,
      recorded_by: req.caller?.id || null,
      created_at: new Date().toISOString(),
    });
    if (payErr) throw payErr;

    const { data: payments, error: paymentsErr } = await sb
      .from("progress_claim_payments")
      .select("payment_amount")
      .eq("progress_claim_id", cid);
    if (paymentsErr) throw paymentsErr;

    const totalPaid = (payments || []).reduce((s, p) => s + (p.payment_amount || 0), 0);
    const newStatus = totalPaid >= (claim.amount_inc_gst || 0) ? "paid" : "partially_paid";

    const { data: updated, error: updErr } = await sb
      .from("progress_claims")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", cid)
      .select("*, progress_claim_payments(payment_amount, payment_date, payment_reference, payment_method)")
      .single();
    if (updErr) throw updErr;

    return res.json({ ok: true, claim: updated });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function voidClaim(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { id: jobId, cid } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: fetchErr } = await sb
      .from("progress_claims")
      .select("id, job_id")
      .eq("id", cid)
      .eq("job_id", jobId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ ok: false, error: "Claim not found" });

    const { data, error } = await sb
      .from("progress_claims")
      .update({ status: "void", description: reason ? `VOID: ${reason}` : undefined, updated_at: new Date().toISOString() })
      .eq("id", cid)
      .select()
      .single();
    if (error) throw error;
    return res.json({ ok: true, claim: data });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

// ── Phase E — Variations ───────────────────────────────────────────────────────

async function getVariations(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { data, error } = await sb
      .from("job_variations")
      .select("*")
      .eq("job_id", req.params.id)
      .order("variation_number", { ascending: true });
    if (error) throw error;
    return res.json({ ok: true, variations: data || [] });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function createVariation(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;
    const { title, description, trade_category_id, cost_to_builder, amount_ex_gst, line_items, eot_days } = req.body || {};

    const { data: maxRow } = await sb
      .from("job_variations")
      .select("variation_number")
      .eq("job_id", jobId)
      .order("variation_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const variation_number = (maxRow?.variation_number || 0) + 1;

    const { data, error } = await sb
      .from("job_variations")
      .insert({
        job_id: jobId,
        variation_number,
        title,
        description,
        trade_category_id,
        cost_to_builder,
        amount_ex_gst,
        line_items,
        eot_days,
        status: "draft",
        created_by: req.caller?.id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json({ ok: true, variation: data });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function getVariationRecipes(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;

    if (!buildexactConfigured()) {
      return res.json({ ok: true, recipes: [], note: "Buildxact not configured" });
    }

    const buildexactJobId = await resolveBuildxactJobId(sb, jobId);
    if (!buildexactJobId) {
      return res.json({ ok: true, recipes: [], note: "Buildxact not configured" });
    }

    const result = await pullBuildexactEstimate(buildexactJobId);
    const categories = result?.estimate?.categories || [];
    const recipes = [];

    for (const cat of categories) {
      const activeItems = cat.active_items || [];
      for (const item of activeItems) {
        recipes.push({
          buildxact_category: cat.name,
          description: item.description || item.name || "",
          unit_cost: item.unit_cost ?? item.rate ?? null,
          uom: item.uom || item.unit || null,
          units: item.quantity ?? item.units ?? null,
          total: item.total ?? item.subtotal_ex_gst ?? null,
        });
      }
    }

    return res.json({ ok: true, recipes });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function updateVariation(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { id: jobId, vid } = req.params;

    const { data: existing, error: fetchErr } = await sb
      .from("job_variations")
      .select("id, status, job_id")
      .eq("id", vid)
      .eq("job_id", jobId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ ok: false, error: "Variation not found" });
    if (existing.status !== "draft") return res.status(400).json({ ok: false, error: "Can only edit draft variations" });

    const { title, description, trade_category_id, cost_to_builder, amount_ex_gst, line_items, eot_days } = req.body || {};
    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (trade_category_id !== undefined) updates.trade_category_id = trade_category_id;
    if (cost_to_builder !== undefined) updates.cost_to_builder = cost_to_builder;
    if (amount_ex_gst !== undefined) updates.amount_ex_gst = amount_ex_gst;
    if (line_items !== undefined) updates.line_items = line_items;
    if (eot_days !== undefined) updates.eot_days = eot_days;

    const { data, error } = await sb
      .from("job_variations")
      .update(updates)
      .eq("id", vid)
      .select()
      .single();
    if (error) throw error;
    return res.json({ ok: true, variation: data });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function sendVariation(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { id: jobId, vid } = req.params;

    const { data: existing, error: fetchErr } = await sb
      .from("job_variations")
      .select("id, job_id")
      .eq("id", vid)
      .eq("job_id", jobId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ ok: false, error: "Variation not found" });

    const { data, error } = await sb
      .from("job_variations")
      .update({ status: "sent_to_client", sent_date: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", vid)
      .select()
      .single();
    if (error) throw error;
    return res.json({ ok: true, variation: data, note: "email not yet implemented" });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function signVariation(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { id: jobId, vid } = req.params;

    const { data: existing, error: fetchErr } = await sb
      .from("job_variations")
      .select("id, job_id")
      .eq("id", vid)
      .eq("job_id", jobId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ ok: false, error: "Variation not found" });

    const { data, error } = await sb
      .from("job_variations")
      .update({ status: "signed", signed_date: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", vid)
      .select()
      .single();
    if (error) throw error;

    // Signal that WIPAA review is needed (DB trigger updates contract_value)
    await sb
      .from("jobs")
      .update({ last_wipaa_review_date: null })
      .eq("id", jobId);

    return res.json({ ok: true, variation: data });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function rejectVariation(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { id: jobId, vid } = req.params;
    const { rejection_reason } = req.body || {};

    const { data: existing, error: fetchErr } = await sb
      .from("job_variations")
      .select("id, job_id")
      .eq("id", vid)
      .eq("job_id", jobId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ ok: false, error: "Variation not found" });

    const { data, error } = await sb
      .from("job_variations")
      .update({ status: "rejected", rejection_reason, updated_at: new Date().toISOString() })
      .eq("id", vid)
      .select()
      .single();
    if (error) throw error;
    return res.json({ ok: true, variation: data });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

// ── Phase F — WIPAA ────────────────────────────────────────────────────────────

async function computeWipaa(sb, jobId) {
  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("id, contract_value, original_contract_value, forecast_total_cost, last_wipaa_review_date, target_margin_pct, floor_margin_pct")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!job) throw new Error("Job not found");

  const { data: docs } = await sb
    .from("financial_documents")
    .select("approved_amount, amount_ex_gst, status")
    .eq("job_id", jobId)
    .in("status", ["approved", "filed", "xero_synced"]);

  const cost_to_date = (docs || []).reduce(
    (s, d) => s + (d.approved_amount ?? d.amount_ex_gst ?? 0),
    0
  );

  const { data: claims } = await sb
    .from("progress_claims")
    .select("amount_ex_gst, status")
    .eq("job_id", jobId)
    .not("status", "in", '("draft","void")');

  const progress_billed = (claims || []).reduce((s, c) => s + (c.amount_ex_gst || 0), 0);

  const { data: payments } = await sb
    .from("progress_claim_payments")
    .select("payment_amount, progress_claims!inner(job_id)")
    .eq("progress_claims.job_id", jobId);

  const claims_paid = (payments || []).reduce((s, p) => s + (p.payment_amount || 0), 0);

  const contract_value = job.contract_value || 0;
  const forecast_total_cost = job.forecast_total_cost || 0;

  const pct_complete = forecast_total_cost > 0 ? cost_to_date / forecast_total_cost : 0;
  const earned_revenue = pct_complete * contract_value;
  const wipaa_value = earned_revenue - progress_billed;
  const working_margin_pct = contract_value > 0
    ? ((contract_value - cost_to_date) / contract_value) * 100
    : null;
  const forecast_margin_pct = contract_value > 0 && forecast_total_cost > 0
    ? ((contract_value - forecast_total_cost) / contract_value) * 100
    : null;

  let days_since_wipaa_review = null;
  if (job.last_wipaa_review_date) {
    const diffMs = new Date() - new Date(job.last_wipaa_review_date);
    days_since_wipaa_review = Math.floor(diffMs / 86400000);
  }

  return {
    contract_value,
    original_contract_value: job.original_contract_value || null,
    cost_to_date,
    progress_billed,
    claims_paid,
    forecast_total_cost,
    pct_complete,
    earned_revenue,
    wipaa_value,
    working_margin_pct,
    forecast_margin_pct,
    days_since_wipaa_review,
    last_wipaa_review_date: job.last_wipaa_review_date,
    target_margin_pct: job.target_margin_pct,
    floor_margin_pct: job.floor_margin_pct,
  };
}

async function getWipaaCurrent(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const wipaa = await computeWipaa(sb, req.params.id);
    return res.json({ ok: true, ...wipaa });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function postWipaaReview(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;
    const { notes, forecast_total_cost } = req.body || {};

    if (forecast_total_cost != null) {
      const { error } = await sb
        .from("jobs")
        .update({ forecast_total_cost, updated_at: new Date().toISOString() })
        .eq("id", jobId);
      if (error) throw error;
    }

    await sb
      .from("jobs")
      .update({ last_wipaa_review_date: today(), updated_at: new Date().toISOString() })
      .eq("id", jobId);

    const wipaa = await computeWipaa(sb, jobId);

    const { data: review, error: revErr } = await sb
      .from("wipaa_reviews")
      .insert({
        job_id: jobId,
        review_date: today(),
        reviewed_by: req.caller?.id || null,
        contract_value: wipaa.contract_value,
        original_estimate: wipaa.original_contract_value,
        forecast_total_cost: wipaa.forecast_total_cost,
        cost_to_date: wipaa.cost_to_date,
        progress_billed: wipaa.progress_billed,
        pct_complete: wipaa.pct_complete,
        wipaa_value: wipaa.wipaa_value,
        projected_margin_pct: wipaa.forecast_margin_pct,
        notes,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (revErr) throw revErr;

    return res.json({ ok: true, review });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function getWipaaHistory(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const { data, error } = await sb
      .from("wipaa_reviews")
      .select("*")
      .eq("job_id", req.params.id)
      .order("review_date", { ascending: false });
    if (error) throw error;
    return res.json({ ok: true, history: data || [] });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

async function updateWipaaForecast(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;
    const { forecast_total_cost } = req.body || {};
    if (forecast_total_cost == null) return res.status(400).json({ ok: false, error: "forecast_total_cost is required" });

    const { data, error } = await sb
      .from("jobs")
      .update({ forecast_total_cost, updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .select("id, contract_value, original_contract_value, forecast_total_cost, last_wipaa_review_date, target_margin_pct, floor_margin_pct")
      .single();
    if (error) throw error;
    return res.json({ ok: true, job: data });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

// ── Phase G — Command Centre ───────────────────────────────────────────────────

async function getCommandCentre(req, res) {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
  try {
    const jobId = req.params.id;

    const [
      { data: job, error: jobErr },
      { data: budgets, error: budgetErr },
      { data: allClaims, error: claimsErr },
      { data: variations, error: varErr },
      { data: pendingApprovals, error: pendErr },
      { data: docs, error: docsErr },
    ] = await Promise.all([
      sb.from("jobs")
        .select("id, address, arch_ref, status, contract_value, original_contract_value, target_margin_pct, floor_margin_pct, forecast_total_cost, last_wipaa_review_date")
        .eq("id", jobId)
        .maybeSingle(),
      sb.from("job_budgets")
        .select("*, trade_categories(name, sort_order)")
        .eq("job_id", jobId),
      sb.from("progress_claims")
        .select("*, progress_claim_payments(payment_amount)")
        .eq("job_id", jobId)
        .order("claim_number", { ascending: false }),
      sb.from("job_variations")
        .select("*")
        .eq("job_id", jobId)
        .order("variation_number", { ascending: true }),
      sb.from("financial_documents")
        .select("id, trade_category_id, amount_ex_gst, approved_amount, status, description")
        .eq("job_id", jobId)
        .eq("status", "pending_approval")
        .limit(5),
      sb.from("financial_documents")
        .select("trade_category_id, amount_ex_gst, approved_amount, status")
        .eq("job_id", jobId)
        .in("status", ["approved", "filed", "xero_synced"]),
    ]);

    if (jobErr) throw jobErr;
    if (budgetErr) throw budgetErr;
    if (claimsErr) throw claimsErr;
    if (varErr) throw varErr;
    if (pendErr) throw pendErr;
    if (docsErr) throw docsErr;

    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });

    // Actual costs from financial_documents
    const actual_costs = (docs || []).reduce((s, d) => s + (d.approved_amount ?? d.amount_ex_gst ?? 0), 0);

    // Actual costs per trade category for budget vs actual
    const actualByCat = {};
    for (const d of docs || []) {
      if (!d.trade_category_id) continue;
      actualByCat[d.trade_category_id] =
        (actualByCat[d.trade_category_id] || 0) + (d.approved_amount ?? d.amount_ex_gst ?? 0);
    }

    const budget_vs_actual = (budgets || []).map((b) => ({
      ...b,
      trade_category_name: b.trade_categories?.name || null,
      actual_cost: actualByCat[b.trade_category_id] || 0,
    }));

    // Claims KPIs
    const issuedClaims = (allClaims || []).filter(
      (c) => !["draft", "void"].includes(c.status)
    );
    const claims_issued = issuedClaims.reduce((s, c) => s + (c.amount_ex_gst || 0), 0);

    const claims_paid = (allClaims || []).reduce((s, c) => {
      const paidForClaim = (c.progress_claim_payments || []).reduce(
        (ps, p) => ps + (p.payment_amount || 0),
        0
      );
      return s + paidForClaim;
    }, 0);

    // Variations summary
    const signed_total = (variations || [])
      .filter((v) => v.status === "signed")
      .reduce((s, v) => s + (v.amount_ex_gst || 0), 0);
    const sent_total = (variations || [])
      .filter((v) => v.status === "sent_to_client")
      .reduce((s, v) => s + (v.amount_ex_gst || 0), 0);
    const draft_count = (variations || []).filter((v) => v.status === "draft").length;

    // WIPAA
    const contract_value = job.contract_value || 0;
    const forecast_total_cost = job.forecast_total_cost || 0;
    const pct_complete = forecast_total_cost > 0 ? actual_costs / forecast_total_cost : 0;
    const earned_revenue = pct_complete * contract_value;
    const wipaa_value = earned_revenue - claims_issued;
    const working_margin_pct = contract_value > 0
      ? ((contract_value - actual_costs) / contract_value) * 100
      : null;
    const forecast_margin_pct = contract_value > 0 && forecast_total_cost > 0
      ? ((contract_value - forecast_total_cost) / contract_value) * 100
      : null;

    let days_since_wipaa_review = null;
    if (job.last_wipaa_review_date) {
      const diffMs = new Date() - new Date(job.last_wipaa_review_date);
      days_since_wipaa_review = Math.floor(diffMs / 86400000);
    }

    return res.json({
      ok: true,
      job,
      kpis: {
        contract_value,
        claims_issued,
        claims_paid,
        actual_costs,
        working_margin_pct,
        forecast_margin_pct,
      },
      budget_vs_actual,
      pending_approvals: pendingApprovals || [],
      variations: {
        signed_total,
        sent_total,
        draft_count,
        items: variations || [],
      },
      claims: (allClaims || []).slice(0, 5),
      wipaa: {
        contract_value,
        forecast_total_cost,
        cost_to_date: actual_costs,
        progress_billed: claims_issued,
        pct_complete,
        earned_revenue,
        wipaa_value,
        working_margin_pct,
        forecast_margin_pct,
      },
      days_since_wipaa_review,
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || String(e) });
  }
}

// ── Registration ───────────────────────────────────────────────────────────────

export function registerJobFinanceRoutes(app) {
  // Phase C — Budget
  app.post("/api/finance/jobs/:id/budget/seed", requireAuth, seedBudget);
  app.post("/api/finance/jobs/:id/budget/import", requireAuth, importBudgetCsv);
  app.get("/api/finance/jobs/:id/budget/history", requireAuth, getBudgetHistory);
  app.get("/api/finance/jobs/:id/budget", requireAuth, getBudget);
  app.put("/api/finance/jobs/:id/budget/:cat_id", requireAuth, updateBudgetLine);

  // Phase D — Progress Claims
  app.get("/api/finance/jobs/:id/claims", requireAuth, getClaims);
  app.post("/api/finance/jobs/:id/claims", requireAuth, createClaim);
  app.put("/api/finance/jobs/:id/claims/:cid", requireAuth, updateClaim);
  app.post("/api/finance/jobs/:id/claims/:cid/send", requireAuth, sendClaim);
  app.post("/api/finance/jobs/:id/claims/:cid/pay", requireAuth, payClaim);
  app.post("/api/finance/jobs/:id/claims/:cid/void", requireAuth, voidClaim);
  // Claim schedule stub — used by ProgressClaims UI for APB stage timeline
  app.get("/api/finance/jobs/:id/claims/schedule", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
    const stages = ["deposit","slab","frame","lock_up","fixing","practical_completion"];
    const { data } = await sb.from("progress_claims").select("stage,status,amount_ex_gst").eq("job_id", req.params.id);
    const byStage = Object.fromEntries(stages.map(s => [s, null]));
    for (const c of data || []) if (c.stage && byStage[c.stage] === null) byStage[c.stage] = c;
    res.json({ ok: true, schedule: byStage });
  });

  // Phase E — Variations
  app.get("/api/finance/jobs/:id/variations/recipes", requireAuth, getVariationRecipes);
  app.get("/api/finance/jobs/:id/variations", requireAuth, getVariations);
  app.post("/api/finance/jobs/:id/variations", requireAuth, createVariation);
  app.put("/api/finance/jobs/:id/variations/:vid", requireAuth, updateVariation);
  app.post("/api/finance/jobs/:id/variations/:vid/send", requireAuth, sendVariation);
  app.post("/api/finance/jobs/:id/variations/:vid/sign", requireAuth, signVariation);
  app.post("/api/finance/jobs/:id/variations/:vid/reject", requireAuth, rejectVariation);
  app.post("/api/finance/jobs/:id/variations/:vid/void", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
    try {
      const { data, error } = await sb.from("job_variations").update({ status: "void", updated_at: new Date().toISOString() })
        .eq("id", req.params.vid).eq("job_id", req.params.id).select("*").single();
      if (error) throw error;
      res.json({ ok: true, variation: data });
    } catch (e) { res.status(502).json({ ok: false, error: e?.message || String(e) }); }
  });

  // Phase F — WIPAA
  app.get("/api/finance/jobs/:id/wipaa/current", requireAuth, getWipaaCurrent);
  app.post("/api/finance/jobs/:id/wipaa/review", requireAuth, postWipaaReview);
  app.get("/api/finance/jobs/:id/wipaa/history", requireAuth, getWipaaHistory);
  app.put("/api/finance/jobs/:id/wipaa/forecast", requireAuth, updateWipaaForecast);

  // Phase G — Command Centre
  app.get("/api/finance/jobs/:id/command-centre", requireAuth, getCommandCentre);
}
