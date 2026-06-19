// Worker completion-photo helpers — Supabase Storage, private "site-media" bucket (migration 099).
//
// Photos are stored as OBJECTS in the bucket; the DB column (site_tasks.completion_photo_url /
// timesheet_entries.completion_photo_url) holds the object PATH only — never base64, never a URL.
// The office reads photos via short-lived signed URLs attached as a SEPARATE field
// (completion_photo_signed_url) so the canonical path is never overwritten (a resubmit that POSTed a
// signed URL back would otherwise corrupt the stored path).

export const SITE_MEDIA_BUCKET = "site-media";

// LAW 5 path: [bucket]/[entity_type]/[entity_id]/[YYYY-MM-DD]-[sanitised-filename].
// Explicit, hyphenated entity segments (NOT `${entityType}s`, which would yield "timesheet_entrys").
export const PHOTO_ENTITY_DIR = {
  site_task: "site-tasks",
  timesheet_entry: "timesheet-entries",
};

export function sanitisePhotoFilename(name) {
  const clean = String(name || "photo.jpg")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (clean || "photo.jpg").slice(-60);
}

// Collision-proof object key (date + random suffix) so two photos with the same camera filename on
// the same day for the same entity never overwrite each other.
export function buildPhotoPath(entityType, entityId, filename, rand) {
  const dir = PHOTO_ENTITY_DIR[entityType];
  if (!dir || !entityId) return null;
  const date = new Date().toISOString().slice(0, 10);
  const suffix = rand || Math.random().toString(36).slice(2, 8);
  return `${dir}/${entityId}/${date}-${suffix}-${sanitisePhotoFilename(filename)}`;
}

// Returns true if a stored value is a real object path (not legacy base64 / an http URL).
export function isStoragePath(value) {
  return typeof value === "string" && value.length > 0 && !/^https?:/i.test(value) && !/^data:/i.test(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

// A persisted completion_photo_url must be a bare object key: known entity dir, no scheme, no "..",
// exactly dir/entityId/filename. Guards the DB column against URLs / junk / path traversal.
export function isValidPhotoKey(value) {
  if (!isStoragePath(value)) return false;
  const v = value.trim();
  if (v.includes("..")) return false;
  return /^(site-tasks|timesheet-entries)\/[^/]+\/[^/]+$/.test(v);
}

// Mutates each row: if completion_photo_url is a storage path, attach completion_photo_signed_url
// (1h). Leaves the canonical path untouched. Legacy base64/http values pass through unsigned.
export async function signSiteTaskPhotos(sb, rows) {
  for (const r of rows || []) {
    if (r && isStoragePath(r.completion_photo_url)) {
      try {
        const { data } = await sb.storage.from(SITE_MEDIA_BUCKET).createSignedUrl(r.completion_photo_url, 3600);
        if (data?.signedUrl) r.completion_photo_signed_url = data.signedUrl;
      } catch { /* best-effort: leave unsigned */ }
    }
  }
  return rows;
}
