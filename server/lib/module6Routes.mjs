/**
 * module6Routes.mjs — thin compatibility shim.
 *
 * The original 1,896-line monolith has been split into four focused modules:
 *   scheduleRoutes.mjs   — schedule tasks, templates, generate, analyse, baseline, EOT
 *   whsRoutes.mjs        — compliance docs, site reports, SWMS
 *   siteDiaryRoutes.mjs  — site diary save/get + AI transcript structuring
 *   operationsRoutes.mjs — enriched projects list, global tasks, trade conflicts
 *
 * dev-api.mjs still imports `registerModule6Routes` from here — no change needed there.
 */
import { registerScheduleRoutes } from "./scheduleRoutes.mjs";
import { registerWhsRoutes } from "./whsRoutes.mjs";
import { registerSiteDiaryRoutes } from "./siteDiaryRoutes.mjs";
import { registerOperationsRoutes } from "./operationsRoutes.mjs";

export function registerModule6Routes(app) {
  registerScheduleRoutes(app);
  registerWhsRoutes(app);
  registerSiteDiaryRoutes(app);
  registerOperationsRoutes(app);
}
