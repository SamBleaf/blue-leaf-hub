import { DEFAULT_PO_TERMS } from "./poDefaultTerms.js";
import { DROPBOX_PROJECTS_JOB_PREFIX, sanitizeJobFolderDisplayName } from "./jobFolderPath.js";

const STORAGE_KEY = "blue-leaf-hub.company-settings.v1";

/** Company logo for PO PDFs — base64 data URL (not stored inside company JSON). */
export const COMPANY_LOGO_STORAGE_KEY = "blhub_company_logo";

export const DEFAULT_COMPANY_SETTINGS = {
  companyName: "Blue Leaf Building",
  abn: "",
  address: "PO Box 3225 Newton SA 5074",
  phone: "0434 046 399",
  email: "sam@blueleafbuilding.com.au",
  website: "https://www.blueleafbuilding.com.au",
  logoDataUrl: "",
  poPrefix: "BLB",
  defaultPoTerms: DEFAULT_PO_TERMS
};

function safeGetItem(key) {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function loadCompanySettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const jsonLogo = typeof parsed.logoDataUrl === "string" ? parsed.logoDataUrl.trim() : "";
    const rest = { ...parsed };
    delete rest.logoDataUrl;
    const merged = { ...DEFAULT_COMPANY_SETTINGS, ...rest };
    let keyLogo = String(safeGetItem(COMPANY_LOGO_STORAGE_KEY) || "").trim();
    if (!keyLogo && jsonLogo.startsWith("data:image/")) {
      try {
        localStorage.setItem(COMPANY_LOGO_STORAGE_KEY, jsonLogo);
      } catch {
        /* quota */
      }
      keyLogo = jsonLogo;
    }
    merged.logoDataUrl = keyLogo;
    return merged;
  } catch {
    return { ...DEFAULT_COMPANY_SETTINGS };
  }
}

/** Write logo data URL to `blhub_company_logo` only (no full company JSON write). */
export function persistCompanyLogoDataUrl(dataUrl) {
  const v = String(dataUrl || "").trim();
  try {
    if (v) localStorage.setItem(COMPANY_LOGO_STORAGE_KEY, v);
    else localStorage.removeItem(COMPANY_LOGO_STORAGE_KEY);
  } catch {
    /* quota */
  }
}

export function saveCompanySettings(patch) {
  const next = { ...loadCompanySettings(), ...patch };
  const logo = String(next.logoDataUrl || "").trim();
  persistCompanyLogoDataUrl(logo);
  const persist = { ...next };
  delete persist.logoDataUrl;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
  return { ...persist, logoDataUrl: logo };
}

/** Matches server `sharedJobRootPath` for Dropbox quote copy paths. */
export function sharedJobDropboxRootPath(address) {
  const seg = sanitizeJobFolderDisplayName(address);
  return `${DROPBOX_PROJECTS_JOB_PREFIX}/${seg}`;
}
