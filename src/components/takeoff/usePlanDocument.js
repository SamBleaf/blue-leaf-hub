// =============================================================================
// usePlanDocument — fetch a plan's bytes ONCE per open (authorised every time, progress +
// cancel + retry), open it with pdf.js, and release it on close. Plans larger than the takeoff
// envelope (server 413 TOO_LARGE, or > MAX_PAGES pages) fall back to the device viewer.
// Nothing here is cached persistently — this is not offline plan storage.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { openPdf } from "./pdfDocument.js";

export const MAX_PAGES = 100;

export function usePlanDocument(api, docId) {
  const [state, setState] = useState({ status: docId ? "loading" : "idle", progress: null, error: null, code: null, doc: null, numPages: 0 });
  const abortRef = useRef(null);
  const docRef = useRef(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!docId) { setState({ status: "idle", progress: null, error: null, code: null, doc: null, numPages: 0 }); return undefined; }
    let stop = false;
    const ctl = new AbortController();
    abortRef.current = ctl;
    setState({ status: "loading", progress: { loaded: 0, total: null }, error: null, code: null, doc: null, numPages: 0 });
    (async () => {
      const r = await api.planBytes(docId, { signal: ctl.signal, onProgress: (loaded, total) => { if (!stop) setState((s) => ({ ...s, progress: { loaded, total } })); } });
      if (stop) return;
      if (!r.ok) {
        if (r.aborted) { setState((s) => ({ ...s, status: "cancelled", error: "Download cancelled." })); return; }
        setState((s) => ({ ...s, status: r.code === "TOO_LARGE" || r.status === 413 ? "too_large" : "error", error: r.error, code: r.code || null }));
        return;
      }
      try {
        const doc = await openPdf(r.bytes);
        if (stop) { doc.destroy(); return; }
        if (doc.numPages > MAX_PAGES) {
          doc.destroy();
          setState((s) => ({ ...s, status: "too_large", error: `This plan set has ${doc.numPages} pages — more than the ${MAX_PAGES} the in-app viewer supports.` }));
          return;
        }
        docRef.current = doc;
        setState({ status: "ready", progress: null, error: null, code: null, doc, numPages: doc.numPages });
      } catch {
        if (!stop) setState((s) => ({ ...s, status: "error", error: "This file couldn't be opened as a PDF." }));
      }
    })();
    return () => {
      stop = true;
      ctl.abort();
      if (docRef.current) { docRef.current.destroy(); docRef.current = null; }
    };
  }, [api, docId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const cancel = useCallback(() => abortRef.current?.abort(), []);
  return { ...state, retry, cancel };
}
