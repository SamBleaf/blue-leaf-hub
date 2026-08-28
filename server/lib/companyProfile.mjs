// companyProfile.mjs — resolve + download the Blue Leaf company-profile PDF from a Dropbox FOLDER
// (the *_COMPANY_PROFILE_PATH env vars point at a folder, e.g. the NEW JOB TEMPLATE folder). Lists
// the folder, prefers a file whose name looks like a company profile, else the first PDF. Fail-soft:
// returns null on any misconfig/miss so email sending never breaks over a missing attachment.
// Reusable across the stage email modules (concept now; designer/winning-offer when those land).
import {
  dropboxConfigured, getDropboxAccessToken, listFolderAllEntries, dropboxDownloadBuffer,
} from "./dropboxClient.mjs";

const PROFILE_HINT = /company.*profile|profile.*company|blue.*leaf.*profile/i;

/**
 * Download the company-profile PDF from a Dropbox folder path. Returns an attachment
 * ({ filename, content:Buffer, mimeType }) or null when unconfigured / nothing found.
 * @param {string} folderPath  Dropbox folder path from a *_COMPANY_PROFILE_PATH env var.
 */
export async function loadCompanyProfilePdfFromDropbox(folderPath) {
  const path = String(folderPath || "").trim();
  if (!path) return null;
  if (!dropboxConfigured()) { console.warn("[company-profile] Dropbox not configured — skipping attachment"); return null; }
  try {
    const token = await getDropboxAccessToken();
    const entries = await listFolderAllEntries(token, path);
    const pdfs = (entries || []).filter((e) => e?.[".tag"] === "file" && /\.pdf$/i.test(e?.name || ""));
    if (!pdfs.length) { console.warn(`[company-profile] no PDF found in ${path}`); return null; }
    const chosen = pdfs.find((e) => PROFILE_HINT.test(e.name)) || pdfs[0];
    const filePath = chosen.path_display || chosen.path_lower || `${path}/${chosen.name}`;
    const buffer = await dropboxDownloadBuffer(token, filePath);
    return { filename: chosen.name || "Blue-Leaf-Building-Company-Profile.pdf", content: buffer, mimeType: "application/pdf" };
  } catch (e) {
    console.warn("[company-profile] load failed:", e?.message || e);
    return null;
  }
}
