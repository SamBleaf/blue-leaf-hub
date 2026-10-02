// Read a chosen invoice file for upload to the cost-receipt scan endpoints. PDFs pass through as-is;
// images (phone photos are large) are downscaled + JPEG-compressed so the POST body stays small.
// Returns { base64, mimeType }. Shared by the Hub house view + the Worker PWA scan screen.
export function fileToUploadBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    if (!file.type?.startsWith("image/")) {
      reader.onload = () => resolve({ base64: String(reader.result).split(",")[1] || "", mimeType: file.type || "application/pdf" });
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read the image."));
      img.onload = () => {
        const maxDim = 1800;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const s = maxDim / Math.max(width, height);
          width = Math.round(width * s); height = Math.round(height * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        resolve({ base64: dataUrl.split(",")[1] || "", mimeType: "image/jpeg" });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
