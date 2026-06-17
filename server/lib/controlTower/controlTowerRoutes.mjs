/**
 * controlTowerRoutes.mjs — HUB TOWER (Control Tower) API surface.
 *
 * Phase 0: foundation only. No dashboard, no intelligence endpoints, no
 * autonomous actions, no business-table writes. The single endpoint here just
 * reports whether the read-only data layer is wired — it returns NO business
 * data.
 *
 * Every route is director-only: requireAuth + requireRole("admin").
 *
 * Future phases (see CONTROL_TOWER_DATA_LAYER_PROPOSAL.md §9) add health scores,
 * the daily director brief, procurement forecasting, and the approval queue —
 * all read-only against business data, writing only to ct_findings /
 * ct_action_queue via ctData.mjs.
 */

import { ok } from "../apiResponse.mjs";
import { requireAuth, requireRole } from "../requireAuth.mjs";
import { controlTowerConfigured, controlTowerMissingEnv } from "./ctData.mjs";

export function registerControlTowerRoutes(app) {
  /**
   * GET /api/control-tower/status
   * Director-only. Confirms the module is mounted and whether the read-only
   * data layer (control_tower_ro role JWT) is configured. Returns no business
   * data — safe by design.
   */
  app.get(
    "/api/control-tower/status",
    requireAuth,
    requireRole("admin"),
    (_req, res) => {
      const configured = controlTowerConfigured();
      return ok(res, {
        controlTower: {
          phase: 0,
          mounted: true,
          dataLayerConfigured: configured,
          // Names only — never values.
          missingEnv: configured ? [] : controlTowerMissingEnv(),
          writableTables: ["ct_findings", "ct_action_queue"],
          capabilities: {
            reads: "read-only (control_tower_ro role)",
            writes: "ct_findings + ct_action_queue only",
            autonomousActions: false,
            businessTableWrites: false,
          },
        },
      });
    }
  );

  // Phase 1+ endpoints (health scores, brief, forecast, approval queue) are
  // intentionally NOT defined yet. Adding them is the next approval gate.
}
