/** UI Review fixtures — Sales pipeline + lead detail (review-only). */
import { route } from "../registry.js";

const STAGES = ["enquiry", "qualify", "discovery", "winning_offer", "fee_proposal", "accepted", "tender", "won"];

// One lead per stage so the pipeline shows a populated column at every APB stage.
const LEADS = STAGES.map((stage, i) => ({
  id: `lead-${i + 1}`,
  name: ["Olivia & Marcus Reed", "The Whitfield Family", "Priya Nadkarni", "James & Eva Holloway",
         "Sandhurst Developments", "Theo Castellano", "Bayside Property Co", "Anneke Visser"][i],
  first_name: ["Olivia", "Tom", "Priya", "James", "Sandhurst", "Theo", "Bayside", "Anneke"][i],
  last_name: ["Reed", "Whitfield", "Nadkarni", "Holloway", "Developments", "Castellano", "Property Co", "Visser"][i],
  email: `lead${i + 1}@uireview.local`,
  phone: "0400 000 0" + String(i).padStart(2, "0"),
  stage,
  suburb: ["Brighton", "Somerton Park", "Glenelg", "Henley Beach", "Mitcham", "Unley", "Hove", "Stirling"][i],
  site_address: `${10 + i} Seaview Tce, ${["Brighton", "Somerton Park", "Glenelg", "Henley Beach", "Mitcham", "Unley", "Hove", "Stirling"][i]} SA`,
  project_type: ["new_home", "extension", "renovation", "new_home", "extension", "renovation", "new_home", "extension"][i],
  estimated_value: 450000 + i * 85000,
  floor_area_estimate: 180 + i * 20,
  design_stage: ["concept", "concept", "da_approved", "da_approved", "construction_drawings", "construction_drawings", "construction_drawings", "construction_drawings"][i],
  qualify_budget: i % 3, qualify_timeframe: (i + 1) % 3, qualify_site: (i + 2) % 3, qualify_decision_maker: i % 3,
  qualify_score: Math.min(8, 2 + i),
  desired_start_date: "2026-09-15",
  next_action_date: "2026-07-05",
  created_at: "2026-05-1" + (i % 9) + "T03:00:00Z",
  updated_at: "2026-06-2" + (i % 9) + "T03:00:00Z",
}));

route("GET", "/api/sales/pipeline-stages", () => ({ ok: true, stages: STAGES.map((id, i) => ({ id, label: id.replace(/_/g, " "), sort_order: i })) }));
route("GET", "/api/sales/leads", () => ({ ok: true, leads: LEADS, total: LEADS.length }));
route("GET", "/api/sales/leads/:id", ({ params }) => {
  const lead = LEADS.find((l) => l.id === params.id) || LEADS[0];
  return { ok: true, lead };
});
route("GET", "/api/sales/leads/:id/notes", () => ({ ok: true, notes: [
  { id: "n1", body: "Met on site — keen on a double-storey rear extension, budget confirmed.", created_at: "2026-06-18T01:00:00Z", author_name: "Dana Director" },
  { id: "n2", body: "Sent winning-offer pack; following up Friday.", created_at: "2026-06-20T05:00:00Z", author_name: "Dana Director" },
] }));
route("GET", "/api/sales/leads/:id/documents", () => ({ ok: true, documents: [
  { id: "d1", filename: "site-survey.pdf", document_type: "survey", mime_type: "application/pdf", created_at: "2026-06-12T00:00:00Z" },
  { id: "d2", filename: "concept-plans.pdf", document_type: "brief", mime_type: "application/pdf", created_at: "2026-06-14T00:00:00Z" },
] }));
route("GET", "/api/sales/leads/:id/conversations", () => ({ ok: true, conversations: [
  { id: "c1", title: "Discovery call", created_at: "2026-06-15T02:00:00Z", applied_at: "2026-06-15T02:30:00Z", bp_suggestions: { summary: "Strong budget + site owned; advance to winning offer." } },
] }));
route("GET", "/api/sales/leads/:id/activities", () => ({ ok: true, activities: [
  { id: "a1", type: "call", note: "Intro call", created_at: "2026-06-10T00:00:00Z" },
  { id: "a2", type: "meeting", note: "Site walk-through", created_at: "2026-06-15T00:00:00Z" },
] }));
route("POST", "/api/blueprint/chat", () => ({ ok: true, reply: "**Blueprint (review mode):** This lead scores well on budget and site control — prioritise the winning-offer presentation and lock a fee-proposal date this week." }));
