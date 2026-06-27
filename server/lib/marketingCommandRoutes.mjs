// marketingCommandRoutes.mjs — Marketing Command Centre (Run A / Batch 1).
//
// GET /api/marketing/command-centre — aggregated weekly snapshot for Josh's home screen.
// Reserved Stage 2–6 route stubs (501) so future URLs never collide.
//
// All routes mount under the blanket /api/marketing admin gate in dev-api.mjs
// (requireAuth + requireRole("admin")); per-route requireAuth is kept for clarity/defence.
// Standards: apiResponse ok/err + translateDbError; camelCase out; no raw DB errors to the browser.

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { ok, err, translateDbError } from "./apiResponse.mjs";

function sb() {
  return getServiceSupabase();
}

// YYYY-MM-DD for a Date (local-noon anchored to avoid TZ rollover)
function ymd(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

// Monday-anchored week window for a given Date
function weekWindow(base) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(d);
  start.setDate(d.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { weekStart: ymd(start), weekEnd: ymd(end) };
}

export function registerMarketingCommandRoutes(app) {
  // ─── Weekly snapshot ──────────────────────────────────────────────────────
  app.get("/api/marketing/command-centre", requireAuth, async (req, res) => {
    const db = sb();
    if (!db) return err(res, 503, "Database not configured");

    try {
      const now = new Date();
      const { weekStart, weekEnd } = weekWindow(now);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const countOpts = { count: "exact", head: true };

      const [needsReview, needsPhoto, slotsEmpty, publishedThisMonth, newMedia] = await Promise.all([
        db.from("marketing_content_items").select("*", countOpts).eq("status", "in_review"),
        db.from("marketing_content_items").select("*", countOpts)
          .is("media_source_id", null)
          .in("status", ["draft", "in_review"])
          .in("channel", ["instagram", "facebook"]),
        db.from("campaign_schedule_slots").select("*", countOpts)
          .eq("status", "empty")
          .gte("slot_date", weekStart)
          .lte("slot_date", weekEnd),
        db.from("social_post_publishes").select("*", countOpts).gte("published_at", monthStart),
        db.from("marketing_media_assets").select("*", countOpts).gte("created_at", sevenDaysAgo),
      ]);

      const failed = [needsReview, needsPhoto, slotsEmpty, publishedThisMonth, newMedia].find((r) => r.error);
      if (failed?.error) return err(res, 500, translateDbError(failed.error));

      return ok(res, {
        snapshot: {
          weekStart,
          weekEnd,
          needsReview: needsReview.count || 0,
          needsPhoto: needsPhoto.count || 0,
          slotsEmptyThisWeek: slotsEmpty.count || 0,
          publishedThisMonth: publishedThisMonth.count || 0,
          newMediaThisWeek: newMedia.count || 0,
        },
      });
    } catch (e) {
      return err(res, 500, translateDbError(e));
    }
  });

  // ─── Reserved Stage 2–6 route stubs (non-shadowing exact base paths) ───────
  // Registered so future URLs are reserved; return 501 until their stage ships.
  for (const reserved of [
    "/api/marketing/automation", // Stage 2 — automation hub
    "/api/marketing/publish",    // Stage 3 — platform publishing
    "/api/marketing/paid",       // Stage 4 — paid growth
    "/api/marketing/video/editor", // Stage 6 — video editor
  ]) {
    app.all(reserved, requireAuth, (req, res) =>
      err(res, 501, "This capability is planned for a later stage and is not available yet.", "NOT_IMPLEMENTED")
    );
  }
}
