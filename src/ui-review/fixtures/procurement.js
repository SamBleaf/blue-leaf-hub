/** UI Review fixtures — Procurement Intelligence (review-only).
 * Matches the endpoints Procurement.jsx + ProcurementExtras.jsx actually call:
 * /command-centre (buckets), /jobs/:id/items (+ /missing-items), /selections/blockers,
 * /long-lead, /suppliers. The /api/procurement/:id wildcard is registered LAST so the exact
 * depth-2 routes (command-centre, suppliers, long-lead) are not shadowed (registry first-match-wins).
 */
import { route } from "../registry.js";

// ── Items (jobs/:id/items — Register/Calendar/Board) ──
const ITEMS = [
  { id: "pi-1", jobId: "job-1001", jobAddress: "5A Gibson Street, Marino SA", itemName: "Roof trusses", supplyType: "builder_supplied", requiredOnSiteDate: "2026-07-08", leadTimeDays: 28, orderByDate: "2026-06-20", supplierId: "ps-1", status: "approved", riskStatus: "critical", source: "template+estimate", costAllowance: 18500, approvedAmount: 18200, matchExisting: false, daysUntilOrderBy: -8 },
  { id: "pi-2", jobId: "job-1001", jobAddress: "5A Gibson Street, Marino SA", itemName: "Windows & doors", supplyType: "builder_supplied", requiredOnSiteDate: "2026-08-01", leadTimeDays: 28, orderByDate: "2026-07-04", supplierId: "ps-2", status: "quote_received", riskStatus: "at_risk", source: "estimate", costAllowance: 32000, approvedAmount: null, matchExisting: false, daysUntilOrderBy: 6 },
  { id: "pi-3", jobId: "job-1001", jobAddress: "5A Gibson Street, Marino SA", itemName: "Splashback tiles", supplyType: "pc_item", requiredOnSiteDate: "2026-08-20", leadTimeDays: 21, orderByDate: "2026-07-26", supplierId: null, status: "waiting_on_selection", riskStatus: "blocked", source: "template", costAllowance: 4200, approvedAmount: null, matchExisting: false, daysUntilOrderBy: 28 },
  { id: "pi-4", jobId: "job-1001", jobAddress: "5A Gibson Street, Marino SA", itemName: "Structural steel", supplyType: "builder_supplied", requiredOnSiteDate: "2026-09-10", leadTimeDays: 70, orderByDate: "2026-07-12", supplierId: "ps-3", status: "quote_requested", riskStatus: "watch", source: "estimate", costAllowance: 26000, approvedAmount: null, matchExisting: false, daysUntilOrderBy: 14 },
  { id: "pi-5", jobId: "job-1001", jobAddress: "5A Gibson Street, Marino SA", itemName: "Insulation", supplyType: "builder_supplied", requiredOnSiteDate: null, leadTimeDays: 14, orderByDate: null, supplierId: null, status: "not_started", riskStatus: "on_track", source: "template", costAllowance: 6100, approvedAmount: null, matchExisting: false, daysUntilOrderBy: null },
  { id: "pi-6", jobId: "job-1001", jobAddress: "5A Gibson Street, Marino SA", itemName: "Roof cladding", supplyType: "builder_supplied", requiredOnSiteDate: "2026-07-25", leadTimeDays: 21, orderByDate: "2026-07-01", supplierId: "ps-1", status: "po_sent", riskStatus: "on_track", source: "estimate", costAllowance: 14800, approvedAmount: 14800, matchExisting: false, daysUntilOrderBy: 3 },
];
const pick = (...ids) => ITEMS.filter((i) => ids.includes(i.id));

// ── Command Centre buckets (keys must match CC_SECTIONS in Procurement.jsx) ──
route("GET", "/api/procurement/command-centre", () => ({
  ok: true,
  totalActive: ITEMS.length,
  staleProjects: [],
  buckets: {
    overdue: pick("pi-1"),
    dueSoon: pick("pi-2", "pi-4"),
    selectionBlockers: pick("pi-3"),
    awaitingQuotes: pick("pi-4"),
    deliveryRisks: [],
    longLeadCriticals: pick("pi-4"),
    needsDate: pick("pi-5"),
  },
}));

route("GET", "/api/procurement/jobs/:jobId/items", () => ({ ok: true, items: ITEMS, committed: 33000, riskCounts: { critical: 1, at_risk: 1, blocked: 1, watch: 1, on_track: 2 } }));
route("GET", "/api/procurement/jobs/:jobId/missing-items", () => ({ ok: true, missing: [{ itemName: "Termite protection", frequency: 82 }, { itemName: "Stormwater connection", frequency: 67 }] }));
route("GET", "/api/procurement/selections/blockers", () => ({ ok: true, blockers: [
  { id: "pi-3", jobId: "job-1001", itemName: "Splashback tiles", riskStatus: "blocked", orderByDate: "2026-07-26", daysUntilOrderBy: 28, decision: { title: "Kitchen splashback selection", status: "awaiting_client" } },
] }));
route("GET", "/api/procurement/long-lead", () => ({ ok: true, items: pick("pi-4") }));
route("GET", "/api/procurement/suppliers", () => ({ ok: true, suppliers: [
  { id: "ps-1", name: "Truss & Roof Co", on_time_rate: 0.92, learned_lead_time_days: 27 },
  { id: "ps-2", name: "Stegbar Windows", on_time_rate: 0.84, learned_lead_time_days: 30 },
  { id: "ps-3", name: "SA Structural Steel", on_time_rate: 0.78, learned_lead_time_days: 68 },
] }));

// ── Legacy PO-list endpoints (kept; :id wildcard LAST so it never shadows the exact routes) ──
const POS = [
  { id: "po-1", po_number: "PO-1042", job_reference: "J1171", vendor: "Truss & Roof Co", trade: "Roofing", amount: 18200, status: "issued", required_by: "2026-07-05", created_at: "2026-06-18T00:00:00Z" },
  { id: "po-2", po_number: "PO-1043", job_reference: "J1171", vendor: "Stegbar Windows", trade: "Windows", amount: 32000, status: "draft", required_by: "2026-07-20", created_at: "2026-06-20T00:00:00Z" },
];
route("GET", "/api/procurement", () => ({ ok: true, purchaseOrders: POS, summary: { draft: 1, issued: 1, received: 0, committed: 50200 } }));
route("GET", "/api/procurement/purchase-orders", () => ({ ok: true, purchaseOrders: POS }));
route("GET", "/api/purchase-orders", () => ({ ok: true, purchaseOrders: POS }));
route("GET", "/api/procurement/:id", ({ params }) => ({ ok: true, purchaseOrder: POS.find((p) => p.id === params.id) || POS[0] }));
