/** UI Review fixtures — CRM Relationships / Contacts / Mailing Lists (review-only). */
import { route } from "../registry.js";

const CONTACTS = [
  { id: "crm-1", firstName: "Helen", lastName: "Whitfield", email: "helen@whitfieldarch.com.au", phone: "0412 345 678", contactType: "architect", status: "active", relationshipScore: 82, nextActionType: "call", nextActionDueDate: "2026-06-26", lastContactDate: "2026-06-10", referralCount: 3, referralJobValue: 2400000, createdAt: "2025-11-01T00:00:00Z" },
  { id: "crm-2", firstName: "Marcus", lastName: "Denberger", email: "marcus@denbergerbuilt.com.au", phone: "0423 456 789", contactType: "developer", status: "client", relationshipScore: 91, nextActionType: "email", nextActionDueDate: "2026-06-28", lastContactDate: "2026-06-20", referralCount: 1, referralJobValue: 845000, createdAt: "2026-01-15T00:00:00Z" },
  { id: "crm-3", firstName: "Priya", lastName: "Nadkarni", email: "priya.n@gmail.com", phone: "0434 567 890", contactType: "prospect", status: "new", relationshipScore: 45, nextActionType: "meeting", nextActionDueDate: "2026-07-02", lastContactDate: "2026-06-18", referralCount: 0, referralJobValue: 0, createdAt: "2026-06-01T00:00:00Z" },
  { id: "crm-4", firstName: "James", lastName: "Holloway", email: "james.h@outlook.com", contactType: "past_client", status: "past_client", relationshipScore: 68, nextActionType: "none", nextActionDueDate: null, lastContactDate: "2026-03-01", referralCount: 0, referralJobValue: 0, createdAt: "2024-08-10T00:00:00Z" },
];

const LISTS = [
  { id: "list-1", name: "Past clients — quarterly touch", description: "Warm check-in list", listType: "manual", memberCount: 24, activeMembers: 24, createdAt: "2026-01-10T00:00:00Z" },
  { id: "list-2", name: "Architects & designers", description: "Smart list — referrers", listType: "smart", memberCount: 18, activeMembers: 18, createdAt: "2026-02-01T00:00:00Z" },
];

route("GET", "/api/crm/dashboard", () => ({
  ok: true,
  actionContacts: CONTACTS.filter((c) => c.nextActionDueDate && c.nextActionType !== "none"),
  topRelationships: [...CONTACTS].sort((a, b) => b.relationshipScore - a.relationshipScore),
  health: { overdueActions: 1, noContactOver90: 2, newThisMonth: 4, activeProspects: 12, futurePipeline: 6 },
  speedToLeadHours: 2.4,
}));

route("GET", "/api/crm/contacts", () => ({
  ok: true,
  contacts: CONTACTS,
  total: CONTACTS.length,
}));

route("GET", "/api/crm/contacts/:id", ({ params }) => ({
  ok: true,
  contact: CONTACTS.find((c) => c.id === params.id) || CONTACTS[0],
  interactions: [
    { id: "int-1", type: "call", notes: "Discussed Glenelg extension timeline.", createdAt: "2026-06-18T02:00:00Z" },
  ],
  listMemberships: [{ listId: "list-1", listName: "Past clients — quarterly touch" }],
}));

route("GET", "/api/crm/lists", () => ({ ok: true, lists: LISTS }));

route("GET", "/api/crm/lists/:id", ({ params }) => ({
  ok: true,
  list: LISTS.find((l) => l.id === params.id) || LISTS[0],
  members: CONTACTS.slice(0, 3).map((c) => ({
    id: `m-${c.id}`, contactId: c.id, crmContacts: c, subscribedAt: "2026-01-15T00:00:00Z", consentStatus: "granted",
  })),
}));

route("GET", "/api/crm/lists/:id/sends", () => ({
  ok: true,
  sends: [
    { id: "send-1", subject: "Spring project update", status: "sent", sentAt: "2026-05-20T01:00:00Z", recipientCount: 24, deliveredCount: 23, openedCount: 14 },
  ],
}));

route("GET", "/api/crm/search", () => ({ ok: true, contacts: CONTACTS.slice(0, 2), leads: [] }));
