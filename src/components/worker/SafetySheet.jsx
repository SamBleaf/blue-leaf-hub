// =============================================================================
// SafetySheet — worker PWA bottom sheet for signing on to a carpentry job's SWMS.
// Opened from Today's site card. Read the SWMS → tick "I've read and understood" →
// sign with a finger → recorded (once per job; a new version needs a fresh sign-on).
// This is the worker end of the liability-shield record.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { workerFetch } from "../../lib/workerFetch.js";

export default function SafetySheet({ jobId, jobLabel, onClose, onChanged }) {
  const [swms, setSwms]     = useState(null);
  const [error, setError]   = useState(null);
  const [active, setActive] = useState(null); // the SWMS being read/signed
  const [ack, setAck]       = useState(false);
  const [busy, setBusy]     = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef(null);
  const drawing   = useRef(false);

  const load = useCallback(() => {
    workerFetch(`/api/worker/jobs/${jobId}/swms`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setSwms(j.swms || []); else setError(j.error || "Couldn't load SWMS."); })
      .catch(() => setError("Network error — try again."));
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  function pos(ev, c) {
    const r = c.getBoundingClientRect();
    const t = ev.touches?.[0];
    const x = (t ? t.clientX : ev.clientX) - r.left;
    const y = (t ? t.clientY : ev.clientY) - r.top;
    return { x: x * (c.width / r.width), y: y * (c.height / r.height) };
  }
  function startDraw(ev) {
    ev.preventDefault(); const c = canvasRef.current; if (!c) return;
    drawing.current = true; const ctx = c.getContext("2d");
    const { x, y } = pos(ev, c);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y);
  }
  function moveDraw(ev) {
    if (!drawing.current) return; ev.preventDefault();
    const c = canvasRef.current; const ctx = c.getContext("2d");
    const { x, y } = pos(ev, c); ctx.lineTo(x, y); ctx.stroke(); setHasInk(true);
  }
  function endDraw() { drawing.current = false; }
  function clearCanvas() {
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d").clearRect(0, 0, c.width, c.height); setHasInk(false);
  }
  function openSwms(s) { setActive(s); setAck(false); setHasInk(false); setError(null); setTimeout(clearCanvas, 0); }

  async function sign() {
    if (!active || !ack || !hasInk) return;
    setBusy(true); setError(null);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.8);
      const r = await workerFetch(`/api/worker/swms/${active.id}/signon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carpentryJobId: jobId, signatureDataUrl: dataUrl }),
      });
      const j = await r.json();
      if (j.ok) { setActive(null); load(); onChanged?.(); }
      else setError(j.error || "Couldn't record your sign-on.");
    } catch { setError("Network error — try again."); }
    finally { setBusy(false); }
  }

  // Only REVIEWED SWMS can be signed — a draft (pending WHS review) is read-only.
  const unsigned = (swms || []).filter((s) => s.reviewStatus === "reviewed" && !s.signed).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">{active ? "Sign SWMS" : "Safety — SWMS"}</h2>
            {jobLabel && <p className="text-xs text-muted truncate">{jobLabel}</p>}
          </div>
          <button onClick={active ? () => setActive(null) : onClose} className="shrink-0 text-muted hover:text-ink text-xl leading-none" aria-label="Close">✕</button>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>}

        {!active ? (
          swms === null ? <p className="text-sm text-muted py-4">Loading…</p>
          : swms.length === 0 ? <p className="text-sm text-muted py-4">No SWMS required for this job.</p>
          : (
            <>
              <p className="text-xs text-muted mb-2">{unsigned === 0 ? "All SWMS signed — you're good to go." : `${unsigned} to sign before starting work.`}</p>
              <div className="space-y-2">
                {swms.map((s) => (
                  <button key={s.id} type="button" onClick={() => openSwms(s)} className="w-full flex items-center gap-3 p-3 rounded-lg border border-hairline bg-white text-left active:bg-page">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-ink">{s.title}</span>
                      {s.summary && <span className="block text-[11px] text-muted truncate">{s.summary}</span>}
                    </span>
                    {s.signed
                      ? <span className="text-xs font-semibold text-accent shrink-0">✓ Signed</span>
                      : s.reviewStatus === "reviewed"
                        ? <span className="text-xs font-semibold text-primary shrink-0">Sign →</span>
                        : <span className="text-[11px] text-muted shrink-0">Awaiting review</span>}
                  </button>
                ))}
              </div>
            </>
          )
        ) : (
          <div>
            {active.reviewStatus !== "reviewed" && (
              <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-[11px] text-ink mb-3">DRAFT — pending WHS review. Read only; not available to sign yet.</div>
            )}
            <div className="prose prose-sm max-w-none text-sm border border-hairline rounded-lg p-3 mb-3 max-h-[45vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: active.contentHtml || "<p>No content.</p>" }} />
            {active.reviewStatus === "reviewed" ? (
              <>
                <label className="flex items-start gap-2 text-sm mb-3">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 h-5 w-5" />
                  <span>I have read and understood this Safe Work Method Statement and will follow the controls.</span>
                </label>
                <p className="text-xs font-semibold text-muted mb-1">Sign below</p>
                <canvas
                  ref={canvasRef} width={300} height={140}
                  className="touch-none w-full max-w-[320px] rounded-lg border-2 border-hairline bg-white mb-2"
                  onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
                  onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={clearCanvas} className="rounded-lg border border-hairline px-3 py-2 text-xs font-semibold">Clear</button>
                  <button type="button" onClick={sign} disabled={!ack || !hasInk || busy} className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white disabled:opacity-40">
                    {busy ? "Signing…" : "Sign & confirm"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">This SWMS is awaiting WHS review and can&apos;t be signed yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
