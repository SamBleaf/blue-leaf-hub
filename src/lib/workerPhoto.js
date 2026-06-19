// Worker photo helpers (PWA). Downscale an image on-device, then upload it to Supabase Storage via
// the worker photo endpoint, which returns the storage PATH to persist (never base64 in the DB).
import { workerFetch } from "./workerFetch.js";

// Downscale a File to a JPEG data URL (max dimension `maxDim`, JPEG quality `quality`) so uploads
// stay small (a few hundred KB). Returns a "data:image/jpeg;base64,…" string.
export function compressImageToDataUrl(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (Math.max(width, height) > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image")); };
    img.src = url;
  });
}

// Upload a completion photo for an entity ("site_task" | "timesheet_entry"). Returns the storage
// PATH string to store. Throws with a plain-English message on failure.
export async function uploadWorkerPhoto(file, { entityType, entityId }) {
  const dataUrl = await compressImageToDataUrl(file);
  const res = await workerFetch("/api/worker/photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl, entityType, entityId, filename: file?.name || "photo.jpg" }),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok || !j.path) throw new Error(j.error || "Photo upload failed");
  return j.path;
}
