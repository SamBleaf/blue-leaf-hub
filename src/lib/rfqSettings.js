const STORAGE_KEY = "blue-leaf-hub.email-signature.v1";

/** RFQ email signature logo — base64 data URL (kept out of signature JSON to save quota). */
export const SIGNATURE_LOGO_STORAGE_KEY = "blhub_signature_logo";

export const DEFAULT_EMAIL_SIGNATURE = {
  fullName: "Sam Morris",
  title: "Director",
  mobile: "0434 046 399",
  website: "https://www.blueleafbuilding.com.au",
  postalAddress: "PO Box 3225 Newton, 5074",
  logoDataUrl: "",
  legalDisclaimer:
    "The content of this email is confidential and intended for the recipient specified in message only. It is strictly forbidden to share any part of this message with any third party, without a written consent of the sender. If you received this message by mistake, please reply to this message and follow with its deletion, so that we can ensure such a mistake does not occur in the future."
};

function safeGetItem(key) {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function loadEmailSignature() {
  try {
    const legacyLogo = String(safeGetItem("signature_logo") || "").trim();
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const jsonLogo = typeof parsed.logoDataUrl === "string" ? parsed.logoDataUrl.trim() : "";
    const rest = { ...parsed };
    delete rest.logoDataUrl;
    const merged = { ...DEFAULT_EMAIL_SIGNATURE, ...rest };
    let keyLogo = String(safeGetItem(SIGNATURE_LOGO_STORAGE_KEY) || "").trim();
    if (!keyLogo && jsonLogo.startsWith("data:image/")) {
      try {
        localStorage.setItem(SIGNATURE_LOGO_STORAGE_KEY, jsonLogo);
      } catch {
        /* quota */
      }
      keyLogo = jsonLogo;
    }
    let logoDataUrl = keyLogo || jsonLogo;
    if (!logoDataUrl && legacyLogo.startsWith("data:image/")) logoDataUrl = legacyLogo;
    merged.logoDataUrl = logoDataUrl;
    return merged;
  } catch {
    return { ...DEFAULT_EMAIL_SIGNATURE };
  }
}

/** Write signature logo data URL to `blhub_signature_logo` (and legacy key) only. */
export function persistSignatureLogoDataUrl(dataUrl) {
  const v = String(dataUrl || "").trim();
  try {
    if (v) {
      localStorage.setItem(SIGNATURE_LOGO_STORAGE_KEY, v);
      localStorage.setItem("signature_logo", v);
    } else {
      localStorage.removeItem(SIGNATURE_LOGO_STORAGE_KEY);
      localStorage.removeItem("signature_logo");
    }
  } catch {
    /* quota */
  }
}

export function saveEmailSignature(patch) {
  const next = { ...loadEmailSignature(), ...patch };
  const logo = String(next.logoDataUrl || "").trim();
  persistSignatureLogoDataUrl(logo);
  const persist = { ...next };
  delete persist.logoDataUrl;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
  return { ...persist, logoDataUrl: logo };
}

export function formatSignatureFooter(sig) {
  const s = { ...DEFAULT_EMAIL_SIGNATURE, ...sig };
  const lines = [
    "",
    "Kind regards,",
    s.fullName?.trim() || DEFAULT_EMAIL_SIGNATURE.fullName,
    s.title?.trim() || DEFAULT_EMAIL_SIGNATURE.title,
    s.mobile?.trim() || "",
    s.website?.trim() || "",
    s.postalAddress?.trim() || ""
  ];
  lines.push("", s.legalDisclaimer?.trim() || DEFAULT_EMAIL_SIGNATURE.legalDisclaimer);
  return lines
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

/**
 * A signature CARD (contact block) with no "Kind regards," sign-off line — for emails whose body
 * already carries a human sign-off ("Cheers, Sam"). Appending this reads like a real email
 * signature block below the message, not a second sign-off. Used by the tender recipient blast.
 */
export function formatSignatureCard(sig) {
  const s = { ...DEFAULT_EMAIL_SIGNATURE, ...sig };
  // Each field on its own line (no separators) — matches the saved-signature look and the server
  // formatter in server/lib/emailSignature.mjs. Keep these two byte-identical.
  const lines = [
    s.fullName?.trim() || DEFAULT_EMAIL_SIGNATURE.fullName,
    s.title?.trim() || "",
    s.mobile?.trim() || "",
    s.website?.trim() || "",
    s.postalAddress?.trim() || ""
  ];
  lines.push("", s.legalDisclaimer?.trim() || DEFAULT_EMAIL_SIGNATURE.legalDisclaimer);
  return lines
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}
