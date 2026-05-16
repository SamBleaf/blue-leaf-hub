import { google } from "googleapis";
import { Readable } from "stream";

function driveOAuth2Client() {
  const cid = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const cs = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const rt = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!cid || !cs || !rt) return null;
  const redirect = process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim() || "http://localhost:8787/auth/drive/callback";
  const oauth2 = new google.auth.OAuth2(cid, cs, redirect);
  oauth2.setCredentials({ refresh_token: rt });
  return oauth2;
}

export function driveConfigured() {
  return Boolean(driveOAuth2Client());
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
  const auth = driveOAuth2Client();
  if (!auth) throw new Error("Google Drive not configured (missing GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN). Run: npm run auth:drive");
  const drive = google.drive({ version: "v3", auth });
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
 * Export a Google Drive file as a PDF buffer.
 */
export async function exportDriveFileAsPdf(fileId) {
  const auth = driveOAuth2Client();
  if (!auth) throw new Error("Google Drive not configured.");
  const drive = google.drive({ version: "v3", auth });
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
  const auth = driveOAuth2Client();
  if (!auth) return;
  const drive = google.drive({ version: "v3", auth });
  await drive.files.delete({ fileId }).catch(() => {});
}
