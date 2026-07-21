// Resolve a completion-photo URL from a row that may carry a signed storage URL (newer,
// site_tasks) or an inline data: URL (legacy hours flow / charge-up shifts). Snake or camel.
// Shared by the charge-up detail + timesheet detail surfaces so photo handling stays in one place.
export function mediaUrl(row) {
  if (!row) return null;
  if (row.completion_photo_signed_url) return row.completion_photo_signed_url;
  if (row.completionPhotoSignedUrl) return row.completionPhotoSignedUrl;
  const raw = row.completion_photo_url ?? row.completionPhotoUrl;
  if (typeof raw === "string" && raw.startsWith("data:")) return raw;
  if (typeof raw === "string" && /^https?:\/\//.test(raw)) return raw;
  return null;
}
