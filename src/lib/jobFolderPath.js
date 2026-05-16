/** Matches server `sanitizeJobFolderDisplayName` (PROJECTS job folder name). */
export function sanitizeJobFolderDisplayName(address) {
  let s = String(address || "")
    .replace(/[^A-Za-z0-9 ,]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!s) s = "UNSPECIFIED JOB";
  if (s.length > 60) s = s.slice(0, 60).replace(/[\s,]+$/, "");
  return s || "UNSPECIFIED JOB";
}

export const DROPBOX_PROJECTS_JOB_PREFIX = "/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING";

export function jobProjectsInternalPath(address) {
  const seg = sanitizeJobFolderDisplayName(address);
  return `${DROPBOX_PROJECTS_JOB_PREFIX}/${seg}/INTERNAL`;
}
