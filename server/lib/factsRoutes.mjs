// factsRoutes.mjs — Phase 0 activation: the HTTP surface for the canonical facts service.
// See docs/agent_knowledge/UNIVERSAL_DATA_MIGRATION_PLAN.md §2.3 + CLAUDE.md Canonical Data Law.
//
// These are the four endpoints that back <FactField> and (later) the Confirm queue.
// All auth-guarded, all ok()/err(), camelCase across the boundary.
//
//   GET  /api/facts/job/:jobId/profile        → getJobProfile  (read every job-spine fact + provenance)
//   GET  /api/facts/job/:jobId/pending         → getPendingFacts (🔴 suggestions awaiting confirmation)
//   POST /api/facts/job/:jobId/:key            → setFact   (manual write / override)
//   POST /api/facts/job/:jobId/:key/confirm    → confirmFact (promote a flagged suggestion)

import { ok, err } from "./apiResponse.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { getJobProfile, getPendingFacts, setFact, confirmFact } from "./factsService.mjs";

export function registerFactsRoutes(app) {
  // ── Read the full job profile (every job-spine fact, grouped by family, with provenance) ──
  app.get("/api/facts/job/:jobId/profile", requireAuth, async (req, res) => {
    const jobId = String(req.params.jobId);
    try {
      const profile = await getJobProfile(jobId);
      if (!profile) return err(res, 404, "Job not found");
      return ok(res, { profile });
    } catch (e) {
      return err(res, 500, e?.message || "Failed to load job profile");
    }
  });

  // ── List pending (extracted_flagged) suggestions for the job ──
  app.get("/api/facts/job/:jobId/pending", requireAuth, async (req, res) => {
    const jobId = String(req.params.jobId);
    try {
      const pending = await getPendingFacts(jobId);
      return ok(res, { pending });
    } catch (e) {
      return err(res, 500, e?.message || "Failed to load pending facts");
    }
  });

  // ── Write a fact manually (override / human entry). Generated facts are rejected. ──
  app.post("/api/facts/job/:jobId/:key", requireAuth, async (req, res) => {
    const jobId = String(req.params.jobId);
    const key = String(req.params.key);
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, "value")) {
      return err(res, 400, "A value is required.");
    }
    const { value, reason } = req.body;
    try {
      const result = await setFact(jobId, key, value, {
        source: "manual",
        actorId: req.caller?.id || null,
        reason: reason || null,
      });
      if (!result.ok) {
        // Service rejects unknown facts and Generated facts (e.g. contractValue) with a
        // plain-English message — surface as a 400 so the UI shows it.
        return err(res, 400, result.error || "That fact could not be saved.");
      }
      return ok(res, { fact: result });
    } catch (e) {
      return err(res, 500, e?.message || "Failed to save fact");
    }
  });

  // ── Confirm a pending suggestion → promotes the latest extracted_flagged row to canonical ──
  app.post("/api/facts/job/:jobId/:key/confirm", requireAuth, async (req, res) => {
    const jobId = String(req.params.jobId);
    const key = String(req.params.key);
    try {
      const result = await confirmFact(jobId, key, {
        source: "manual",
        actorId: req.caller?.id || null,
        reason: req.body?.reason || null,
      });
      if (!result.ok) {
        return err(res, 400, result.error || "That suggestion could not be confirmed.");
      }
      return ok(res, { fact: result });
    } catch (e) {
      return err(res, 500, e?.message || "Failed to confirm fact");
    }
  });
}
