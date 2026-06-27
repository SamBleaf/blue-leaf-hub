/** UI Review fixtures — Procurement (purchase orders) (review-only). */
import { route } from "../registry.js";

const POS = [
  { id: "po-1", po_number: "PO-1042", job_reference: "J1171", vendor: "SA Concreting", trade: "Concrete & Footings", amount: 41200, status: "issued", required_by: "2026-07-05", created_at: "2026-06-18T00:00:00Z" },
  { id: "po-2", po_number: "PO-1043", job_reference: "J1171", vendor: "Apex Roofing", trade: "Roof Plumbing", amount: 28800, status: "draft", required_by: "2026-07-20", created_at: "2026-06-20T00:00:00Z" },
  { id: "po-3", po_number: "PO-1041", job_reference: "J1120", vendor: "Volt Electrical", trade: "Electrical", amount: 36500, status: "received", required_by: "2026-06-28", created_at: "2026-06-10T00:00:00Z" },
];
route("GET", "/api/procurement", () => ({ ok: true, purchaseOrders: POS, summary: { draft: 1, issued: 1, received: 1, committed: 106500 } }));
route("GET", "/api/procurement/purchase-orders", () => ({ ok: true, purchaseOrders: POS }));
route("GET", "/api/purchase-orders", () => ({ ok: true, purchaseOrders: POS }));
route("GET", "/api/procurement/:id", ({ params }) => ({ ok: true, purchaseOrder: POS.find((p) => p.id === params.id) || POS[0] }));
