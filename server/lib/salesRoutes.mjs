import { getServiceSupabase } from "./supabaseService.mjs";

export function registerSalesRoutes(app) {

  app.get("/api/sales/leads", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data, error } = await sb
      .from("leads")
      .select("*")
      .eq("archived", false)
      .order("last_activity_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, leads: data || [] });
  });

  app.get("/api/sales/leads/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data: lead, error } = await sb
      .from("leads")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error) return res.status(404).json({ ok: false, error: error.message });
    const { data: activities } = await sb
      .from("lead_activities")
      .select("*")
      .eq("lead_id", req.params.id)
      .order("created_at", { ascending: false });
    res.json({ ok: true, lead, activities: activities || [] });
  });

  app.post("/api/sales/leads", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const now = new Date().toISOString();
    const insert = { ...req.body, created_at: now, updated_at: now, stage: req.body.stage || "enquiry", stage_entered_at: now, last_activity_at: now };
    const { data, error } = await sb.from("leads").insert(insert).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    await sb.from("lead_activities").insert({ lead_id: data.id, activity_type: "note", summary: "Lead created" });
    res.json({ ok: true, lead: data });
  });

  app.patch("/api/sales/leads/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    const { data: current } = await sb.from("leads").select("stage").eq("id", req.params.id).single();
    if (updates.stage && current?.stage && updates.stage !== current.stage) {
      updates.stage_entered_at = new Date().toISOString();
      updates.last_activity_at = new Date().toISOString();
      await sb.from("lead_activities").insert({
        lead_id: req.params.id,
        activity_type: "stage_change",
        summary: `Moved from ${current.stage} to ${updates.stage}`
      });
    }
    const { data, error } = await sb.from("leads").update(updates).eq("id", req.params.id).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, lead: data });
  });

  app.post("/api/sales/leads/:id/activities", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { activity_type, summary, detail, next_action, next_action_date } = req.body;
    if (!summary) return res.status(400).json({ ok: false, error: "summary required" });
    const { data, error } = await sb.from("lead_activities").insert({
      lead_id: req.params.id, activity_type: activity_type || "note", summary, detail: detail || null, next_action: next_action || null, next_action_date: next_action_date || null
    }).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    const upd = { last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (next_action) upd.next_action = next_action;
    if (next_action_date) upd.next_action_date = next_action_date;
    await sb.from("leads").update(upd).eq("id", req.params.id);
    res.json({ ok: true, activity: data });
  });

  app.delete("/api/sales/leads/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { error } = await sb.from("leads").update({ archived: true, updated_at: new Date().toISOString() }).eq("id", req.params.id);
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });
}
