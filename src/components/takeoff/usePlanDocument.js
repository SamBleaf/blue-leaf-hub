// =============================================================================
// usePlanDocument — open a plan with pdf.js and release it on close. A plan already opened on this device is
// reopened from its device copy with no download (HUB 021) — only when the authorised workspace snapshot lists
// that document with the same stored hash and size. Otherwise its bytes are downloaded (authorised, with
// progress + cancel + retry) and kept on the device for next time. Plans larger than the takeoff envelope
// (server 413 TOO_LARGE, or > MAX_PAGES pages) fall back to the device viewer.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { openPdf } from "./pdfDocument.js";
import { dropCachedPlan, getCachedPlan, putCachedPlan } from "../../lib/takeoffPlanCache.js";

export const MAX_PAGES = 100;

/** @param {{contentSha256?: string|null, byteSize?: number|null}|null} docInfo the snapshot's record of this plan */
export function usePlanDocument(api, docId, docInfo = null) {
  // forId: the plan this state belongs to. For the one render after docId changes (before the effect below runs) the
  // state still holds the OLD plan — reported as loading, so nothing measures on the old PDF or clamps the new page
  // to the old page count (HUB 023: Back from the page picker after choosing another plan)
  const [state, setState] = useState({ status: docId ? "loading" : "idle", progress: null, error: null, code: null, doc: null, numPages: 0, source: null, forId: docId || null });
  const abortRef = useRef(null);
  const docRef = useRef(null);
  // read through a ref: a snapshot that anchors a legacy plan's hash after its first open must not re-open it
  const infoRef = useRef(docInfo);
  infoRef.current = docInfo;
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!docId) { setState({ status: "idle", progress: null, error: null, code: null, doc: null, numPages: 0, source: null, forId: null }); return undefined; }
    let stop = false;
    const ctl = new AbortController();
    abortRef.current = ctl;
    const info = { id: docId, contentSha256: infoRef.current?.contentSha256 ?? null, byteSize: infoRef.current?.byteSize ?? null };
    setState({ status: "loading", progress: null, error: null, code: null, doc: null, numPages: 0, source: "device", forId: docId });
    const ready = (doc) => {
      if (doc.numPages > MAX_PAGES) {
        doc.destroy();
        setState((s) => ({ ...s, status: "too_large", error: `This plan set has ${doc.numPages} pages — more than the ${MAX_PAGES} the in-app viewer supports.` }));
        return false;
      }
      docRef.current = doc;
      setState((s) => ({ status: "ready", progress: null, error: null, code: null, doc, numPages: doc.numPages, source: s.source, forId: docId }));
      return true;
    };
    (async () => {
      // 1. this device's copy of exactly this plan version — no network request at all
      const local = await getCachedPlan(info);
      if (stop) return;
      if (local) {
        try {
          const doc = await openPdf(local);
          if (stop) { doc.destroy(); return; }
          ready(doc);
          return;
        } catch { dropCachedPlan(docId); /* a damaged copy is dropped and the plan downloaded */ }
        if (stop) return;
      }
      // 2. download (first open on this device, a new version, or no device storage)
      setState((s) => ({ ...s, progress: { loaded: 0, total: null }, source: "network" }));
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
        if (!ready(doc)) return;
      } catch {
        if (!stop) setState((s) => ({ ...s, status: "error", error: "This file couldn't be opened as a PDF." }));
        return;
      }
      // keep it for next time — only a complete download whose hash agrees with the record (or anchors a legacy one)
      const sha = info.contentSha256 || r.contentSha256;
      const agrees = !info.contentSha256 || !r.contentSha256 || info.contentSha256 === r.contentSha256;
      if (sha && agrees && (r.total == null || r.total === r.bytes.length)) putCachedPlan(info, r.bytes, sha);
    })();
    return () => {
      stop = true;
      ctl.abort();
      if (docRef.current) { docRef.current.destroy(); docRef.current = null; }
    };
  }, [api, docId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const cancel = useCallback(() => abortRef.current?.abort(), []);
  if ((state.forId || null) !== (docId || null)) {
    return { status: docId ? "loading" : "idle", progress: null, error: null, code: null, doc: null, numPages: 0, source: null, forId: docId || null, retry, cancel };
  }
  return { ...state, retry, cancel };
}
