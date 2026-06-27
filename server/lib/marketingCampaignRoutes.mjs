// marketingCampaignRoutes.mjs — Campaign templates + Weekly Planner (Run A / Batch 2).
//
//   GET  /api/marketing/templates                 — list seeded campaign templates
//   POST /api/marketing/campaigns/from-template    — instantiate a campaign + slots from a template
//   GET  /api/marketing/planner?week=YYYY-MM-DD     — week view: slots + gaps + active campaigns
//
// Mounts under the blanket /api/marketing admin gate (dev-api.mjs). Standards: apiResponse + camelCase.

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";

function sb() {
  return getServiceSupabase();
}

const VALID_CAMPAIGN_GOALS = ["brand_awareness", "generate_enquiries", "educate", "build_authority", "seo"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function weekWindow(base) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(d);
  start.setDate(d.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { weekStart: ymd(start), weekEnd: ymd(end) };
}

// Build empty schedule slots from a template skeleton pattern across [startYmd, endYmd].
function buildSlotsFromPattern(campaignId, startYmd, endYmd, pattern) {
  const start = new Date(`${startYmd}T12:00:00`);
  const end = new Date(`${endYmd}T12:00:00`);
  const slots = [];
  const cur = new Date(start);
  while (cur <= end) {
    const dayLabel = DOW[cur.getDay()];
    for (const p of pattern.filter((x) => x.day === dayLabel)) {
      slots.push({
        campaign_id: campaignId,
        slot_date: ymd(cur),
        day_of_week: dayLabel,
        channel: p.channel || null,
        content_mode: p.content_mode || null,
        status: "empty",
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return slots;
}

export function registerMarketingCampaignRoutes(app) {
  // ─── List campaign templates ──────────────────────────────────────────────
  app.get("/api/marketing/templates", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");
    const { data, error } = await db
      .from("marketing_campaign_templates")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { templates: rowsToCamel(data || []) });
  });

  // ─── Instantiate a campaign (+ slots) from a template ─────────────────────
  app.post("/api/marketing/campaigns/from-template", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");

    const { templateKey, name, startAt, endAt, createWeeklyPlan } = req.body || {};
    if (!templateKey) return err(res, 400, "templateKey is required");

    const { data: tpl, error: tplErr } = await db
      .from("marketing_campaign_templates")
      .select("*")
      .eq("template_key", templateKey)
      .maybeSingle();
    if (tplErr) return err(res, 500, translateDbError(tplErr));
    if (!tpl) return err(res, 404, "Campaign template not found");

    // Default a 4-week run starting today (templates carry a 4-week skeleton).
    const start = startAt || ymd(new Date());
    const end =
      endAt ||
      (() => {
        const e = new Date(`${start}T12:00:00`);
        e.setDate(e.getDate() + 27);
        return ymd(e);
      })();

    const goal = VALID_CAMPAIGN_GOALS.includes(tpl.goal) ? tpl.goal : null;

    const { data: campaign, error: campErr } = await db
      .from("marketing_campaigns")
      .insert({
        name: name || tpl.name,
        objective: tpl.description || tpl.name,
        goal,
        channels: tpl.default_channels || [],
        audience: tpl.default_audience || [],
        content_mix: tpl.content_mix || {},
        ai_rules: tpl.ai_rules || {},
        approval_mode: tpl.approval_mode || "manual_all",
        weekly_target_posts: tpl.weekly_target_posts || 3,
        template_key: tpl.template_key,
        status: "active",
        start_at: start,
        end_at: end,
        tags: [],
        created_by: req.caller?.id || null,
      })
      .select()
      .single();
    if (campErr) return err(res, 400, translateDbError(campErr));

    // Generate empty slots from the template skeleton.
    let slotsCreated = 0;
    const pattern = Array.isArray(tpl.slot_skeleton?.pattern) ? tpl.slot_skeleton.pattern : [];
    if (pattern.length) {
      const slots = buildSlotsFromPattern(campaign.id, start, end, pattern);
      if (slots.length) {
        const { data: inserted, error: slotErr } = await db
          .from("campaign_schedule_slots")
          .insert(slots)
          .select("id");
        if (slotErr) return err(res, 500, translateDbError(slotErr));
        slotsCreated = inserted?.length || 0;
      }
    }

    // Optionally record a weekly plan for the campaign's first week.
    if (createWeeklyPlan) {
      const { weekStart } = weekWindow(new Date(`${start}T12:00:00`));
      await db.from("marketing_weekly_plans").insert({
        week_start: weekStart,
        campaign_id: campaign.id,
        target_count: tpl.weekly_target_posts || 3,
        created_by: req.caller?.id || null,
      });
    }

    return ok(res, { campaign: rowToCamel(campaign), slotsCreated });
  });

  // ─── Weekly Planner — slots + gaps for a week, across active campaigns ─────
  app.get("/api/marketing/planner", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");

    const base = req.query.week ? new Date(`${req.query.week}T12:00:00`) : new Date();
    if (Number.isNaN(base.getTime())) return err(res, 400, "Invalid week date");
    const { weekStart, weekEnd } = weekWindow(base);

    const [{ data: slots, error: slotErr }, { data: campaigns, error: campErr }] = await Promise.all([
      db
        .from("campaign_schedule_slots")
        .select("*, marketing_campaigns(name, template_key)")
        .gte("slot_date", weekStart)
        .lte("slot_date", weekEnd)
        .order("slot_date", { ascending: true }),
      db
        .from("marketing_campaigns")
        .select("id, name, template_key, status, weekly_target_posts")
        .eq("status", "active")
        .order("created_at", { ascending: false }),
    ]);
    if (slotErr) return err(res, 500, translateDbError(slotErr));
    if (campErr) return err(res, 500, translateDbError(campErr));

    const slotRows = (slots || []).map((s) => {
      const camp = s.marketing_campaigns || {};
      const { marketing_campaigns: _drop, ...rest } = s;
      return { ...rowToCamel(rest), campaignName: camp.name || null, templateKey: camp.template_key || null };
    });

    const emptyCount = slotRows.filter((s) => s.status === "empty").length;

    return ok(res, {
      weekStart,
      weekEnd,
      slots: slotRows,
      emptyCount,
      campaigns: rowsToCamel(campaigns || []),
    });
  });
}
