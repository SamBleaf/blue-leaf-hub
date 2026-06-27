/** UI Review fixtures — Client Portal v2 (home/actions/journey/selections/documents/messages). Review-only. */
import { route } from "../registry.js";

const PROJECT = { id: "portal-proj-1", address: "5A Gibson Street, Marino SA", client_name: "Olivia & Marcus Reed", stage: "frame", progress_pct: 42, builder: "Blue Leaf Building" };

// Project resolution — the layout's useClientPortalProject hook calls these two.
route("GET", "/api/portal/my-projects", () => ({
  ok: true,
  projects: [{ projectId: PROJECT.id, portalV2Enabled: true, address: PROJECT.address, client_name: PROJECT.client_name, status: "active" }],
}));
route("GET", "/api/portal/app/:projectId/session", ({ params }) => ({
  ok: true,
  session: {
    projectId: params.projectId, project: PROJECT, portalV2Enabled: true,
    client: { name: "Olivia Reed", email: "client@uireview.local" },
    unread_messages: 1, outstanding_actions: 2,
  },
}));
route("GET", "/api/portal/app/:projectId", () => ({ ok: true, project: PROJECT }));

// Home — ClientHome reads data.home
route("GET", "/api/portal/app/:projectId/home", () => ({
  ok: true,
  home: {
    clientName: "Olivia Reed",
    address: "5A Gibson Street, Marino SA",
    buildPhase: "construction",
    progressPct: 42,
    currentStage: { label: "Frame", confidence: "on_track", confidenceNote: "On track — frame inspection booked for 8 July.", eta: "2026-07-08" },
    nextMilestone: "Frame inspection",
    latestUpdate: { headline: "Roof trusses craned in this week — weathertight by mid-July." },
    nextAction: { title: "Approve the kitchen benchtop selection" },
    financial: { contractValue: 845000, approvedVariations: 12500, pendingVariations: 3200, claimsPaid: 211250, claimsOutstanding: 143650, currentContractTotal: 857500 },
  },
}));
route("GET", "/api/portal/app/:projectId/updates", () => ({ ok: true, updates: [
  { id: "u1", title: "Frame going up", body: "Roof trusses craned in this week.", date: "2026-06-20", photos: 3 },
  { id: "u2", title: "Slab poured", body: "Slab poured and cured — on schedule.", date: "2026-04-02", photos: 2 },
] }));

// Actions / decisions
route("GET", "/api/portal/app/:projectId/actions", () => ({ ok: true, actions: [
  { id: "ac1", title: "Approve stone benchtop selection", type: "selection", due_date: "2026-07-01", status: "open" },
  { id: "ac2", title: "Sign variation VO-02 (rear window)", type: "variation", amount: 3200, due_date: "2026-07-03", status: "open" },
  { id: "ac3", title: "Confirm tiling colour", type: "selection", status: "done" },
] }));
route("GET", "/api/portal/app/:projectId/decisions", () => ({ ok: true, decisions: [
  { id: "dc1", title: "Stone benchtops vs laminate", status: "pending", options: ["Stone (+$12,500)", "Laminate (incl.)"] },
] }));

// Journey / timeline
route("GET", "/api/portal/app/:projectId/journey", () => ({ ok: true, milestones: [
  { id: "m1", key: "deposit", label: "Deposit & contract", status: "complete", date: "2026-03-01" },
  { id: "m2", key: "slab", label: "Slab", status: "complete", date: "2026-03-28" },
  { id: "m3", key: "frame", label: "Frame", status: "in_progress", date: "2026-05-10" },
  { id: "m4", key: "lock_up", label: "Lock-up", status: "upcoming", date: "2026-06-15" },
  { id: "m5", key: "fixing", label: "Fit-out", status: "upcoming", date: "2026-09-30" },
  { id: "m6", key: "handover", label: "Handover", status: "upcoming", date: "2026-11-20" },
] }));
route("GET", "/api/portal/app/:projectId/timeline", () => ({ ok: true, milestones: [] }));

// Selections
route("GET", "/api/portal/app/:projectId/selections", () => ({ ok: true, selections: [
  { id: "sel1", category: "Kitchen benchtop", status: "pending", due_date: "2026-07-01", options: [
    { id: "o1", label: "Caesarstone Cloudburst", price_delta: 0 }, { id: "o2", label: "Natural granite", price_delta: 12500 },
  ] },
  { id: "sel2", category: "Floor tiles", status: "confirmed", chosen: "Matte porcelain 600x600" },
  { id: "sel3", category: "Tapware finish", status: "pending", options: [{ id: "o3", label: "Brushed nickel", price_delta: 0 }, { id: "o4", label: "Matte black", price_delta: 850 }] },
] }));

// Documents
route("GET", "/api/portal/app/:projectId/documents", () => ({ ok: true, documents: [
  { id: "pd1", name: "Signed building contract.pdf", category: "contract", date: "2026-03-01" },
  { id: "pd2", name: "Colour selections schedule.pdf", category: "selections", date: "2026-05-12" },
  { id: "pd3", name: "Progress claim 3.pdf", category: "invoice", date: "2026-06-18" },
] }));

// Messages
route("GET", "/api/portal/app/:projectId/messages", () => ({ ok: true, messages: [
  { id: "msg1", from: "builder", author: "Dana (Blue Leaf)", body: "Hi Olivia — frame inspection is booked for 8 July. We'll send photos after.", created_at: "2026-06-20T05:00:00Z" },
  { id: "msg2", from: "client", author: "Olivia", body: "Wonderful, thank you! Looking forward to seeing it.", created_at: "2026-06-20T06:30:00Z" },
  { id: "msg3", from: "builder", author: "Dana (Blue Leaf)", body: "Quick one — can you confirm the benchtop choice by 1 July so we keep cabinetry on track?", created_at: "2026-06-21T01:00:00Z" },
] }));
route("GET", "/api/portal/app/:projectId/claims", () => ({ ok: true, claims: [
  { id: "cl1", stage: "Frame", amount: 143650, status: "issued", due_date: "2026-07-02", payment_instructions: "BSB 105-001 Acc 1234 5678" },
] }));
route("GET", "/api/portal/app/:projectId/budget", () => ({ ok: true, contract_value: 845000, approved_variations: 12500, claimed_to_date: 355000 }));
