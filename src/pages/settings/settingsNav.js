// Single source of truth for the Settings hub: drives both the left rail
// (SettingsLayout) and each category page's composition (SettingsCategory).
//
// Each sub has:
//   id    — anchor id / section key (matches Settings.jsx section keys, or the
//           component-pane key used in SettingsCategory's COMPONENT_MAP)
//   label — rail link text
//   kind  — "section" (rendered via <Settings sections={[...]}/>) or
//           "component" (a standalone component, mapped in SettingsCategory)
//   roles — omit for admin-only; set ["admin","supervisor"] to also allow supervisor
export const SETTINGS_NAV = [
  {
    cat: "general",
    label: "General",
    subs: [
      { id: "company", label: "Company", kind: "section" },
      { id: "purchase-orders", label: "Purchase orders", kind: "section" },
      { id: "email-signature", label: "Email signature", kind: "section" },
      { id: "notifications", label: "Notifications", kind: "section" },
      { id: "enquiry-ack", label: "Enquiry auto-reply", kind: "component" },
      { id: "qualify-email", label: "Qualify emails", kind: "component" },
      { id: "discovery-email", label: "Discovery emails", kind: "component" },
      { id: "concept-email", label: "Concept emails", kind: "component" },
      { id: "tender-email", label: "Tender emails", kind: "component" },
      { id: "invoice-email", label: "Invoice email", kind: "component" },
      { id: "pipeline-email", label: "Pipeline emails (PTSA, Won, nurture)", kind: "component" },
    ],
  },
  {
    cat: "team",
    label: "Team & access",
    subs: [
      { id: "users", label: "Users", kind: "component" },
      { id: "employees", label: "Employees", kind: "component" },
      { id: "workforce-rules", label: "Workforce rules", kind: "section", roles: ["admin", "supervisor"] },
    ],
  },
  {
    cat: "integrations",
    label: "Integrations",
    subs: [
      { id: "mail", label: "Mail", kind: "section" },
      { id: "dropbox", label: "Dropbox", kind: "section" },
      { id: "buildexact", label: "Buildexact", kind: "section" },
      { id: "google", label: "Google", kind: "section" },
      { id: "meta", label: "Meta", kind: "section" },
      { id: "resend", label: "Resend", kind: "section" },
      { id: "xero", label: "Xero", kind: "component" },
    ],
  },
  {
    cat: "modules",
    label: "Modules & templates",
    subs: [
      { id: "templates", label: "Templates", kind: "component" },
      { id: "swms-library", label: "WHS / SWMS Library", kind: "component", roles: ["admin", "supervisor"] },
      { id: "cost-model", label: "Tender & cost model", kind: "component" },
      { id: "marketing", label: "Marketing", kind: "component" },
      { id: "field-app", label: "Field app", kind: "component", roles: ["admin", "supervisor"] },
    ],
  },
  {
    cat: "usage",
    label: "Usage & data",
    subs: [
      { id: "ai-usage", label: "AI usage & cost", kind: "component" },
      { id: "data-cleanup", label: "Data cleanup", kind: "component" },
      { id: "role-preview", label: "Role preview", kind: "section" },
    ],
  },
  {
    cat: "account",
    label: "Account",
    subs: [
      { id: "profile", label: "My profile", kind: "component", roles: ["admin", "supervisor"] },
    ],
  },
];
