// googleapis is a very large package whose cold import takes ~10s+ — load it lazily so it never
// blocks API server startup. Only the actual Drive calls below need it.
import { Readable } from "stream";

let _google = null;
async function getGoogle() {
  if (!_google) ({ google: _google } = await import("googleapis"));
  return _google;
}

async function driveOAuth2Client() {
  const cid = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const cs = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const rt = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!cid || !cs || !rt) return null;
  const redirect = process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim() || "http://localhost:8787/auth/drive/callback";
  const google = await getGoogle();
  const oauth2 = new google.auth.OAuth2(cid, cs, redirect);
  oauth2.setCredentials({ refresh_token: rt });
  return oauth2;
}

// Ready-to-use Drive v3 client (null when not configured) — centralises the lazy googleapis load.
async function driveService() {
  const auth = await driveOAuth2Client();
  if (!auth) return null;
  const google = await getGoogle();
  return google.drive({ version: "v3", auth });
}

export function driveConfigured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim()
  );
}

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

/**
 * Upload a DOCX buffer to Google Drive.
 * - Places the file in GOOGLE_DRIVE_FOLDER_ID if set, otherwise My Drive root.
 * - Converts to Google Docs format so it's editable (and exportable as PDF).
 * Returns { fileId, editUrl }.
 */
export async function uploadDocxToDrive(filename, docxBuffer) {
  const drive = await driveService();
  if (!drive) throw new Error("Google Drive not configured (missing GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN). Run: npm run auth:drive");
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null;
  const fileMetadata = {
    name: filename.replace(/\.docx$/i, ""),
    mimeType: "application/vnd.google-apps.document",
    ...(folderId ? { parents: [folderId] } : {})
  };
  const media = {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    body: bufferToStream(docxBuffer)
  };
  const res = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id,webViewLink"
  });
  const fileId = res.data.id;
  const editUrl = `https://docs.google.com/document/d/${fileId}/edit`;
  return { fileId, editUrl, webViewLink: res.data.webViewLink || editUrl };
}

/**
 * Upload CSV and convert it into an editable Google Sheet.
 * Returns { fileId, editUrl }.
 */
export async function uploadCsvToSheet(filename, csvText) {
  const drive = await driveService();
  if (!drive) throw new Error("Google Drive not configured (missing GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN). Run: npm run auth:drive");
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null;
  const fileMetadata = {
    name: filename.replace(/\.csv$/i, ""),
    mimeType: "application/vnd.google-apps.spreadsheet",
    ...(folderId ? { parents: [folderId] } : {})
  };
  const media = {
    mimeType: "text/csv",
    body: bufferToStream(Buffer.from(csvText, "utf8"))
  };
  const res = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id,webViewLink"
  });
  const fileId = res.data.id;
  const editUrl = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
  return { fileId, editUrl, webViewLink: res.data.webViewLink || editUrl };
}

/**
 * Export a Google Drive file as a PDF buffer.
 */
export async function exportDriveFileAsPdf(fileId) {
  const drive = await driveService();
  if (!drive) throw new Error("Google Drive not configured.");
  const res = await drive.files.export(
    { fileId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

/**
 * Delete a Drive file (cleanup after PDF export if desired).
 */
export async function deleteDriveFile(fileId) {
  const drive = await driveService();
  if (!drive) return;
  await drive.files.delete({ fileId }).catch(() => {});
}
