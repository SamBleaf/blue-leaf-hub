// marketingBatch3Routes.mjs — Batch 3: Intelligence + Attribution read-only endpoints.
//
// GET /api/marketing/intelligence — content pipeline health dashboard
// GET /api/marketing/attribution  — lead source/channel summary
//
// All routes mount under the blanket /api/marketing admin gate in dev-api.mjs.
// Both endpoints are 100% read-only and handle missing tables/columns gracefully
// (migration 122 unapplied = partial data; missing mig 062 tables = empty sections).
// Demo data is returned when DB is unavailable.

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { ok, err, rowsToCamel, translateDbError } from "./apiResponse.mjs";

function sb() {
  return getServiceSupabase();
}

// Safe count query — returns 0 on any error rather than throwing.
async function safeCount(db, table, filter) {
  try {
    let q = db.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    return error ? 0 : count || 0;
  } catch {
    return 0;
  }
}

// ─── Demo fallbacks ────────────────────────────────────────────────────────────

const DEMO_INTELLIGENCE = {
  demo: true,
  pipeline: { drafted: 3, inReview: 1, approved: 2, scheduled: 1, published: 8, total: 15 },
  platformMix: [
    { channel: "instagram", count: 6 },
    { channel: "facebook", count: 5 },
    { channel: "website", count: 2 },
  ],
  mediaStats: { totalAssets: 12, withAnalysis: 9, recentUploads: 3 },
  campaignActivity: { activeCampaigns: 2, templatesAvailable: 7, weeklySlotsFilled: 2 },
  recentPublishes: [
    { id: "demo-p1", channel: "instagram", title: "Slab pour at Stirling", publishedAt: null },
    { id: "demo-p2", channel: "facebook", title: "How we weatherproof before cladding", publishedAt: null },
  ],
  nextActions: [
    "1 package in review — Josh needs to approve or request changes",
    "2 approved items not yet scheduled — open the Calendar",
    "3 drafts in progress — open Content Studio to continue",
  ],
};

const DEMO_ATTRIBUTION = {
  demo: true,
  sourceBreakdown: [
    { source: "instagram", count: 4 },
    { source: "facebook", count: 2 },
    { source: "direct", count: 5 },
    { source: "referral", count: 2 },
    { source: "unknown", count: 3 },
  ],
  recentLeads: [
    { name: "James & Kylie H.", source: "instagram", stage: "qualify", createdAt: null },
    { name: "Tom B.", source: "direct", stage: "enquiry", createdAt: null },
  ],
  unknownSourceCount: 3,
  totalLeads: 16,
  captureGaps: [
    "Add UTM parameters to all Instagram bio links",
    "Set lead_source on every manual enquiry",
    "Connect website enquiry form to attribution capture",
  ],
};

export function registerMarketingBatch3Routes(app) {
  // ─── GET /api/marketing/intelligence ───────────────────────────────────────
  // Content pipeline health dashboard. Read-only. Demo-safe.
  app.get("/api/marketing/intelligence", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return ok(res, DEMO_INTELLIGENCE);

    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      // Pipeline counts
      const [drafted, inReview, approved, published, scheduled] = await Promise.all([
        safeCount(db, "marketing_content_items", (q) => q.eq("status", "draft")),
        safeCount(db, "marketing_content_items", (q) => q.eq("status", "in_review")),
        safeCount(db, "marketing_content_items", (q) => q.eq("status", "approved")),
        safeCount(db, "marketing_content_items", (q) => q.eq("status", "published")),
        safeCount(db, "marketing_content_items", (q) =>
          q.not("scheduled_at", "is", null).not("status", "eq", "published")
        ),
      ]);

      const total = drafted + inReview + approved + published + scheduled;

      // Platform mix — channel distribution of recent non-archived items
      let platformMix = [];
      try {
        const { data: channels } = await db
          .from("marketing_content_items")
          .select("channel")
          .not("status", "eq", "archived");
        const channelMap = {};
        for (const row of channels || []) {
          if (!row.channel) continue;
          channelMap[row.channel] = (channelMap[row.channel] || 0) + 1;
        }
        platformMix = Object.entries(channelMap)
          .map(([channel, count]) => ({ channel, count }))
          .sort((a, b) => b.count - a.count);
      } catch { /* non-fatal */ }

      // Media stats
      const [totalAssets, withAnalysis, recentUploads] = await Promise.all([
        safeCount(db, "marketing_media_assets", null),
        safeCount(db, "marketing_media_assets", (q) =>
          q.not("analysis", "is", null)
        ),
        safeCount(db, "marketing_media_assets", (q) =>
          q.gte("created_at", sevenDaysAgo)
        ),
      ]);

      // Campaign activity
      const [activeCampaigns, templatesAvailable] = await Promise.all([
        safeCount(db, "marketing_campaigns", (q) =>
          q.not("status", "eq", "archived")
        ),
        safeCount(db, "marketing_campaign_templates", null),
      ]);

      // Weekly slots filled (campaign_schedule_slots — migration 122 table)
      let weeklySlotsFilled = 0;
      try {
        const now = new Date();
        const dow = (now.getDay() + 6) % 7;
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - dow);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weeklySlotsFilled = await safeCount(
          db,
          "campaign_schedule_slots",
          (q) =>
            q
              .not("status", "eq", "empty")
              .gte("slot_date", weekStart.toISOString().slice(0, 10))
              .lte("slot_date", weekEnd.toISOString().slice(0, 10))
        );
      } catch { /* migration 122 table may not exist */ }

      // Recent publishes
      let recentPublishes = [];
      try {
        const { data: pubs } = await db
          .from("social_post_publishes")
          .select(
            "id, platform, published_at, marketing_content_items(title, channel)"
          )
          .order("published_at", { ascending: false })
          .limit(5);

        recentPublishes = (pubs || []).map((p) => ({
          id: p.id,
          channel: p.platform || p.marketing_content_items?.channel,
          title: p.marketing_content_items?.title || "Untitled",
          publishedAt: p.published_at,
        }));
      } catch { /* social_post_publishes may need mig 062 */ }

      // Next actions — deterministic from counts
      const nextActions = [];
      if (inReview > 0) nextActions.push(`${inReview} package${inReview !== 1 ? "s" : ""} in review — Josh needs to approve or request changes`);
      if (approved > 0) nextActions.push(`${approved} approved item${approved !== 1 ? "s" : ""} not yet scheduled — open the Calendar`);
      if (drafted > 0) nextActions.push(`${drafted} draft${drafted !== 1 ? "s" : ""} in progress — open Content Studio to continue`);
      if (totalAssets > 0 && withAnalysis < totalAssets) {
        const missing = totalAssets - withAnalysis;
        nextActions.push(`${missing} media asset${missing !== 1 ? "s" : ""} without analysis — open from Media Vault to analyse`);
      }
      if (nextActions.length === 0) nextActions.push("All up to date — create new content from Media Vault or Weekly Planner");

      return ok(res, {
        demo: false,
        pipeline: { drafted, inReview, approved, scheduled, published, total },
        platformMix,
        mediaStats: { totalAssets, withAnalysis, recentUploads },
        campaignActivity: { activeCampaigns, templatesAvailable, weeklySlotsFilled },
        recentPublishes,
        nextActions,
      });
    } catch (e) {
      // On unexpected error, fall back to demo rather than exposing a 500
      console.error("[marketing/intelligence] error, returning demo:", e.message);
      return ok(res, DEMO_INTELLIGENCE);
    }
  });

  // ─── GET /api/marketing/attribution ────────────────────────────────────────
  // Lead source/channel summary. Read-only. No CRM mutation. Demo-safe.
  app.get("/api/marketing/attribution", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return ok(res, DEMO_ATTRIBUTION);

    try {
      const { days = "90" } = req.query;
      const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();

      // Fetch leads with source fields
      const { data: leads, error: leadsErr } = await db
        .from("leads")
        .select("id, name, stage, lead_source, first_touch_source, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false });

      if (leadsErr) {
        return ok(res, { ...DEMO_ATTRIBUTION, error: translateDbError(leadsErr) });
      }

      const allLeads = leads || [];

      // Source breakdown — prefer first_touch_source (mig 062) over lead_source
      const sourceMap = {};
      let unknownSourceCount = 0;
      for (const lead of allLeads) {
        const src = lead.first_touch_source || lead.lead_source || null;
        if (!src) {
          unknownSourceCount++;
          continue;
        }
        sourceMap[src] = (sourceMap[src] || 0) + 1;
      }
      // Add unknown bucket
      if (unknownSourceCount > 0) sourceMap["unknown"] = unknownSourceCount;
      const sourceBreakdown = Object.entries(sourceMap)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      // Recent leads (last 5 with attribution data)
      const recentLeads = allLeads.slice(0, 5).map((l) => ({
        name: l.name || "Unknown",
        source: l.first_touch_source || l.lead_source || "unknown",
        stage: l.stage,
        createdAt: l.created_at,
      }));

      // Optional: attribution journey counts from enquiry_attribution (mig 062)
      let attributedCount = 0;
      try {
        const { count } = await db
          .from("enquiry_attribution")
          .select("*", { count: "exact", head: true })
          .gte("created_at", since);
        attributedCount = count || 0;
      } catch { /* mig 062 tables optional */ }

      // Capture gaps — deterministic recommendations
      const captureGaps = [];
      if (unknownSourceCount > 0) {
        captureGaps.push(`${unknownSourceCount} lead${unknownSourceCount !== 1 ? "s" : ""} with no source — add utm_source or lead_source when logging`);
      }
      if (!sourceBreakdown.some((s) => s.source === "instagram" || s.source === "facebook")) {
        captureGaps.push("No social media leads yet — add UTM parameters to Instagram/Facebook bio links");
      }
      if (attributedCount === 0 && allLeads.length > 0) {
        captureGaps.push("No full attribution journeys recorded — add the Blue Leaf attribution script to your website");
      }
      if (captureGaps.length === 0) {
        captureGaps.push("Attribution data looks healthy — keep UTM parameters consistent across campaigns");
      }

      return ok(res, {
        demo: false,
        sourceBreakdown,
        recentLeads: rowsToCamel(allLeads.slice(0, 5)),
        unknownSourceCount,
        totalLeads: allLeads.length,
        attributedCount,
        captureGaps,
      });
    } catch (e) {
      console.error("[marketing/attribution] error, returning demo:", e.message);
      return ok(res, DEMO_ATTRIBUTION);
    }
  });
}
