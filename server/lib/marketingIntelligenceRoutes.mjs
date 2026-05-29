/**
 * marketingIntelligenceRoutes.mjs
 * Marketing Intelligence — Phase 1-5 API routes
 *
 * Registers:
 *   Public (no auth):
 *     POST /api/public/attribution
 *     POST /api/public/enquiry
 *
 *   Authenticated:
 *     POST /api/marketing/publishes
 *     GET  /api/marketing/publishes
 *     GET  /api/intelligence/dashboard
 *     POST /api/intelligence/sync/meta
 *     POST /api/intelligence/sync/gsc
 *     GET  /api/intelligence/content-performance
 *     GET  /api/intelligence/keywords
 *     POST /api/intelligence/keywords
 *     GET  /api/intelligence/keywords/:id
 *     PUT  /api/intelligence/keywords/:id
 *     GET  /api/intelligence/pages
 *     POST /api/intelligence/pages
 *     GET  /api/intelligence/pages/:id
 *     PUT  /api/intelligence/pages/:id
 *     POST /api/intelligence/pages/:id/brief
 *     GET  /api/intelligence/clusters
 *     POST /api/intelligence/clusters
 *     GET  /api/intelligence/attribution/:leadId
 *     GET  /api/intelligence/questions
 *     POST /api/intelligence/questions/scan
 *     PATCH /api/intelligence/questions/:id
 */

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";
import { callAI } from "./aiGateway.mjs";
import { config as dotenvConfig } from "dotenv";

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sbClient() {
  return getServiceSupabase();
}

/** Extract Instagram/Facebook post ID from a URL or return the raw string if already an ID. */
function extractPlatformPostId(urlOrId, platform) {
  if (!urlOrId) return null;
  try {
    const url = new URL(urlOrId);
    if (platform === "instagram") {
      // https://www.instagram.com/p/CODE/ → CODE
      const m = url.pathname.match(/\/p\/([A-Za-z0-9_-]+)/);
      if (m) return m[1];
    }
    if (platform === "facebook") {
      // https://www.facebook.com/photo?fbid=12345 → 12345
      const fbid = url.searchParams.get("fbid") || url.searchParams.get("story_fbid");
      if (fbid) return fbid;
      // posts/12345
      const m2 = url.pathname.match(/\/posts\/(\d+)/);
      if (m2) return m2[1];
    }
    if (platform === "linkedin") {
      const m = url.pathname.match(/\/feed\/update\/(urn:.+?)(?:\/|$)/);
      if (m) return decodeURIComponent(m[1]);
    }
  } catch {
    // not a URL — treat as raw ID
  }
  return urlOrId;
}

/** Compute first-touch and last-touch attribution from a set of attribution_events rows */
function computeAttribution(events) {
  if (!events || events.length === 0) return null;
  const sorted = [...events].sort((a, b) => new Date(a.event_at) - new Date(b.event_at));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const sessions = new Set(sorted.map(e => e.session_id).filter(Boolean));
  const contentIds = [...new Set(sorted.map(e => e.content_item_id).filter(Boolean))];
  const firstMs = new Date(first.event_at).getTime();
  const lastMs  = new Date(last.event_at).getTime();
  const daysFromFirst = Math.floor((lastMs - firstMs) / (1000 * 60 * 60 * 24));

  return {
    first_touch_source:    first.utm_source || (first.referrer_url ? "referral" : "direct"),
    first_touch_medium:    first.utm_medium || "none",
    first_touch_page:      first.page_url,
    first_touch_content_item_id: first.content_item_id || null,
    first_touch_at:        first.event_at,
    last_touch_source:     last.utm_source  || (last.referrer_url  ? "referral" : "direct"),
    last_touch_medium:     last.utm_medium  || "none",
    last_touch_page:       last.page_url,
    last_touch_content_item_id: last.content_item_id || null,
    last_touch_at:         last.event_at,
    total_sessions:        sessions.size,
    total_page_views:      sorted.filter(e => e.event_type === "page_view").length,
    assisted_content_item_ids: contentIds,
    days_from_first_touch: daysFromFirst,
  };
}

/** Content performance score: deterministic, per plan section I */
function perfScore(item) {
  const enquiries    = Number(item.attributed_enquiries || 0);
  const engRate      = Number(item.engagement_rate || 0);
  const linkClicks   = Number(item.total_link_clicks || 0);
  return Math.round((enquiries * 40) + (engRate * 100 * 30) + (linkClicks * 30));
}

// ─── SEO brief system prompt ──────────────────────────────────────────────────
function seoBriefSystemPrompt() {
  return `You are an expert SEO strategist working for Blue Leaf Building, a premium custom home builder based in Adelaide, South Australia.

Blue Leaf builds architecturally designed custom homes and major renovations. Their clients are owner-occupiers (not investors) looking for quality, performance and design excellence. Key brand principles:
- Performance-first building: weather-tight, passive design, thermally efficient
- Architect collaboration specialist
- Adelaide market — suburbs: Burnside, Unley, Stirling, Norwood, Torrens Park, Mitcham, Adelaide Hills
- Never commodity pricing, never volume building
- APB (Association of Professional Builders) methodology

Generate SEO content briefs that are specific to Blue Leaf, not generic builder content. Every angle must be defensible and specific — no fluff, no generic builder copy.`;
}

// ─── Question Engine scan prompt ─────────────────────────────────────────────
function questionScanPrompt(items) {
  return `You are a marketing strategist for Blue Leaf Building, a premium custom home builder in Adelaide.

Review the following notes, conversation excerpts, and diary entries. For each item, determine:
1. Does it contain a question or topic that a prospect or client genuinely wants to know about?
2. Would an answer to this question make good marketing content (SEO, social, client guide)?

Return a JSON array. Each element:
{
  "source_id": "<the id from input>",
  "contains_question": true/false,
  "question_text": "<the question in natural language, or null>",
  "seo_potential": "high|medium|low|none",
  "suggested_content_type": "faq_page|client_guide|instagram_post|journal_article|website_page|null",
  "suggested_keyword": "<target keyword or null>",
  "monthly_search_estimate": <integer or null>
}

Items to analyse:
${JSON.stringify(items, null, 2)}

Return ONLY the JSON array. No explanation.`;
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerMarketingIntelligenceRoutes(app) {

  // ── PUBLIC: Attribution event capture (no auth — called by website JS) ───────
  app.post("/api/public/attribution", async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const {
      session_id, visitor_id, event_type, page_url, referrer_url,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      content_item_id, device_type,
    } = req.body || {};

    const validEvents = ["page_view","content_view","video_play","enquiry_start","enquiry_submit","call_click","email_click"];
    if (!event_type || !validEvents.includes(event_type)) {
      return err(res, 400, "Invalid event_type");
    }

    const { error } = await sb.from("attribution_events").insert({
      session_id:      session_id || null,
      visitor_id:      visitor_id || null,
      event_type,
      page_url:        page_url   || null,
      referrer_url:    referrer_url || null,
      utm_source:      utm_source || null,
      utm_medium:      utm_medium || null,
      utm_campaign:    utm_campaign || null,
      utm_content:     utm_content || null,
      utm_term:        utm_term   || null,
      content_item_id: content_item_id || null,
      device_type:     device_type || null,
    });

    if (error) return err(res, 500, translateDbError(error));
    return ok(res);
  });

  // ── PUBLIC: Enquiry form submission → creates lead + attribution ─────────────
  app.post("/api/public/enquiry", async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");

    const {
      // Lead fields
      name, email, phone, project_type, suburb, project_description,
      // Attribution
      session_id, utm_source, utm_medium, utm_campaign,
    } = req.body || {};

    if (!name || !email) return err(res, 400, "name and email are required");

    // Create the lead
    const { data: lead, error: leadErr } = await sb.from("leads").insert({
      name,
      email,
      phone:               phone || null,
      project_type:        project_type || null,
      suburb:              suburb || null,
      project_description: project_description || null,
      lead_source:         utm_source || "website",
      utm_campaign:        utm_campaign || null,
    }).select().single();

    if (leadErr) return err(res, 500, translateDbError(leadErr));

    // Compute attribution from session events
    let attrRow = null;
    if (session_id) {
      const { data: events } = await sb.from("attribution_events")
        .select("*")
        .eq("session_id", session_id)
        .order("event_at", { ascending: true });

      if (events && events.length > 0) {
        const attr = computeAttribution(events);

        // Update lead with first/last touch
        await sb.from("leads").update({
          first_touch_source:       attr.first_touch_source,
          first_touch_medium:       attr.first_touch_medium,
          first_touch_utm_campaign: utm_campaign || null,
          last_touch_source:        attr.last_touch_source,
          last_touch_medium:        attr.last_touch_medium,
        }).eq("id", lead.id);

        // Link events to lead
        await sb.from("attribution_events")
          .update({ lead_id: lead.id })
          .eq("session_id", session_id)
          .is("lead_id", null);

        // Insert enquiry_attribution
        const { data: inserted } = await sb.from("enquiry_attribution").insert({
          lead_id: lead.id,
          ...attr,
        }).select().single();

        attrRow = inserted;
      }
    }

    return ok(res, { lead: rowToCamel(lead), attribution: attrRow ? rowToCamel(attrRow) : null });
  });

  // ── POST /api/marketing/publishes — record a social post ────────────────────
  app.post("/api/marketing/publishes", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");

    const {
      content_item_id, platform, platform_post_url, caption_used, media_asset_id, campaign_id,
    } = req.body || {};

    if (!content_item_id) return err(res, 400, "content_item_id required");
    if (!platform) return err(res, 400, "platform required");

    const validPlatforms = ["instagram", "facebook", "linkedin"];
    if (!validPlatforms.includes(platform)) return err(res, 400, "Invalid platform");

    const platform_post_id = extractPlatformPostId(platform_post_url, platform);

    const { data: publish, error: pubErr } = await sb.from("social_post_publishes").insert({
      content_item_id,
      platform,
      platform_post_id: platform_post_id || null,
      published_by:     req.caller.id,
      caption_used:     caption_used || null,
      media_asset_id:   media_asset_id || null,
      campaign_id:      campaign_id || null,
    }).select().single();

    if (pubErr) return err(res, 500, translateDbError(pubErr));

    // Mark content item as published
    await sb.from("marketing_content_items").update({
      status:       "published",
      published_at: new Date().toISOString(),
      published_url: platform_post_url || null,
    }).eq("id", content_item_id);

    return ok(res, { publish: rowToCamel(publish) });
  });

  // ── GET /api/marketing/publishes — list all with latest snapshot ─────────────
  app.get("/api/marketing/publishes", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");

    const { data, error } = await sb.from("social_post_publishes")
      .select(`
        *,
        marketing_content_items(id, title, channel, pillar),
        social_post_snapshots(reach, impressions, likes, comments, shares, saves, link_clicks, engagement_rate, snapshot_date)
      `)
      .order("published_at", { ascending: false });

    if (error) return err(res, 500, translateDbError(error));

    // For each publish, attach only the latest snapshot
    const publishes = (data || []).map(p => {
      const snaps = (p.social_post_snapshots || []).sort((a, b) =>
        new Date(b.snapshot_date) - new Date(a.snapshot_date)
      );
      return { ...p, latest_snapshot: snaps[0] || null, social_post_snapshots: undefined };
    });

    return ok(res, { publishes: rowsToCamel(publishes) });
  });

  // ── GET /api/intelligence/dashboard ─────────────────────────────────────────
  app.get("/api/intelligence/dashboard", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Run all queries in parallel — each section independent
    const [
      enquiriesRes,
      contentPerfRes,
      keywordsRes,
      questionsRes,
      publishesRes,
    ] = await Promise.all([
      // Section 1: This Month KPIs — leads attributed to marketing this month
      sb.from("leads")
        .select("id, stage, lead_source, first_touch_source")
        .gte("created_at", monthStart),

      // Section 2: Content performance — published items with attribution data
      sb.from("marketing_content_items")
        .select("id, title, channel, pillar, attributed_enquiries, total_reach, total_engagements, total_link_clicks, published_at")
        .eq("status", "published")
        .order("attributed_enquiries", { ascending: false }),

      // Section 3: Google Opportunity — keyword_targets in positions 6-15 with impressions
      sb.from("keyword_targets")
        .select("id, keyword, current_position, monthly_impressions, target_page_url, position_trend")
        .not("current_position", "is", null)
        .gte("current_position", 6)
        .lte("current_position", 15)
        .gte("monthly_impressions", 50)
        .order("monthly_impressions", { ascending: false })
        .limit(5),

      // Section 5: Create Next — top queued questions
      sb.from("website_questions")
        .select("id, question_text, seo_potential, suggested_content_type, suggested_keyword")
        .eq("status", "queued")
        .in("seo_potential", ["high", "medium"])
        .order("created_at", { ascending: false })
        .limit(5),

      // Social publishes for reach data
      sb.from("social_post_publishes")
        .select("id, platform, published_at, content_item_id")
        .gte("published_at", ninetyDaysAgo),
    ]);

    // ── Section 1: This Month KPIs ────────────────────────────────────────────
    const allLeads  = enquiriesRes.data || [];
    const mktLeads  = allLeads.filter(l =>
      l.first_touch_source && l.first_touch_source !== "direct"
    );
    const kpis = {
      enquiries:      mktLeads.length,
      qualified:      mktLeads.filter(l => ["qualify","discovery","winning_offer","fee_proposal","accepted","tender","won"].includes(l.stage)).length,
      tenders:        mktLeads.filter(l => ["tender","won"].includes(l.stage)).length,
      signed:         mktLeads.filter(l => l.stage === "won").length,
      pipeline_value: null, // requires budget data from jobs — set to null until joined
    };

    // ── Section 2: What's Working / What's Not ────────────────────────────────
    const contentItems = (contentPerfRes.data || []).map(item => {
      const engRate = item.total_reach > 0
        ? Number(item.total_engagements || 0) / Number(item.total_reach)
        : 0;
      const score = perfScore({ ...item, engagement_rate: engRate });
      return { ...item, engagement_rate: engRate, performance_score: score };
    }).sort((a, b) => b.performance_score - a.performance_score);

    const working    = contentItems.slice(0, 3);
    const notWorking = [...contentItems].reverse().slice(0, 3);

    // ── Section 3: Google Opportunity ────────────────────────────────────────
    const opportunities = (keywordsRes.data || []).slice(0, 2).map(kw => {
      // Estimated monthly clicks at top-3: CTR ~20% at pos 1, use simplified estimate
      const currentPos = Number(kw.current_position || 10);
      const impressions = Number(kw.monthly_impressions || 0);
      const estimatedTopClicks = Math.round(impressions * 0.20);
      const currentClicks = Math.round(impressions * (currentPos <= 3 ? 0.20 : currentPos <= 5 ? 0.08 : 0.03));
      return {
        ...kw,
        estimated_top_clicks:   estimatedTopClicks,
        current_estimated_clicks: currentClicks,
        click_opportunity:      estimatedTopClicks - currentClicks,
      };
    });

    // ── Section 4: Follow Up Now — CRM bridge ────────────────────────────────
    // CRM not yet built — return empty with description of algorithm
    const followUp = {
      contacts: [],
      algorithm_note: "Requires CRM module (mailing_list_members, crm_contacts) — not yet built.",
    };

    // ── Section 5: Create Next ────────────────────────────────────────────────
    const createNext = {
      questions:   rowsToCamel(questionsRes.data || []),
      keyword_gaps: opportunities.filter(k => !k.target_page_url).slice(0, 2),
    };

    return ok(res, {
      dashboard: {
        this_month:    kpis,
        working:       rowsToCamel(working),
        not_working:   rowsToCamel(notWorking),
        opportunities: rowsToCamel(opportunities),
        follow_up:     followUp,
        create_next:   createNext,
      },
    });
  });

  // ── POST /api/intelligence/sync/meta — pull Meta Insights ───────────────────
  app.post("/api/intelligence/sync/meta", requireAuth, requireRole("admin"), async (req, res) => {
    const accessToken = process.env.META_ACCESS_TOKEN?.trim() || _env.META_ACCESS_TOKEN?.trim();
    const igUserId    = process.env.META_IG_USER_ID?.trim()   || _env.META_IG_USER_ID?.trim();

    if (!accessToken) return err(res, 503, "META_ACCESS_TOKEN not configured");
    if (!igUserId)    return err(res, 503, "META_IG_USER_ID not configured");

    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: publishes, error: pubErr } = await sb.from("social_post_publishes")
      .select("id, platform, platform_post_id, content_item_id")
      .gte("published_at", since)
      .not("platform_post_id", "is", null);

    if (pubErr) return err(res, 500, translateDbError(pubErr));

    const today = new Date().toISOString().slice(0, 10);
    let synced = 0;
    let failed = 0;

    for (const pub of (publishes || [])) {
      if (pub.platform !== "instagram" && pub.platform !== "facebook") continue;
      try {
        const metricsField = pub.platform === "instagram"
          ? "reach,impressions,likes,comments,shares,saves,total_interactions"
          : "post_impressions,post_impressions_unique,post_engaged_users,post_clicks";

        const url = `https://graph.facebook.com/v19.0/${pub.platform_post_id}/insights?metric=${metricsField}&access_token=${accessToken}`;
        const resp = await fetch(url);
        if (!resp.ok) { failed++; continue; }

        const json = await resp.json();
        if (json.error) { failed++; continue; }

        const m = {};
        for (const item of (json.data || [])) {
          m[item.name] = item.values?.[0]?.value ?? item.value ?? null;
        }

        const reach       = m.reach ?? m.post_impressions_unique ?? null;
        const impressions = m.impressions ?? m.post_impressions ?? null;
        const likes       = m.likes ?? null;
        const comments    = m.comments ?? null;
        const shares      = m.shares ?? null;
        const saves       = m.saves ?? null;
        const linkClicks  = m.post_clicks ?? null;
        const engagements = (likes||0)+(comments||0)+(shares||0)+(saves||0);
        const engRate     = reach && reach > 0 ? engagements / reach : null;

        await sb.from("social_post_snapshots").upsert({
          publish_id:      pub.id,
          snapshot_date:   today,
          platform:        pub.platform,
          reach,
          impressions,
          likes,
          comments,
          shares,
          saves,
          link_clicks:     linkClicks,
          engagement_rate: engRate,
          raw_data:        json,
        }, { onConflict: "publish_id,snapshot_date" });

        // Update content item aggregates (fire-and-forget)
        if (pub.content_item_id) {
          const { data: allSnaps } = await sb.from("social_post_snapshots")
            .select("reach, likes, comments, shares, saves, link_clicks")
            .eq("publish_id", pub.id);

          if (allSnaps && allSnaps.length > 0) {
            const latest = allSnaps[allSnaps.length - 1];
            const totalEngagements = (latest.likes||0)+(latest.comments||0)+(latest.shares||0)+(latest.saves||0);
            await sb.from("marketing_content_items").update({
              total_reach:       latest.reach,
              total_engagements: totalEngagements,
              total_link_clicks: latest.link_clicks,
              engagement_rate:   latest.reach > 0 ? totalEngagements / latest.reach : null,
            }).eq("id", pub.content_item_id);
          }
        }

        synced++;
      } catch (e) {
        console.error(`[meta-sync] failed for publish ${pub.id}:`, e.message);
        failed++;
      }
    }

    return ok(res, { synced, failed, total: (publishes || []).length });
  });

  // ── POST /api/intelligence/sync/gsc — pull Search Console ───────────────────
  app.post("/api/intelligence/sync/gsc", requireAuth, requireRole("admin"), async (req, res) => {
    const siteUrl     = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim() || _env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim();
    const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim()    || _env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
    const clientId    = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim()          || _env.GOOGLE_DRIVE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim()     || _env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();

    if (!siteUrl)      return err(res, 503, "GOOGLE_SEARCH_CONSOLE_SITE_URL not configured");
    if (!refreshToken) return err(res, 503, "Google OAuth refresh token not configured");

    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");

    // Get access token via refresh
    let accessToken;
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id:     clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type:    "refresh_token",
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenJson.access_token) {
        return err(res, 503, `Google OAuth failed: ${tokenJson.error || "no access_token"}`);
      }
      accessToken = tokenJson.access_token;
    } catch (e) {
      return err(res, 503, `Google OAuth error: ${e.message}`);
    }

    // Pull last 28 days of data
    const endDate   = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const gscUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

    let inserted = 0;
    let failed   = 0;

    // Pull page-level data
    try {
      const resp = await fetch(gscUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["page"],
          rowLimit: 500,
        }),
      });
      const json = await resp.json();
      if (json.error) return err(res, 502, `GSC API error: ${json.error.message}`);

      for (const row of (json.rows || [])) {
        const { error: upsErr } = await sb.from("search_console_snapshots").upsert({
          snapshot_date: endDate,
          page_url:      row.keys[0],
          query:         null,
          impressions:   row.impressions,
          clicks:        row.clicks,
          ctr:           row.ctr,
          avg_position:  row.position,
          device:        "all",
        }, { onConflict: "snapshot_date,page_url,COALESCE(query,'__page__'),device" });
        if (upsErr) { failed++; } else { inserted++; }
      }
    } catch (e) {
      return err(res, 502, `GSC fetch error: ${e.message}`);
    }

    // Pull query-level data
    try {
      const resp = await fetch(gscUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["query", "page"],
          rowLimit: 500,
        }),
      });
      const json = await resp.json();
      for (const row of (json.rows || [])) {
        await sb.from("search_console_snapshots").upsert({
          snapshot_date: endDate,
          page_url:      row.keys[1],
          query:         row.keys[0],
          impressions:   row.impressions,
          clicks:        row.clicks,
          ctr:           row.ctr,
          avg_position:  row.position,
          device:        "all",
        }, { onConflict: "snapshot_date,page_url,COALESCE(query,'__page__'),device" }).catch(() => {});
        inserted++;
      }
    } catch { /* non-fatal */ }

    // Update keyword_targets with latest positions
    const { data: keywords } = await sb.from("keyword_targets").select("id, keyword");
    for (const kw of (keywords || [])) {
      const { data: snap } = await sb.from("search_console_snapshots")
        .select("avg_position, impressions")
        .eq("query", kw.keyword)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (snap) {
        // Get 4-week-ago position for trend
        const { data: oldSnap } = await sb.from("search_console_snapshots")
          .select("avg_position")
          .eq("query", kw.keyword)
          .lte("snapshot_date", new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        let trend = "stable";
        if (oldSnap?.avg_position) {
          const diff = Number(oldSnap.avg_position) - Number(snap.avg_position);
          if (diff > 1) trend = "up";
          else if (diff < -1) trend = "down";
        } else {
          trend = "new";
        }

        await sb.from("keyword_targets").update({
          current_position:    snap.avg_position,
          monthly_impressions: snap.impressions,
          position_trend:      trend,
          updated_at:          new Date().toISOString(),
        }).eq("id", kw.id);
      }
    }

    // Update website_pages with GSC data
    const { data: pages } = await sb.from("website_pages").select("id, url_path");
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const page of (pages || [])) {
      const { data: snap } = await sb.from("search_console_snapshots")
        .select("impressions, clicks, ctr, avg_position")
        .eq("page_url", page.url_path)
        .is("query", null)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (snap) {
        const { data: pageRow } = await sb.from("website_pages")
          .select("last_updated_at")
          .eq("id", page.id)
          .single();

        const needsRefresh = pageRow?.last_updated_at
          ? pageRow.last_updated_at < sixMonthsAgo
          : false;

        await sb.from("website_pages").update({
          current_impressions:  snap.impressions,
          current_clicks:       snap.clicks,
          current_ctr:          snap.ctr,
          current_avg_position: snap.avg_position,
          needs_refresh:        needsRefresh,
        }).eq("id", page.id);
      }
    }

    return ok(res, { inserted, failed });
  });

  // ── GET /api/intelligence/content-performance ────────────────────────────────
  app.get("/api/intelligence/content-performance", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");

    const { channel, campaign_id, days } = req.query;
    let query = sb.from("marketing_content_items")
      .select("id, title, channel, pillar, attributed_enquiries, total_reach, total_engagements, total_link_clicks, published_at, published_url")
      .eq("status", "published");

    if (channel)     query = query.eq("channel", channel);
    if (campaign_id) query = query.eq("campaign_id", campaign_id);
    if (days) {
      const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("published_at", since);
    }

    const { data, error } = await query;
    if (error) return err(res, 500, translateDbError(error));

    const items = (data || []).map(item => {
      const engRate = item.total_reach > 0
        ? Number(item.total_engagements || 0) / Number(item.total_reach)
        : 0;
      return {
        ...item,
        engagement_rate:   engRate,
        performance_score: perfScore({ ...item, engagement_rate: engRate }),
      };
    }).sort((a, b) => b.performance_score - a.performance_score);

    return ok(res, { items: rowsToCamel(items) });
  });

  // ── GET /api/intelligence/keywords ──────────────────────────────────────────
  app.get("/api/intelligence/keywords", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const { data, error } = await sb.from("keyword_targets")
      .select("*, content_clusters(name)")
      .order("priority", { ascending: true })
      .order("monthly_impressions", { ascending: false, nullsFirst: false });
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { keywords: rowsToCamel(data || []) });
  });

  // ── POST /api/intelligence/keywords ─────────────────────────────────────────
  app.post("/api/intelligence/keywords", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const { keyword, intent, target_page_url, target_position, cluster_id, priority, notes } = req.body || {};
    if (!keyword) return err(res, 400, "keyword required");
    const { data, error } = await sb.from("keyword_targets").insert({
      keyword:         keyword.trim().toLowerCase(),
      intent:          intent || null,
      target_page_url: target_page_url || null,
      target_position: target_position || 5,
      cluster_id:      cluster_id || null,
      priority:        priority || "medium",
      notes:           notes || null,
    }).select().single();
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { keyword: rowToCamel(data) });
  });

  // ── GET /api/intelligence/keywords/:id ──────────────────────────────────────
  app.get("/api/intelligence/keywords/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const { data, error } = await sb.from("keyword_targets")
      .select("*, content_clusters(name)")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) return err(res, 500, translateDbError(error));
    if (!data)  return err(res, 404, "Keyword not found");

    // Attach 12-week position trend from snapshots
    const { data: snaps } = await sb.from("search_console_snapshots")
      .select("snapshot_date, avg_position, impressions, clicks, ctr")
      .eq("query", data.keyword)
      .order("snapshot_date", { ascending: false })
      .limit(12);

    return ok(res, { keyword: rowToCamel(data), history: rowsToCamel(snaps || []) });
  });

  // ── PUT /api/intelligence/keywords/:id ──────────────────────────────────────
  app.put("/api/intelligence/keywords/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const allowed = ["intent","target_page_url","target_position","cluster_id","priority","notes"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    patch.updated_at = new Date().toISOString();
    const { data, error } = await sb.from("keyword_targets")
      .update(patch).eq("id", req.params.id).select().single();
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { keyword: rowToCamel(data) });
  });

  // ── GET /api/intelligence/pages ─────────────────────────────────────────────
  app.get("/api/intelligence/pages", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const { data, error } = await sb.from("website_pages")
      .select("*")
      .order("current_avg_position", { ascending: true, nullsFirst: false });
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { pages: rowsToCamel(data || []) });
  });

  // ── POST /api/intelligence/pages ────────────────────────────────────────────
  app.post("/api/intelligence/pages", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const {
      url_path, title, meta_description, h1, page_type, primary_keyword,
      cluster, target_word_count, status, last_published_at,
    } = req.body || {};
    if (!url_path) return err(res, 400, "url_path required");
    const { data, error } = await sb.from("website_pages").insert({
      url_path:         url_path.trim(),
      title:            title || null,
      meta_description: meta_description || null,
      h1:               h1 || null,
      page_type:        page_type || null,
      primary_keyword:  primary_keyword || null,
      cluster:          cluster || null,
      target_word_count: target_word_count || null,
      status:           status || "planned",
      last_published_at: last_published_at || null,
    }).select().single();
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { page: rowToCamel(data) });
  });

  // ── GET /api/intelligence/pages/:id ─────────────────────────────────────────
  app.get("/api/intelligence/pages/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const [pageRes, briefRes] = await Promise.all([
      sb.from("website_pages").select("*").eq("id", req.params.id).maybeSingle(),
      sb.from("seo_content_briefs").select("*").eq("website_page_id", req.params.id).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (pageRes.error) return err(res, 500, translateDbError(pageRes.error));
    if (!pageRes.data) return err(res, 404, "Page not found");
    return ok(res, { page: rowToCamel(pageRes.data), brief: briefRes.data ? rowToCamel(briefRes.data) : null });
  });

  // ── PUT /api/intelligence/pages/:id ─────────────────────────────────────────
  app.put("/api/intelligence/pages/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const allowed = ["title","meta_description","h1","page_type","primary_keyword","cluster",
                     "target_word_count","status","last_published_at","last_updated_at","content_item_id"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];

    // Auto-compute needs_refresh
    if (patch.last_updated_at) {
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      patch.needs_refresh = patch.last_updated_at < sixMonthsAgo;
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await sb.from("website_pages")
      .update(patch).eq("id", req.params.id).select().single();
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { page: rowToCamel(data) });
  });

  // ── POST /api/intelligence/pages/:id/brief — generate SEO brief ──────────────
  app.post("/api/intelligence/pages/:id/brief", requireAuth, async (req, res) => {
    if (!_apiKey) return err(res, 503, "AI not configured");
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");

    const force = req.query.force === "true";

    const { data: page, error: pageErr } = await sb.from("website_pages")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (pageErr) return err(res, 500, translateDbError(pageErr));
    if (!page)   return err(res, 404, "Page not found");

    // Check cache — reject if not expired and !force
    const { data: existingBrief } = await sb.from("seo_content_briefs")
      .select("id, expires_at, generated_at")
      .eq("website_page_id", req.params.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingBrief && !force) {
      const expiresAt = new Date(existingBrief.expires_at);
      if (expiresAt > new Date()) {
        return err(res, 400,
          `SEO brief still valid until ${expiresAt.toLocaleDateString()}. Use ?force=true to regenerate.`
        );
      }
    }

    const keyword = page.primary_keyword || page.title || page.url_path;
    const intent  = req.body.intent || "commercial";

    const userPrompt = `Generate a detailed SEO content brief for the following:

Page URL: ${page.url_path}
Current title: ${page.title || "(none)"}
Current H1: ${page.h1 || "(none)"}
Primary keyword: ${keyword}
Search intent: ${intent}
Page type: ${page.page_type || "service"}
Content cluster: ${page.cluster || "(unassigned)"}
Target word count: ${page.target_word_count || "800-1200 words"}

Return a JSON object with these exact fields:
{
  "recommended_title": "string (under 60 chars)",
  "recommended_meta_description": "string (150-160 chars)",
  "recommended_h1": "string",
  "recommended_h2s": ["string", "string", ...],
  "word_count_target": integer,
  "key_questions_to_answer": ["string", ...],
  "internal_link_suggestions": ["string", ...],
  "content_angles": ["string", ...],
  "schema_markup_type": "string"
}

All recommendations must be specific to Blue Leaf Building — never generic builder content.
Return ONLY the JSON object.`;

    let briefData;
    try {
      const response = await callAI({
        model:      "claude-sonnet-4-6",
        system:     seoBriefSystemPrompt(),
        max_tokens: 2000,
        messages:   [{ role: "user", content: userPrompt }],
      });
      const raw = response.content?.[0]?.text || "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      briefData = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (e) {
      return err(res, 502, `AI brief generation failed: ${e.message}`);
    }

    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: brief, error: briefErr } = await sb.from("seo_content_briefs").insert({
      website_page_id:              req.params.id,
      keyword,
      intent,
      recommended_title:            briefData.recommended_title || null,
      recommended_meta_description: briefData.recommended_meta_description || null,
      recommended_h1:               briefData.recommended_h1 || null,
      recommended_h2s:              briefData.recommended_h2s || [],
      word_count_target:            briefData.word_count_target || page.target_word_count || null,
      key_questions_to_answer:      briefData.key_questions_to_answer || [],
      internal_link_suggestions:    briefData.internal_link_suggestions || [],
      content_angles:               briefData.content_angles || [],
      schema_markup_type:           briefData.schema_markup_type || null,
      model_used:                   "claude-sonnet-4-6",
      expires_at:                   expiresAt,
    }).select().single();

    if (briefErr) return err(res, 500, translateDbError(briefErr));

    // Update page record
    await sb.from("website_pages").update({
      seo_brief_generated_at: new Date().toISOString(),
    }).eq("id", req.params.id);

    return ok(res, { brief: rowToCamel(brief) });
  });

  // ── GET /api/intelligence/clusters ──────────────────────────────────────────
  app.get("/api/intelligence/clusters", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const { data, error } = await sb.from("content_clusters")
      .select("*, keyword_targets(id, keyword, current_position, priority)")
      .order("name");
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { clusters: rowsToCamel(data || []) });
  });

  // ── POST /api/intelligence/clusters ─────────────────────────────────────────
  app.post("/api/intelligence/clusters", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const { name, hub_page_url, description, keywords } = req.body || {};
    if (!name) return err(res, 400, "name required");
    const { data, error } = await sb.from("content_clusters").insert({
      name,
      hub_page_url: hub_page_url || null,
      description:  description || null,
      keywords:     Array.isArray(keywords) ? keywords : [],
    }).select().single();
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { cluster: rowToCamel(data) });
  });

  // ── GET /api/intelligence/attribution/:leadId ────────────────────────────────
  app.get("/api/intelligence/attribution/:leadId", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const [attrRes, eventsRes] = await Promise.all([
      sb.from("enquiry_attribution").select("*").eq("lead_id", req.params.leadId).maybeSingle(),
      sb.from("attribution_events")
        .select("event_type, page_url, utm_source, utm_medium, utm_campaign, content_item_id, event_at")
        .eq("lead_id", req.params.leadId)
        .order("event_at", { ascending: true }),
    ]);
    if (attrRes.error) return err(res, 500, translateDbError(attrRes.error));
    return ok(res, {
      attribution: attrRes.data ? rowToCamel(attrRes.data) : null,
      events:      rowsToCamel(eventsRes.data || []),
    });
  });

  // ── GET /api/intelligence/questions ──────────────────────────────────────────
  app.get("/api/intelligence/questions", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const { status } = req.query;
    let query = sb.from("website_questions")
      .select("*")
      .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { questions: rowsToCamel(data || []) });
  });

  // ── POST /api/intelligence/questions/scan — Question Engine ─────────────────
  app.post("/api/intelligence/questions/scan", requireAuth, requireRole("admin"), async (req, res) => {
    if (!_apiKey) return err(res, 503, "AI not configured");
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");

    // Get existing question texts to deduplicate
    const { data: existingQs } = await sb.from("website_questions")
      .select("question_text")
      .not("status", "eq", "dismissed");
    const existingTexts = new Set((existingQs || []).map(q => q.question_text.toLowerCase()));

    // Collect sources since last scan
    const since = req.body.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [notesRes, convsRes, diaryRes] = await Promise.all([
      sb.from("lead_notes").select("id, content, created_at").gte("created_at", since).limit(50),
      sb.from("lead_conversations").select("id, transcript_text, created_at").gte("created_at", since).limit(20),
      sb.from("site_diary").select("id, notes, created_at").gte("created_at", since).limit(30),
    ]);

    // Build batch items for Haiku to classify
    const items = [];
    for (const n of (notesRes.data || [])) {
      if (n.content?.trim()) items.push({ id: n.id, source_type: "lead_note", text: n.content.slice(0, 500) });
    }
    for (const c of (convsRes.data || [])) {
      if (c.transcript_text?.trim()) items.push({ id: c.id, source_type: "lead_conversation", text: c.transcript_text.slice(0, 800) });
    }
    for (const d of (diaryRes.data || [])) {
      if (d.notes?.trim()) items.push({ id: d.id, source_type: "site_diary", text: d.notes.slice(0, 500) });
    }

    if (items.length === 0) return ok(res, { scanned: 0, inserted: 0 });

    let totalInserted = 0;

    // Process in batches of 20
    for (let i = 0; i < items.length; i += 20) {
      const batch = items.slice(i, i + 20);
      try {
        const response = await callAI({
          model:      "claude-haiku-4-5",
          max_tokens: 2000,
          messages:   [{ role: "user", content: questionScanPrompt(batch) }],
        });
        const raw = response.content?.[0]?.text || "[]";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        const results = JSON.parse(jsonMatch ? jsonMatch[0] : raw);

        for (const r of results) {
          if (!r.contains_question || !r.question_text) continue;
          const qLower = r.question_text.toLowerCase();
          // Simple duplicate check — skip if similar text already exists
          if ([...existingTexts].some(t => t.includes(qLower.slice(0, 40)) || qLower.includes(t.slice(0, 40)))) continue;

          const item = batch.find(b => b.id === r.source_id);
          await sb.from("website_questions").insert({
            question_text:         r.question_text,
            source_type:           item?.source_type || "manual",
            source_id:             r.source_id || null,
            seo_potential:         r.seo_potential || "low",
            suggested_content_type: r.suggested_content_type || null,
            suggested_keyword:     r.suggested_keyword || null,
            monthly_search_estimate: r.monthly_search_estimate || null,
          }).catch(e => console.error("[question-scan] insert error:", e.message));

          existingTexts.add(qLower);
          totalInserted++;
        }
      } catch (e) {
        console.error("[question-scan] batch error:", e.message);
      }
    }

    return ok(res, { scanned: items.length, inserted: totalInserted });
  });

  // ── PATCH /api/intelligence/questions/:id ────────────────────────────────────
  app.patch("/api/intelligence/questions/:id", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");
    const allowed = ["status", "content_item_id", "website_page_id"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    const { data, error } = await sb.from("website_questions")
      .update(patch).eq("id", req.params.id).select().single();
    if (error) return err(res, 500, translateDbError(error));
    return ok(res, { question: rowToCamel(data) });
  });

  // ── GET /api/intelligence/attribution-summary ────────────────────────────────
  // Full attribution dashboard: source breakdown, journey examples, content table
  app.get("/api/intelligence/attribution-summary", requireAuth, async (req, res) => {
    const sb = sbClient();
    if (!sb) return err(res, 503, "DB not configured");

    const { days = "30" } = req.query;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();

    const [attrRes, recentRes] = await Promise.all([
      sb.from("enquiry_attribution")
        .select("*, leads(id, name, stage, project_description, created_at)")
        .gte("created_at", since)
        .order("created_at", { ascending: false }),
      sb.from("enquiry_attribution")
        .select("*, leads(id, name, stage)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    if (attrRes.error) return err(res, 500, translateDbError(attrRes.error));

    const attrs = attrRes.data || [];

    // Source breakdown
    const sourceMap = {};
    for (const a of attrs) {
      const src = a.first_touch_source || "direct";
      if (!sourceMap[src]) sourceMap[src] = { source: src, count: 0 };
      sourceMap[src].count++;
    }
    const sourceBreakdown = Object.values(sourceMap).sort((a, b) => b.count - a.count);

    // Content attribution
    const contentCounts = {};
    for (const a of attrs) {
      for (const cid of (a.assisted_content_item_ids || [])) {
        contentCounts[cid] = (contentCounts[cid] || 0) + 1;
      }
      if (a.first_touch_content_item_id) {
        const k = a.first_touch_content_item_id;
        contentCounts[k] = (contentCounts[k] || 0) + 1;
      }
    }

    return ok(res, {
      source_breakdown: sourceBreakdown,
      recent_journeys:  rowsToCamel(recentRes.data || []),
      content_counts:   contentCounts,
      total_attributed: attrs.length,
    });
  });
}
