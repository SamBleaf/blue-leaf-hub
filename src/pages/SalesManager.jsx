/**
 * SalesManager.jsx — Sales module top-level with tab routing.
 *
 * Tabs:
 *   Pipeline  → existing SalesPipeline content (inline)
 *   Contacts  → CRM Relationship Dashboard + Contacts list
 *
 * Route: /sales  (index) and /sales/:tab
 * NOTE: /sales/:leadId  is still handled by LeadDetail.jsx (separate route).
 * We distinguish: if param matches a known tab name, render tab. Otherwise
 * the App.jsx route for /sales/:leadId takes priority (it's a separate route).
 */

import { useNavigate, useLocation } from "react-router-dom";
import SalesPipeline from "./SalesPipeline.jsx";
import CrmDashboard from "../components/crm/CrmDashboard.jsx";
import CrmContacts from "../components/crm/CrmContacts.jsx";
import CrmPeople from "../components/crm/CrmPeople.jsx";

const TABS = [
  { id: "pipeline",   label: "Pipeline" },
  { id: "dashboard",  label: "CRM" },
  { id: "contacts",   label: "Contacts" },
];

const CRM_TABS = new Set(["dashboard", "contacts"]);

export default function SalesManager() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // App.jsx registers LITERAL routes (/sales/dashboard, /sales/contacts) with no `:tab`
  // param, so useParams().tab is always undefined. Derive the tab from the path's second
  // segment instead. Falls through to pipeline for anything unknown.
  const seg = pathname.split("/").filter(Boolean)[1] || "";
  const activeTab = CRM_TABS.has(seg) ? seg : "pipeline";

  function goTab(id) {
    if (id === "pipeline") navigate("/sales");
    else navigate(`/sales/${id}`);
  }

  // Pipeline tab: delegate entirely to SalesPipeline (it handles its own header)
  if (activeTab === "pipeline") {
    return (
      <div className="space-y-0">
        <SalesTabBar activeTab={activeTab} goTab={goTab} />
        <SalesPipeline />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <SalesTabBar activeTab={activeTab} goTab={goTab} />
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <CrmPeople />
          <div className="border-t border-hairline pt-6">
            <CrmDashboard />
          </div>
        </div>
      )}
      {activeTab === "contacts"  && <CrmContacts />}
    </div>
  );
}

function SalesTabBar({ activeTab, goTab }) {
  return (
    <div className="flex gap-1 rounded-lg bg-page p-1 w-fit mb-2">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => goTab(t.id)}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
            activeTab === t.id
              ? "bg-primary text-white"
              : "text-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
