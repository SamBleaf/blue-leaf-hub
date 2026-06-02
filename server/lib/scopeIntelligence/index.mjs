/**
 * ScopeIntelligence — the stable seam between Blue Leaf Hub and the scope-extraction
 * engine. Today it wraps the in-Hub Claude prompt + deterministic merge pipeline
 * (`HubScopeIntelligence`). Later it can be swapped for an external engine without
 * changing any Hub caller — see docs/agent_knowledge/SCOPE_INTELLIGENCE_ADAPTER_SPEC.md
 * and SCOPE_INTELLIGENCE_ENGINE_AGENT_PROMPT.md.
 *
 * Contract (informal — full schema in the spec doc):
 *   extractScope(request)  -> { runId, trades[], projectContext, coverageGaps, floorReport }
 *   submitOutcome(outcome) -> { accepted, learned }
 *
 * Trades always speak the canonical 36-trade vocabulary (tradeMasterLibrary.mjs).
 * The AI/document-only path stands alone — NO Buildxact estimate is required (RFQ
 * runs early in the tender, before any estimate exists).
 */
import { randomUUID } from "node:crypto";
import { processExtraction } from "../rfqScopePipeline.mjs";
import { mergeTradePlan } from "../rfqTradeIntelligence.mjs";
import { getTradeMasterSeed, tradeLabel } from "../tradeMasterLibrary.mjs";
import { reconcileFloor } from "./expectedScopeFloor.mjs";

// Placeholder confidence for the current heuristic pipeline. The redesigned engine
// (see the agent prompt) assigns real per-line confidence; until then we stamp a
// conservative default and mark every scope line as a suggestion needing review.
const HEURISTIC_TRADE_CONFIDENCE = 0.7;

function mapSource(extracted, inFloor) {
  if (extracted && inFloor) return "extracted+floor";
  if (extracted) return "extracted";
  return "floor";
}

/** In-Hub implementation: Claude extraction (injected) + deterministic merge + floor. */
export class HubScopeIntelligence {
  /**
   * @param {object} deps
   * @param {(request:object)=>Promise<object>} [deps.runAiExtraction] - returns the raw
   *   extraction JSON (trade_notes/project_context/coverage_gaps). If omitted, callers
   *   must pass `request.rawExtraction` (e.g. the existing streaming route, which owns
   *   the Anthropic call, can hand its final JSON here to get the canonical shape).
   * @param {()=>object[]} [deps.loadLibrary] - trade master seed loader (defaults to seed).
   */
  constructor({ runAiExtraction = null, loadLibrary = getTradeMasterSeed } = {}) {
    this._runAiExtraction = runAiExtraction;
    this._loadLibrary = loadLibrary;
  }

  /**
   * Produce trade-segmented scope from tender documents. No cost data required.
   * @param {object} request - { tenantId, jobRef, projectType, buildingFacts?, documents?, rawExtraction? }
   * @returns {Promise<object>}
   */
  async extractScope(request = {}) {
    const projectType = request.projectType || request.project_type || "";

    let raw = request.rawExtraction || null;
    if (!raw) {
      if (typeof this._runAiExtraction !== "function") {
        throw new Error(
          "ScopeIntelligence: no AI extractor configured. Provide deps.runAiExtraction or request.rawExtraction."
        );
      }
      raw = await this._runAiExtraction(request);
    }

    // Deterministic clean + per-trade segmentation (AI-only; estimate intentionally empty).
    const processed = processExtraction(raw || {}, null);
    const library = typeof this._loadLibrary === "function" ? this._loadLibrary() : getTradeMasterSeed();
    const plan = mergeTradePlan({ extraction: processed, estimateCategories: [], library });

    const extractedKeys = plan.map((p) => p.trade_id);
    const floorReport = reconcileFloor(extractedKeys, projectType);
    const floorSet = new Set(floorReport.expected);
    const satisfiedSet = new Set(floorReport.satisfied);

    const trades = plan.map((p) => ({
      tradeKey: p.trade_id,
      label: p.trade_label || tradeLabel(p.trade_id),
      scopeLines: (p.scope_bullets || []).map((text) => ({
        text: String(text),
        confidence: HEURISTIC_TRADE_CONFIDENCE,
        sourceDocumentId: null,
        // Scope lines drive RFQ packages (consequential) → flag for human review by default.
        status: "extracted_flagged"
      })),
      exclusions: p.exclusions || [],
      questions: p.questions || [],
      source: mapSource(true, floorSet.has(p.trade_id)),
      confidence: HEURISTIC_TRADE_CONFIDENCE,
      floorStatus: floorSet.has(p.trade_id) ? "satisfied" : "n/a"
    }));

    // Surface floor trades the extractor MISSED as explicit confirm/deny suggestions —
    // never silently absent.
    for (const key of floorReport.missing) {
      trades.push({
        tradeKey: key,
        label: tradeLabel(key),
        scopeLines: [],
        exclusions: [],
        questions: [
          `Expected for project type "${projectType || "unknown"}" but not found in the tender documents — confirm whether this trade is in scope.`
        ],
        source: "floor",
        confidence: null,
        floorStatus: "expected_missing"
      });
    }

    return {
      runId: randomUUID(),
      tenantId: request.tenantId || null,
      jobRef: request.jobRef || null,
      projectType,
      trades,
      projectContext: processed.project_context || {},
      coverageGaps: processed.coverage_gaps || [],
      floorReport,
      // The deterministic pipeline does not yet produce learned priors; the redesigned
      // engine will populate this from the accuracy cascade.
      accuracyPriors: null
    };
  }

  /**
   * Feed ground truth back for learning. The Hub implementation currently RECORDS the
   * outcome (no model mutation yet) — the learning loop is specified in the agent prompt
   * (Outputs E/F/G) and built later. This is intentionally a safe no-op-with-receipt so
   * callers can wire the call sites now and the engine can start learning when swapped in.
   * @param {object} outcome - { tenantId, runId, signal, corrections?, finalTradeKeys?, estimateTradeKeys?, actualTradeKeys? }
   */
  async submitOutcome(outcome = {}) {
    const valid = new Set(["human_review", "final_rfq_set", "buildxact_estimate", "po_invoice"]);
    if (!outcome.runId || !valid.has(outcome.signal)) {
      return { accepted: false, error: "runId and a valid signal are required", learned: null };
    }
    // Recording stub — when the external engine is wired, this forwards to it.
    return {
      accepted: true,
      learned: { priorsUpdated: false, lexiconUpdated: false, metricsUpdated: false }
    };
  }
}

// ── Factory / swap-point ─────────────────────────────────────────────────────────
// The single place to change when the external engine is ready: branch on an env var
// (e.g. SCOPE_INTELLIGENCE_URL) and return an `ExternalScopeIntelligence` HTTP client
// instead. Hub callers only ever touch getScopeIntelligence().
let _instance = null;

export function getScopeIntelligence(deps) {
  if (deps) return new HubScopeIntelligence(deps); // explicit deps → fresh instance (route owns AI call)
  if (!_instance) _instance = new HubScopeIntelligence({});
  return _instance;
}
