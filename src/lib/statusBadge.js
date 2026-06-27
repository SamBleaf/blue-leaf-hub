/**
 * statusToVariant — map a raw app status string to a StatusBadge variant.
 *
 * Kept in a plain lib module (not the component file) so StatusBadge.jsx exports
 * ONLY its component (react-refresh/only-export-components). Keys are existing app
 * status values (lowercased) — they mirror values in src/lib/constants.js
 * (LEAD_STAGES, DOC_STATUSES, TIMESHEET_STATUSES, PROJECT_STATUSES, CRM_STATUS);
 * no new status strings are introduced.
 */
const STATUS_VARIANT = {
  won: "success", paid: "success", approved: "success", complete: "success", completed: "success",
  active: "success", on_track: "success", signed: "success",
  pending: "warning", watch: "warning", awaiting_client: "warning", in_review: "warning", partially_paid: "warning",
  issued: "info", invoiced: "info", sent_to_client: "info", upcoming: "info",
  overdue: "danger", delayed: "danger", rejected: "danger", void: "danger", disputed: "danger", lost: "danger",
  blocked: "blocked",
  inactive: "neutral", nurture: "neutral", draft: "neutral", withdrawn: "neutral",
};

export function statusToVariant(status) {
  return STATUS_VARIANT[String(status || "").toLowerCase()] || "neutral";
}
