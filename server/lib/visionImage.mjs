/** Anthropic vision API accepts only these image media types. */
export const ANTHROPIC_IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const HEIC_UNSUPPORTED_MESSAGE =
  "This photo is HEIC/HEIF, which AI analysis cannot read directly. Re-upload the photo (we convert HEIC to JPEG automatically), or on iPhone use Settings → Camera → Formats → Most Compatible.";

const EXT_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const MIME_ALIASES = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};

/** Detect format from magic bytes. Returns null for HEIC/HEIF or unknown. */
export function sniffImageMediaType(buffer) {
  const u8 = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (u8.length < 12) return null;

  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return "image/jpeg";
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return "image/png";
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return "image/gif";
  if (
    u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
    u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50
  ) {
    return "image/webp";
  }

  // ISO BMFF (HEIC, HEIF, AVIF, etc.)
  if (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) {
    const brand = u8.subarray(8, 16).toString("ascii").toLowerCase();
    if (brand.includes("heic") || brand.includes("heix") || brand.includes("hevc") || brand.includes("mif1")) {
      return null;
    }
    if (brand.includes("avif")) return null;
  }

  return null;
}

export function isHeicMimeOrPath(mimeType, storagePath) {
  const m = (mimeType || "").toLowerCase();
  if (m.includes("heic") || m.includes("heif")) return true;
  const ext = storagePath?.split(".").pop()?.toLowerCase();
  return ext === "heic" || ext === "heif";
}

/**
 * Resolve media_type for Anthropic vision from bytes + metadata.
 * Prefers magic-byte sniffing over stored mime_type.
 * @returns {string|null} supported media type, or null if HEIC/unknown
 */
export function resolveVisionMediaType(buffer, mimeType, storagePath) {
  const sniffed = sniffImageMediaType(buffer);
  if (sniffed) return sniffed;

  if (isHeicMimeOrPath(mimeType, storagePath)) return null;

  const normalised = (mimeType || "").toLowerCase();
  if (ANTHROPIC_IMAGE_MEDIA_TYPES.has(normalised)) return normalised;
  if (MIME_ALIASES[normalised]) return MIME_ALIASES[normalised];

  const ext = storagePath?.split(".").pop()?.toLowerCase();
  if (ext && EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];

  return null;
}

export function assertVisionMediaType(mediaType) {
  if (!ANTHROPIC_IMAGE_MEDIA_TYPES.has(mediaType)) {
    throw new Error(`Unsupported image type "${mediaType}". Use JPEG, PNG, GIF, or WebP.`);
  }
}
