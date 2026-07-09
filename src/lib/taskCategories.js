// Workforce timesheet task categories — the labels a worker logs their hours against.
// Shared by Workforce.jsx (Approvals/History/Mass Fill) and the TimesheetDetailModal so the
// category display stays in one place. NOT the same set as carpentry site-task categories.
export const TASK_LABELS = {
  first_fix_framing:    "First fix / framing",
  cladding:             "Cladding",
  second_fix:           "Second fix",
  outdoor_works:        "Outdoor works",
  formwork_slab_prep:   "Formwork / slab prep",
  site_labouring:       "Site labouring",
  site_cleanup:         "Site cleanup",
  supervision:          "Supervision",
  other:                "Other",
};

export const TASK_OPTIONS = Object.entries(TASK_LABELS).map(([value, label]) => ({ value, label }));
