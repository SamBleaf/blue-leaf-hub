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
 * The TEAM DEFAULT signature (company_profile.email_signature) — inherited by accounts that haven't
 * set their own. Returns null when nothing is saved (or the column/table isn't there yet).
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

/**
 * Resolve the signature for a SENDING user: their own (user_profiles.email_signature), else the team
 * default (company_profile), else null. This is what every send path should use so each account's
 * emails sign as that person.
 */
export async function getUserSignature(sb, userId) {
  const s = sb || getServiceSupabase();
  if (!s) return null;
  if (userId) {
    try {
      const { data } = await s.from("user_profiles").select("email_signature").eq("id", userId).maybeSingle();
      const own = data?.email_signature;
      if (own && typeof own === "object") return own;
    } catch { /* column missing pre-migration 158 — fall through to the team default */ }
  }
  return getCompanySignature(s);
}

/** Signature CARD (no "Kind regards") for the sending user, or null when nothing is saved. */
export async function getUserSignatureCard(sb, userId) {
  const sig = await getUserSignature(sb, userId);
  return sig ? formatSignatureCard(sig) : null;
}

/** Full "Kind regards" footer for the sending user, or null when nothing is saved. */
export async function getUserSignatureFooter(sb, userId) {
  const sig = await getUserSignature(sb, userId);
  return sig ? formatSignatureFooter(sig) : null;
}
