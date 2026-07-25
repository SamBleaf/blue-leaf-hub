/**
 * emailSignature.mjs — server-side email signature (single source of truth).
 *
 * The signature text is stored on public.company_profile.email_signature (migration 157) so every
 * send path uses the SAME saved signature regardless of which browser fired it. This module ports
 * the pure formatters from src/lib/rfqSettings.js (keep them byte-identical) and adds server loaders
 * that read the saved signature and format it. The logo image is NOT stored here — it lives in the
 * "branding" storage bucket (see brandingAssets.mjs getBrandingEmailLogo).
 */
import { getServiceSupabase } from "./supabaseService.mjs";

export const DEFAULT_EMAIL_SIGNATURE = {
  fullName: "Sam Morris",
  title: "Director",
  mobile: "0434 046 399",
  website: "https://www.blueleafbuilding.com.au",
  postalAddress: "PO Box 3225 Newton, 5074",
  legalDisclaimer:
    "The content of this email is confidential and intended for the recipient specified in message only. It is strictly forbidden to share any part of this message with any third party, without a written consent of the sender. If you received this message by mistake, please reply to this message and follow with its deletion, so that we can ensure such a mistake does not occur in the future."
};

const dropDoubleBlanks = (lines) =>
  lines.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n").trim();

/** Full sign-off block ("Kind regards, …") — used by reminders and reply/query emails. */
export function formatSignatureFooter(sig) {
  const s = { ...DEFAULT_EMAIL_SIGNATURE, ...(sig || {}) };
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
  return dropDoubleBlanks(lines);
}

/**
 * Signature CARD — the contact block WITHOUT a "Kind regards," sign-off line, for emails whose body
 * already carries a human sign-off ("Cheers, Sam"). Each field on its own line (no separators), so
 * it reads like a real signature block below the message. Used by the tender recipient blast.
 */
export function formatSignatureCard(sig) {
  const s = { ...DEFAULT_EMAIL_SIGNATURE, ...(sig || {}) };
  const lines = [
    s.fullName?.trim() || DEFAULT_EMAIL_SIGNATURE.fullName,
    s.title?.trim() || "",
    s.mobile?.trim() || "",
    s.website?.trim() || "",
    s.postalAddress?.trim() || ""
  ];
  lines.push("", s.legalDisclaimer?.trim() || DEFAULT_EMAIL_SIGNATURE.legalDisclaimer);
  return dropDoubleBlanks(lines);
}

/**
 * Read the saved signature object from company_profile.email_signature.
 * Returns null when nothing is saved (or the column/table isn't there yet) so callers can fall back.
 */
export async function getCompanySignature(sb) {
  const s = sb || getServiceSupabase();
  if (!s) return null;
  try {
    // Deterministic .order so this reader targets the SAME single-company row the settings PUT writes.
    const { data, error } = await s.from("company_profile").select("email_signature").order("id", { ascending: true }).limit(1);
    if (error) return null; // pre-migration or read error — caller falls back
    const sig = data?.[0]?.email_signature;
    return sig && typeof sig === "object" ? sig : null;
  } catch {
    return null;
  }
}

/** Signature CARD from the saved company signature, or null when none is saved. */
export async function getCompanySignatureCard(sb) {
  const sig = await getCompanySignature(sb);
  return sig ? formatSignatureCard(sig) : null;
}

/** Full sign-off footer from the saved company signature, or null when none is saved. */
export async function getCompanySignatureFooter(sb) {
  const sig = await getCompanySignature(sb);
  return sig ? formatSignatureFooter(sig) : null;
}
