/**
 * brandingAssets.mjs
 * Centralised helper for fetching BLB brand assets from Supabase Storage.
 *
 * Bucket: "branding"
 * Primary logo for emails: BLB_Icon_Blue.png (transparent bg, blue icon — renders
 *   well on white email backgrounds)
 * Primary logo white: BLB_Primary_Logo_White.png (for dark surfaces / app header)
 *
 * Cached in memory for LOGO_CACHE_TTL_MS (10 min) to avoid repeated storage calls
 * on every email send.
 */

export const BRANDING_BUCKET = "branding";
export const BRANDING_EMAIL_LOGO_PATH  = "BLB_Icon_Blue.png";
export const BRANDING_PRIMARY_LOGO_PATH = "BLB_Primary_Logo_White.png";

let _emailLogoCache   = null;   // { dataBase64: string, ts: number }
let _primaryLogoCache = null;
const LOGO_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch the email-safe BLB logo (blue icon, transparent bg) from Supabase Storage.
 * Returns a base64 data-URL string, or "" if unavailable.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb — service-role client
 */
export async function getBrandingEmailLogo(sb) {
  if (!sb) return "";
  const now = Date.now();
  if (_emailLogoCache && now - _emailLogoCache.ts < LOGO_CACHE_TTL_MS) {
    return _emailLogoCache.dataBase64;
  }
  try {
    const { data, error } = await sb.storage.from(BRANDING_BUCKET).download(BRANDING_EMAIL_LOGO_PATH);
    if (error || !data) return "";
    const buf = Buffer.from(await data.arrayBuffer());
    const dataBase64 = `data:image/png;base64,${buf.toString("base64")}`;
    _emailLogoCache = { dataBase64, ts: now };
    return dataBase64;
  } catch (e) {
    console.warn("[brandingAssets] Failed to fetch email logo:", e?.message || e);
    return "";
  }
}

/**
 * Fetch the primary BLB logo (white, for dark surfaces) from Supabase Storage.
 * Returns a base64 data-URL string, or "" if unavailable.
 */
export async function getBrandingPrimaryLogo(sb) {
  if (!sb) return "";
  const now = Date.now();
  if (_primaryLogoCache && now - _primaryLogoCache.ts < LOGO_CACHE_TTL_MS) {
    return _primaryLogoCache.dataBase64;
  }
  try {
    const { data, error } = await sb.storage.from(BRANDING_BUCKET).download(BRANDING_PRIMARY_LOGO_PATH);
    if (error || !data) return "";
    const buf = Buffer.from(await data.arrayBuffer());
    const dataBase64 = `data:image/png;base64,${buf.toString("base64")}`;
    _primaryLogoCache = { dataBase64, ts: now };
    return dataBase64;
  } catch (e) {
    console.warn("[brandingAssets] Failed to fetch primary logo:", e?.message || e);
    return "";
  }
}

/** Invalidate cached logos (e.g. after a new upload). */
export function invalidateBrandingLogoCache() {
  _emailLogoCache = null;
  _primaryLogoCache = null;
}
