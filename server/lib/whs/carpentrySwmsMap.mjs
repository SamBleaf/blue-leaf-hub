// carpentrySwmsMap.mjs
// Maps a carpentry job's project_type → the WHS work categories that job involves, so the right SWMS
// AUTO-ATTACH with zero per-job data entry. SWMS are tagged with a work_category[] in swms_templates;
// a job is seeded with every active SWMS whose categories overlap this set. "general" (manual
// handling, electrical leads) applies to every carpentry job.
//
// This is the ONLY carpentry-specific mapping — the SWMS content itself lives once in the shared
// swms_templates library and is never re-authored per job.

const PROJECT_TYPE_WORK_CATEGORIES = {
  full_package: ["first_fix_framing", "cladding", "second_fix", "roofing"],
  frame:        ["first_fix_framing", "roofing"],
  lockup:       ["first_fix_framing", "cladding", "roofing"], // Lock-Up / Cladding
  fitoff:       ["second_fix"],                                // Fit-Off Only
  other:        [],
};

// Applies to every carpentry job regardless of type.
const ALWAYS_CATEGORIES = ["general"];

/** The work categories a job of this project_type involves (incl. the always-on "general"). */
export function workCategoriesForProjectType(projectType) {
  const base = PROJECT_TYPE_WORK_CATEGORIES[String(projectType || "").toLowerCase()] || [];
  return [...new Set([...base, ...ALWAYS_CATEGORIES])];
}

export { PROJECT_TYPE_WORK_CATEGORIES, ALWAYS_CATEGORIES };
