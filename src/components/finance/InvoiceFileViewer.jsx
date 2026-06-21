import { useEffect, useState } from "react";
import { authFetch } from "../../lib/authFetch.js";

// View the original invoice file inline while approving / matching it to a job.
// Fetches the file as a blob (Bearer-authed) and renders it from an objectURL —
// an <iframe src> / <img src> can't carry the auth header, so we can't point them
// straight at the endpoint. PDFs → iframe, images → img, HEIC/other → download.
export default function InvoiceFileViewer({ docId, label = "View invoice", className }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(null);
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Revoke any object URL we created when the component unmounts (the approval
  // queue is a high-volume hot path — don't leak multi-MB blobs).
  useEffect(() => () => { setUrl((u) => { if (u) URL.revokeObjectURL(u); return null; }); }, []);

  async function openViewer() {
    setOpen(true); setLoading(true); setError(null);
    setUrl((u) => { if (u) URL.revokeObjectURL(u); return null; }); // revoke prior before fetching a new one
    try {
      const res = await authFetch(`/api/finance/documents/${docId}/file`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Could not load file (${res.status}).`);
      }
      const blob = await res.blob();
      setType(blob.type || "");
      setUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e.message || "Could not load the file.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setError(null);
  }

  const isPdf = type.startsWith("application/pdf");
  const isImage = type.startsWith("image/") && !type.includes("heic") && !type.includes("heif");

  return (
    <>
      <button
        type="button"
        onClick={openViewer}
        className={className || "text-xs font-medium text-primary underline hover:no-underline"}
      >
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={close} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-hairline shrink-0">
              <span className="text-sm font-semibold text-ink">Invoice</span>
              <div className="flex items-center gap-4">
                {url && <a href={url} download className="text-xs text-primary underline">Download</a>}
                <button type="button" onClick={close} className="text-muted text-xl leading-none">×</button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 overflow-auto flex items-center justify-center">
              {loading && <p className="text-sm text-muted">Loading…</p>}
              {error && <p className="text-sm text-red-600 px-6 text-center">{error}</p>}
              {url && !loading && !error && (
                isPdf ? (
                  <iframe title="Invoice" src={url} className="w-full h-full border-0" />
                ) : isImage ? (
                  <img src={url} alt="Invoice" className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="text-center px-6">
                    <p className="text-sm text-muted mb-2">Preview isn&apos;t available for this file type.</p>
                    <a href={url} download className="text-sm text-primary underline">Download to view</a>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
