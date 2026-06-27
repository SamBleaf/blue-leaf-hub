/** UI Review fixtures — Tender board, RFQ packages, subcontractors, cost intelligence (review-only). */
import { route } from "../registry.js";

const JOBS = [
  { id: "job-1003", reference: "J1185", address: "2 Forrest Ave, Marino SA", client_name: "Forrest Extension", status: "tendering", created_at: "2026-06-01T00:00:00Z", extracted_data: { project_type: "extension", storeys: "2", floor_area_m2: 210, key_project_notes: "Two-storey rear extension; master suite + open-plan living." } },
  { id: "job-1006", reference: "J1190", address: "9 Esplanade, Seacliff SA", client_name: "Marlow New Build", status: "tendering", created_at: "2026-06-08T00:00:00Z", extracted_data: { project_type: "new_home", storeys: "2", floor_area_m2: 320 } },
];
route("GET", "/api/tender/jobs", () => ({ ok: true, jobs: JOBS }));
route("GET", "/api/jobs/:id", ({ params }) => ({ ok: true, job: JOBS.find((j) => j.id === params.id) || JOBS[0] }));

const PACKAGES = [
  { id: "pkg-1", job_id: "job-1003", project_address: "2 Forrest Ave, Marino SA", project_type: "extension", tender_deadline: "2026-07-18", created_at: "2026-06-10T00:00:00Z", trade_count: 9, sent_count: 7, received_count: 4, status: "in_progress" },
  { id: "pkg-2", job_id: "job-1006", project_address: "9 Esplanade, Seacliff SA", project_type: "new_home", tender_deadline: "2026-07-25", created_at: "2026-06-14T00:00:00Z", trade_count: 14, sent_count: 14, received_count: 9, status: "in_progress" },
];
route("GET", "/api/rfq-packages", () => ({ ok: true, packages: PACKAGES }));
route("GET", "/api/rfq-packages/:packageId", ({ params }) => ({
  ok: true,
  package: PACKAGES.find((p) => p.id === params.packageId) || PACKAGES[0],
  trades: [
    { trade_id: "excavation", trade_label: "Excavation", recipients: [{ business_name: "Coastline Earthworks", email: "x@uireview.local", status: "received", quote_amount: 28500 }], scope_bullets: ["Bulk excavation to RL", "Cart away spoil"] },
    { trade_id: "concrete_footings", trade_label: "Concrete & Footings", recipients: [{ business_name: "SA Concreting", email: "x@uireview.local", status: "sent" }], scope_bullets: ["Strip footings", "Slab on ground"] },
    { trade_id: "carpentry", trade_label: "Carpentry", recipients: [{ business_name: "Denberger Built", email: "x@uireview.local", status: "received", quote_amount: 132400 }], scope_bullets: ["Frame supply + erect", "First + second fix"] },
  ],
}));

// Tender board RFQ rows for a job (TenderDetail)
route("GET", "/api/tender/:jobId/rfqs", () => ({ ok: true, rfqs: [
  { id: "rfq-1", trade: "Excavation", status: "received", subcontractors: { business_name: "Coastline Earthworks", contact: "Joe", email: "x@uireview.local" }, quote_amount: 28500, sent_at: "2026-06-12T00:00:00Z", deadline: "2026-07-18" },
  { id: "rfq-2", trade: "Carpentry", status: "accepted", subcontractors: { business_name: "Denberger Built", contact: "Rhys", email: "x@uireview.local" }, quote_amount: 132400, sent_at: "2026-06-12T00:00:00Z", deadline: "2026-07-18" },
  { id: "rfq-3", trade: "Roof Plumbing", status: "sent", subcontractors: { business_name: "Apex Roofing", contact: "Dan", email: "x@uireview.local" }, quote_amount: null, sent_at: "2026-06-12T00:00:00Z", deadline: "2026-07-18" },
] }));

const SUBS = ["Coastline Earthworks", "SA Concreting", "Denberger Built", "Apex Roofing", "Volt Electrical", "FlowState Plumbing", "Glasshouse Glazing", "Precision Tiling"].map((business_name, i) => ({
  id: `sub-${i + 1}`, business_name, trade: ["excavation", "concrete_footings", "carpentry", "roof_plumber", "electrical_data", "plumbing", "glazing", "tiling"][i],
  contact: "Site Contact", email: `sub${i + 1}@uireview.local`, phone: "0400 111 2" + i, rating: 4 + (i % 2) * 0.5, rfq_count: 3 + i, avg_quote: 25000 + i * 9000,
}));
route("GET", "/api/subcontractors", () => ({ ok: true, subcontractors: SUBS }));

route("GET", "/api/cost-intelligence", () => ({ ok: true, trades: SUBS.map((s) => ({ trade: s.trade, low: s.avg_quote * 0.85, median: s.avg_quote, high: s.avg_quote * 1.2, sample: s.rfq_count })) }));
route("GET", "/api/fee-proposals", () => ({ ok: true, feeProposals: [
  { id: "fp-1", job_address: "2 Forrest Ave, Marino SA", client_name: "Forrest Extension", status: "draft", total: 24500, created_at: "2026-06-16T00:00:00Z" },
  { id: "fp-2", job_address: "9 Esplanade, Seacliff SA", client_name: "Marlow New Build", status: "sent", total: 31200, created_at: "2026-06-18T00:00:00Z" },
] }));
